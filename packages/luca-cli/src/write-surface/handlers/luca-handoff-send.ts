/**
 * `luca handoff send` — build, stamp and post a cross-repo handoff envelope.
 *
 * SECURITY — the `inputSchema` below IS the strip-and-stamp allowlist. The
 * caller supplies a JSON payload via `--file`, and that payload is UNTRUSTED:
 * a confused-deputy caller would otherwise hand us `status: 'complete'`, a
 * fabricated `statusHistory`, a `result`, or an `id` of `../../evil` and have
 * the CLI's own authority write it into the machine-global mailbox. Zod strips
 * unknown keys by default, so declaring ONLY the five author-supplied fields
 * (`target`, `intent`, `acceptanceCriteria`, `context`, `callback`) drops every
 * other key on the floor. The lifecycle fields are then stamped HERE, by us:
 * `schemaVersion`, `id`, `createdAt`/`updatedAt`, `status: 'pending'`,
 * `statusHistory: []` and `origin`.
 *
 * `intent` / `acceptanceCriteria` remain untrusted free text — they are stored
 * and displayed, never interpolated into instruction text.
 */
import { basename, join } from 'node:path'

import {
    HandoffCallbackSchema,
    HandoffContextSchema,
    HandoffTargetSchema,
    HANDOFF_SCHEMA_VERSION,
    generateEnvelopeId,
} from '@alecsibilia/luca-core/handoff'
import { loadCurrentState, resolveActiveSlug } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import {
    formatHandoffFailure,
    resolveHandoffTransport,
} from '../helpers/handoff-transport.ts'

/**
 * Provenance fallbacks.
 *
 * `HandoffOriginSchema` requires `runId` and `phaseSlug` at `min(1)`, but both
 * are genuinely unresolvable in legitimate situations: a repo that has never
 * run a pipeline has no `state.sessionId`, and `currentPhase = 0` has no phase
 * slug. Refusing the send there would make `handoff send` unusable exactly
 * where cross-repo delegation is most likely (a fresh repo asking another repo
 * for work). Provenance is advisory — `origin` is SELF-DECLARED and
 * unauthenticated either way — so an explicit, greppable sentinel is strictly
 * better than a refusal or an empty string that fails schema validation.
 */
const UNKNOWN_RUN_ID = 'unknown-run'
const UNRESOLVED_PHASE_SLUG = 'unresolved-phase'

/** Upper bound on `target.repoPath`; well above any real filesystem path. */
const MAX_REPO_PATH_LENGTH = 1024

/** C0 control characters plus DEL. Non-global — used with `.test`. */
const CONTROL_CHAR_TEST_RE = /[\u0000-\u001f\u007f]/

/**
 * The send-side constraint on the target repo path.
 *
 * `HandoffTargetSchema.repoPath` is only `z.string().min(1)` in luca-core, and
 * this value is SENDER-CONTROLLED free text that the receiving repo's `luca
 * handoff list` renders into its triage view. That view is deliberately
 * low-exposure — `intent` and `acceptanceCriteria` are withheld from it — so a
 * multi-line or absurdly long value would put attacker-authored,
 * instruction-shaped lines back into exactly the surface built to exclude
 * them. Constraining it HERE, at the only sanctioned way into the mailbox, is
 * the boundary half of the fix (`toSingleLine` is the rendering half, which
 * also covers envelopes written before this constraint existed).
 *
 * Extended LOCALLY rather than in `packages/luca-core/src/handoff/schemas.ts`:
 * that module is committed and out of this phase's scope fence, and the
 * constraint is a CLI-boundary policy, not a storage-format invariant.
 */
const SendTargetSchema = HandoffTargetSchema.extend({
    repoPath: z
        .string()
        .min(1)
        .max(
            MAX_REPO_PATH_LENGTH,
            `target.repoPath must be at most ${MAX_REPO_PATH_LENGTH} characters`
        )
        .refine((value) => value.startsWith('/'), {
            message:
                'target.repoPath must be an absolute path (start with "/") — the mailbox is machine-global, so a relative path names nothing',
        })
        .refine((value) => !CONTROL_CHAR_TEST_RE.test(value), {
            message:
                'target.repoPath must not contain control characters (newlines included) — it is rendered into the receiving repo triage view',
        }),
})

