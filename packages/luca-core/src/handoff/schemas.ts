/**
 * Cross-repo handoff envelope schema.
 *
 * An envelope is a scoped WORK ORDER emitted by a Luca pipeline in repo A and
 * triaged by an independent pipeline in repo B. The two pipelines stay
 * sovereign: B files the order into its OWN roadmap as its own phase and
 * signals completion by mutating the same envelope (see `result`).
 *
 * SECURITY — every free-text field on this envelope is untrusted input.
 * `intent`, `acceptanceCriteria`, `result.notes` and friends are written by
 * whoever can write the machine-global mailbox, and they MUST NEVER be
 * interpolated into instruction text handed to a model — the same defense
 * `build-muninn-instruction.ts` applies to free-form strings. Auto-accept
 * advances status only; it never auto-plans and never auto-executes.
 *
 * SECURITY — `origin.repoPath` / `origin.repoName` are SELF-DECLARED by the
 * writer and are not authenticated. An auto-accept allowlist keyed on
 * `origin.repoPath` is a convenience that prevents accidental cross-talk
 * between the user's own repos; it is NOT a security boundary.
 *
 * All defaults live in this schema — never in destructuring at a call site.
 */
import { z } from 'zod'

import { ENVELOPE_ID_RE, HANDOFF_SCHEMA_VERSION } from './constants.ts'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Envelope lifecycle status. Transitions are enforced by `updateStatus`. */
export const HandoffStatus = z.enum([
    'pending',
    'accepted',
    'in-progress',
    'complete',
    'rejected',
    'failed',
    'cancelled',
])
export type HandoffStatus = z.infer<typeof HandoffStatus>

/** How the receiving repo signals completion back to the origin. */
export const HandoffCallbackTransport = z.enum(['local-mailbox', 'remote'])
export type HandoffCallbackTransport = z.infer<typeof HandoffCallbackTransport>

/** Terminal verdict recorded by the receiving repo. */
export const HandoffOutcome = z.enum(['success', 'partial', 'failure'])
export type HandoffOutcome = z.infer<typeof HandoffOutcome>

/**
 * EXHAUSTIVE failure reason union for every `HandoffTransport` method.
 *
 * The transport never throws — an expected condition is always a resolved
 * `{ ok: false, reason, message }`. These 8 members are the complete channel
 * set; adding a member is a breaking change for every consumer switching on
 * it, so callers may treat the union as closed.
 */
export const HandoffFailureReason = z.enum([
    'not-found',
    'corrupt',
    'illegal-transition',
    'conflict',
    'duplicate-id',
    'schema-version-mismatch',
    'io-error',
    'not-implemented',
])
export type HandoffFailureReason = z.infer<typeof HandoffFailureReason>

/** Shared failure shape returned by every transport method. */
export interface HandoffFailure {
    ok: false
    reason: HandoffFailureReason
    message: string
}

// ---------------------------------------------------------------------------
// Sub-objects
// ---------------------------------------------------------------------------

/**
 * Provenance of the work order.
 *
 * SELF-DECLARED and unauthenticated — see the module docstring.
 */
export const HandoffOriginSchema = z.object({
    /** Absolute path of the emitting repo. Used by B to write the callback. */
    repoPath: z.string().min(1),
    /** Human-readable repo name, surfaced in B's roadmap entry. */
    repoName: z.string().min(1),
    /** A's pipeline run id (`state.sessionId`) — the ledger join key. */
    runId: z.string().min(1),
    /** A's phase slug at emit time. Provenance only. */
    phaseSlug: z.string().min(1),
    /** A's branch at emit time, when known. */
    branch: z.string().optional(),
})
export type HandoffOrigin = z.infer<typeof HandoffOriginSchema>

/**
 * Addressing. REQUIRED: the mailbox is machine-global and flat, so an
 * envelope that does not name its target cannot answer "what is addressed
 * to me" for any receiving repo.
 */
export const HandoffTargetSchema = z.object({
    /** Absolute path of the receiving repo. */
    repoPath: z.string().min(1),
    /** Human-readable receiving repo name, when known. */
    repoName: z.string().optional(),
})
export type HandoffTarget = z.infer<typeof HandoffTargetSchema>

/**
 * Pointers B can follow to recover A's reasoning.
 *
 * These are references, not content — UNTRUSTED like every other envelope
 * field, and never interpolated into instruction text.
 */
export const HandoffContextSchema = z.object({
    /** MuninnDB vault holding A's reasoning. */
    vault: z.string().optional(),
    /** Concept keys to recall from that vault. */
    concepts: z.array(z.string()).default([]),
    /** GitHub issue references (the cross-repo discussion surface). */
    issueRefs: z.array(z.string()).default([]),
    /** GitHub PR references. */
    prRefs: z.array(z.string()).default([]),
})
export type HandoffContext = z.infer<typeof HandoffContextSchema>