const inputSchema = z.object({
    target: SendTargetSchema.describe(
        'Receiving repo: { repoPath (absolute, single-line), repoName? }. REQUIRED — the mailbox is flat and machine-global, so an envelope that does not name its target cannot be found by anyone.'
    ),
    intent: z
        .string()
        .min(1)
        .describe(
            'The work order itself. UNTRUSTED free text — the receiving repo triages it into a phase under normal oversight; it is never auto-executed.'
        ),
    acceptanceCriteria: z
        .array(z.string())
        .default([])
        .describe(
            'Verifiable criteria for the receiving repo. UNTRUSTED free text.'
        ),
    context: HandoffContextSchema.default({
        concepts: [],
        issueRefs: [],
        prRefs: [],
    }).describe(
        'Pointers (vault, concepts, issue/PR refs) the receiver can follow to recover the sender reasoning. References only, never content.'
    ),
    callback: HandoffCallbackSchema.default({
        transport: 'local-mailbox',
        address: '',
    }).describe(
        'Where the receiver signals completion. `local-mailbox` mutates this same envelope in place; `remote` requires a non-empty address.'
    ),
})

/** Current git branch, or `undefined` when it cannot be read. */
async function readCurrentBranch(cwd: string): Promise<string | undefined> {
    try {
        const proc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd,
            stdout: 'pipe',
            stderr: 'ignore',
        })
        const code = await proc.exited
        if (code !== 0) return undefined
        const out = (await new Response(proc.stdout).text()).trim()
        return out.length > 0 ? out : undefined
    } catch {
        return undefined
    }
}

export const lucaHandoffSendTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_handoff_send',
        description:
            'Post a cross-repo handoff envelope into the machine-global mailbox at ~/.luca/handoff/. Caller-supplied lifecycle fields (id, status, statusHistory, result) are IGNORED — they are stamped by the CLI. Phase-agnostic.',
        inputSchema,
        async handler(args, ctx) {
            const repoName = basename(ctx.cwd) || 'repo'

            // Provenance. Both reads fail soft: a missing or truncated state
            // file must not block the send (see the fallbacks above).
            let runId = UNKNOWN_RUN_ID
            let phaseSlug = UNRESOLVED_PHASE_SLUG
            try {
                const state = await loadCurrentState({ cwd: ctx.cwd })
                if (
                    typeof state.sessionId === 'string' &&
                    state.sessionId.length > 0
                ) {
                    runId = state.sessionId
                }
                const slug = resolveActiveSlug(state)
                if (slug.ok) phaseSlug = slug.slug
            } catch {
                // Keep the sentinels — provenance is advisory.
            }

            const branch = await readCurrentBranch(ctx.cwd)

            const now = new Date().toISOString()
            const id = generateEnvelopeId(repoName)

            const envelope = {
                // ---- stamped by the CLI, never by the caller ---------------
                schemaVersion: HANDOFF_SCHEMA_VERSION,
                id,
                createdAt: now,
                updatedAt: now,
                status: 'pending' as const,
                statusHistory: [],
                origin: {
                    repoPath: ctx.cwd,
                    repoName,
                    runId,
                    phaseSlug,
                    ...(branch === undefined ? {} : { branch }),
                },
                // ---- author-supplied, already stripped by inputSchema ------
                target: args.target,
                intent: args.intent,
                acceptanceCriteria: args.acceptanceCriteria,
                context: args.context,
                callback: args.callback,
            }

            const { transport, mailboxDir } = resolveHandoffTransport({
                homedir: ctx.homedir,
            })
            const sent = await transport.send(envelope)
            if (!sent.ok) {
                return {
                    content: [
                        { type: 'text', text: formatHandoffFailure(sent) },
                    ],
                    isError: true,
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text:
                            `handoff sent: ${sent.envelope.id}\n` +
                            `  path:   ${join(mailboxDir, `${sent.envelope.id}.json`)}\n` +
                            `  target: ${sent.envelope.target.repoPath}\n` +
                            `  status: ${sent.envelope.status}`,
                    },
                ],
            }
        },
    }