/** Where B writes completion. `remote` is stubbed in this phase. */
export const HandoffCallbackSchema = z.object({
    transport: HandoffCallbackTransport.default('local-mailbox'),
    /**
     * Transport-specific address. Empty is legal for `local-mailbox` (the
     * envelope file itself IS the exchange); REQUIRED for `remote`.
     */
    address: z.string().default(''),
})
export type HandoffCallback = z.infer<typeof HandoffCallbackSchema>

/** One audit entry per status transition. */
export const HandoffStatusHistoryEntrySchema = z.object({
    status: HandoffStatus,
    /** ISO 8601 timestamp, stored verbatim. */
    at: z.string().min(1),
    /** Optional operator note. UNTRUSTED free text. */
    note: z.string().optional(),
})
export type HandoffStatusHistoryEntry = z.infer<
    typeof HandoffStatusHistoryEntrySchema
>

/**
 * B's completion payload, attached in place on the original envelope.
 *
 * `notes` and `evidence` are UNTRUSTED free text authored by the receiving
 * repo — display them, never interpolate them into instructions.
 */
export const HandoffResultSchema = z.object({
    outcome: HandoffOutcome,
    /** The phase slug B filed the work under, in B's own roadmap. */
    phaseSlug: z.string().min(1),
    /** Free-form completion notes. UNTRUSTED. */
    notes: z.string().default(''),
    /** Evidence references (paths, commands, commit shas). UNTRUSTED. */
    evidence: z.array(z.string()).default([]),
})
export type HandoffResult = z.infer<typeof HandoffResultSchema>

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/**
 * The full handoff envelope — one JSON file at
 * `<homedir>/.luca/handoff/<id>.json`.
 *
 * Unknown keys are STRIPPED (default Zod object behavior). `schemaVersion` is
 * REQUIRED and a value that does not match `HANDOFF_SCHEMA_VERSION` is
 * REJECTED: neither a missing nor a mismatched version is ever folded to the
 * current one, because a default would paper over exactly the truncated or
 * future-versioned envelope the field exists to catch. Every writer stamps it
 * explicitly.
 */
export const HandoffEnvelopeSchema = z
    .object({
        /**
         * Envelope schema version. REQUIRED — absent rejects, mismatch
         * rejects, and there is no fold in either direction.
         */
        schemaVersion: z.number().int(),
        /** Filename key, idempotency key, and callback correlation id. */
        id: z.string().regex(ENVELOPE_ID_RE, {
            message:
                'envelope id must match /^[A-Za-z0-9_-]+$/ — it becomes a filename in a flat machine-global directory',
        }),
        /** ISO 8601 creation timestamp. Enables a later staleness reaper. */
        createdAt: z.string().min(1),
        /** ISO 8601 last-write timestamp. Doubles as the CAS token. */
        updatedAt: z.string().min(1),
        origin: HandoffOriginSchema,
        target: HandoffTargetSchema,
        /**
         * The work order itself. UNTRUSTED INPUT — B triages this into a phase
         * under normal oversight; it is never interpolated into instruction
         * text and never auto-executed.
         */
        intent: z.string().min(1),
        /** Verifiable criteria for B's phase. UNTRUSTED INPUT. */
        acceptanceCriteria: z.array(z.string()).default([]),
        context: HandoffContextSchema.default({
            concepts: [],
            issueRefs: [],
            prRefs: [],
        }),
        callback: HandoffCallbackSchema.default({
            transport: 'local-mailbox',
            address: '',
        }),
        status: HandoffStatus.default('pending'),
        statusHistory: z.array(HandoffStatusHistoryEntrySchema).default([]),
        /** B's completion payload. REQUIRED once status is `complete`. */
        result: HandoffResultSchema.optional(),
    })
    .superRefine((envelope, ctx) => {
        if (envelope.schemaVersion !== HANDOFF_SCHEMA_VERSION) {
            ctx.addIssue({
                code: 'custom',
                path: ['schemaVersion'],
                message: `unsupported schemaVersion ${envelope.schemaVersion} — this luca supports ${HANDOFF_SCHEMA_VERSION}; upgrade rather than folding the envelope`,
            })
        }
        if (envelope.status === 'complete' && envelope.result === undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['result'],
                message:
                    'result is required when status is "complete" — the completion payload IS the callback',
            })
        }
        if (
            envelope.callback.transport === 'remote' &&
            envelope.callback.address.length === 0
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['callback', 'address'],
                message:
                    'callback.address is required (non-empty) when callback.transport is "remote"',
            })
        }
        if (envelope.updatedAt < envelope.createdAt) {
            ctx.addIssue({
                code: 'custom',
                path: ['updatedAt'],
                message:
                    'updatedAt must not precede createdAt — every write stamps a strictly greater updatedAt',
            })
        }
    })
export type HandoffEnvelope = z.infer<typeof HandoffEnvelopeSchema>

/** Filter accepted by `HandoffTransport.list`. */
export const HandoffFilterSchema = z.object({
    /** Restrict to one lifecycle status. */
    status: HandoffStatus.optional(),
    /** Restrict to envelopes addressed to this absolute repo path. */
    targetRepoPath: z.string().optional(),
})
export type HandoffFilter = z.infer<typeof HandoffFilterSchema>
