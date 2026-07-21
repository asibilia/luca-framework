/**
 * Local mailbox transport over `<homedir>/.luca/handoff/`.
 *
 * The on-disk mailbox is the SOURCE OF TRUTH (context L2) — the phase-5 hub
 * daemon is an accelerator only, so every operation here is a plain filesystem
 * operation with no daemon dependency.
 *
 * Shape notes:
 *   - A factory closure returning a narrow interface, mirroring
 *     `createPipelineActorHandle` (`state/machine/actor-handle.ts`). No classes.
 *   - Methods are `async` and RESOLVE their results; the filesystem calls inside
 *     stay synchronous. The Promise surface is what the phase-5 hub needs, and
 *     nothing here benefits from an async fs layer.
 *   - The transport NEVER throws for an expected condition. Every failure is a
 *     resolved `{ ok: false, reason, message }` drawn from the EXHAUSTIVE
 *     8-member `HandoffFailureReason` union. This deliberately deviates from
 *     `verification-result.ts:112-118`, which rethrows on a failed write.
 *   - NO LOCK FILE (context E4). One file per envelope, created with
 *     `openSync(path, 'wx')` for create-exclusivity, and mutated under an
 *     optimistic compare-and-set on `updatedAt` (see `UpdateStatusOptions` for
 *     what that CAS does and does NOT guarantee).
 *   - Atomic mutation is re-implemented inline (tmp -> `renameSync` -> `rmSync`
 *     on error) because luca-core must not import from luca-cli. Unlike the
 *     luca-cli original — serialized by the pipeline lock — this mailbox is
 *     lock-free and machine-global, so the staging file is UNIQUE per write
 *     and created with `O_EXCL` (see `atomicWrite`).
 *
 * SECURITY — envelope free text (`intent`, `acceptanceCriteria`, `result.notes`)
 * is UNTRUSTED input (context D3). This module only stores and returns it; it is
 * never interpolated into instruction text.
 */
import { randomUUID } from 'node:crypto'
import {
    chmodSync,
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'

import { HANDOFF_SCHEMA_VERSION, MAILBOX_DIR_MODE } from '../constants.ts'
import { isLegalHandoffTransition } from '../configs/handoff-transitions.ts'
import {
    HandoffEnvelopeSchema,
    type HandoffEnvelope,
    type HandoffFailure,
    type HandoffFilter,
    type HandoffStatus,
} from '../schemas.ts'
import type {
    HandoffListResult,
    HandoffReadResult,
    HandoffSendResult,
    HandoffStatusResult,
    HandoffTransport,
    UpdateStatusOptions,
} from '../transport-contract.ts'

import { mailboxDirFor, mailboxPathFor } from './mailbox-path-for.ts'

/** Caller-supplied homedir — never an implicit `homedir()`. */
export interface LocalMailboxTransportOptions {
    homedir: string
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function fail(
    reason: HandoffFailure['reason'],
    message: string
): HandoffFailure {
    return { ok: false, reason, message }
}

/** Compact one-line summary of Zod issues, safe to surface to the CLI. */
function summarizeIssues(error: { issues: Array<{ path: PropertyKey[] | readonly PropertyKey[]; message: string }> }): string {
    return error.issues
        .map((issue) => {
            const path = issue.path.map(String).join('.')
            return path.length > 0 ? `${path}: ${issue.message}` : issue.message
        })
        .join('; ')
}

function errnoOf(err: unknown): string {
    return typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : ''
}

function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

/**
 * Parse one envelope file, returning `null` for anything unreadable or
 * schema-invalid. Mirrors `readVerificationResult` (`verification-result.ts:70,
 * 81-83`) so a crash mid-rename cannot make `list` throw (risk G5).
 */
function parseEnvelopeFile(path: string): HandoffEnvelope | null {
    try {
        const parsed = HandoffEnvelopeSchema.safeParse(
            JSON.parse(readFileSync(path, 'utf-8'))
        )
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

/** Serialize an envelope the one way this module ever writes it. */
function serialize(envelope: HandoffEnvelope): string {
    return `${JSON.stringify(envelope, null, 2)}\n`
}

/**
 * Inline atomic replace: staging file -> rename, removing the staging file on
 * any failure.
 *
 * The staging path is UNIQUE per write (`pid` + `randomUUID()`) and created
 * with `openSync(..., 'wx')` (`O_CREAT|O_EXCL`). Both properties matter here
 * and not in the luca-cli original this was copied from:
 *   - The mailbox is LOCK-FREE and machine-global, so two concurrent
 *     `updateStatus` calls can both pass CAS. On a shared fixed `<id>.json.tmp`
 *     writer B would truncate the file while A was mid-write and A's rename
 *     would publish a TORN envelope. A per-write staging name makes the two
 *     writes disjoint — the loser is a lost update, never a corrupt file.
 *   - A predictable staging name is also plantable: a pre-existing symlink at
 *     `<id>.json.tmp` would be followed by `writeFileSync`. `wx` fails EEXIST
 *     on an existing entry (symlink included) instead of following it.
 *
 * `list` only reads `*.json`, so a staging file left by a crash is invisible.
 */
function atomicWrite(path: string, contents: string): HandoffFailure | null {
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`

    let fd: number
    try {
        fd = openSync(tmp, 'wx', 0o600)
    } catch (err) {
        return fail('io-error', `failed to stage ${path}: ${messageOf(err)}`)
    }

    try {
        writeFileSync(fd, contents, 'utf-8')
    } catch (err) {
        closeQuietly(fd)
        rmSync(tmp, { force: true })
        return fail('io-error', `failed to write ${path}: ${messageOf(err)}`)
    }
    closeQuietly(fd)

    try {
        renameSync(tmp, path)
    } catch (err) {
        rmSync(tmp, { force: true })
        return fail('io-error', `failed to write ${path}: ${messageOf(err)}`)
    }
    return null
}

/** Close a descriptor, ignoring a close-time failure. */
function closeQuietly(fd: number): void {
    try {
        closeSync(fd)
    } catch {
        // Nothing actionable: the content is already flushed, or the write
        // failure reported by the caller is the outcome that matters.
    }
}

/** ISO timestamp strictly greater than `previous`. */
function nextUpdatedAt(previous: string): string {
    const previousMs = Date.parse(previous)
    const now = Date.now()
    const stamp =
        Number.isNaN(previousMs) || now > previousMs ? now : previousMs + 1
    return new Date(stamp).toISOString()
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocalMailboxTransport(
    opts: LocalMailboxTransportOptions
): HandoffTransport {
    const dir = mailboxDirFor(opts)

    /**
     * Read + classify one envelope by id. Shared by `read` and `updateStatus`
     * so both classify a missing / corrupt / wrong-version file identically.
     */
    function loadEnvelope(id: string): HandoffReadResult {
        const path = mailboxPathFor(id, opts)
        // A null path means the id failed ENVELOPE_ID_RE. Report `not-found`
        // and nothing else: the caller must not learn whether the traversal
        // target exists.
        if (path === null) return fail('not-found', `no envelope for id "${id}"`)
        if (!existsSync(path)) {
            return fail('not-found', `no envelope for id "${id}"`)
        }

        let raw: unknown
        try {
            raw = JSON.parse(readFileSync(path, 'utf-8'))
        } catch (err) {
            return fail(
                'corrupt',
                `envelope "${id}" is not readable JSON: ${messageOf(err)}`
            )
        }

        const version =
            typeof raw === 'object' && raw !== null && 'schemaVersion' in raw
                ? (raw as { schemaVersion: unknown }).schemaVersion
                : undefined
        if (typeof version === 'number' && version !== HANDOFF_SCHEMA_VERSION) {
            return fail(
                'schema-version-mismatch',
                `envelope "${id}" has schemaVersion ${version}; this luca supports ${HANDOFF_SCHEMA_VERSION}`
            )
        }

        const parsed = HandoffEnvelopeSchema.safeParse(raw)
        if (!parsed.success) {
            return fail(
                'corrupt',
                `envelope "${id}" failed schema validation — ${summarizeIssues(parsed.error)}`
            )
        }
        return { ok: true, envelope: parsed.data }
    }

    return {
        async send(envelope: unknown): Promise<HandoffSendResult> {
            // Validate BEFORE any filesystem work: schema-validated writes are
            // the invariant that justifies a CLI-only mailbox. An invalid
            // envelope writes nothing at all.
            const parsed = HandoffEnvelopeSchema.safeParse(envelope)
            if (!parsed.success) {
                return fail(
                    'corrupt',
                    `envelope failed schema validation — ${summarizeIssues(parsed.error)}`
                )
            }
            const accepted = parsed.data

            const path = mailboxPathFor(accepted.id, opts)
            if (path === null) {
                return fail(
                    'not-found',
                    `no envelope for id "${accepted.id}"`
                )
            }

            try {
                mkdirSync(dir, { recursive: true, mode: MAILBOX_DIR_MODE })
                // Tighten the PARENT (`<home>/.luca`) too. It usually
                // pre-exists at 0755 from `luca init`, and a group- or
                // world-writable parent lets a non-owner rename or replace the
                // whole `handoff` directory — which would defeat the leaf mode
                // entirely.
                chmodSync(dirname(dir), MAILBOX_DIR_MODE)
                // Re-assert the mode: `mkdirSync` is a no-op when the directory
                // already exists, and the mailbox is an unauthenticated trust
                // boundary that must stay owner-only (context L4).
                chmodSync(dir, MAILBOX_DIR_MODE)
            } catch (err) {
                return fail(
                    'io-error',
                    `failed to prepare mailbox ${dir}: ${messageOf(err)}`
                )
            }

            let fd: number
            try {
                // 'wx' fails with EEXIST rather than truncating: create
                // exclusivity without a lock file (context E4).
                fd = openSync(path, 'wx', 0o600)
            } catch (err) {
                if (errnoOf(err) === 'EEXIST') {
                    return fail(
                        'duplicate-id',
                        `envelope "${accepted.id}" already exists in the mailbox`
                    )
                }
                return fail(
                    'io-error',
                    `failed to create ${path}: ${messageOf(err)}`
                )
            }

            try {
                writeFileSync(fd, serialize(accepted), 'utf-8')
            } catch (err) {
                return fail(
                    'io-error',
                    `failed to write ${path}: ${messageOf(err)}`
                )
            } finally {
                closeQuietly(fd)
            }

            return { ok: true, envelope: accepted }
        },

        async list(filter?: HandoffFilter): Promise<HandoffListResult> {
            let entries: string[]
            try {
                entries = readdirSync(dir)
            } catch (err) {
                // A missing mailbox directory is the day-one state on every
                // fresh machine — only `send` creates it, so `list` must not
                // throw ENOENT and must not create anything.
                if (errnoOf(err) === 'ENOENT') return { ok: true, envelopes: [] }
                return fail(
                    'io-error',
                    `failed to list mailbox ${dir}: ${messageOf(err)}`
                )
            }

            const envelopes: HandoffEnvelope[] = []
            for (const entry of entries) {
                if (!entry.endsWith('.json')) continue
                const envelope = parseEnvelopeFile(`${dir}/${entry}`)
                // Skip, never throw: a crash mid-rename can leave a partial
                // file behind and `list` still has to answer.
                if (envelope === null) continue
                if (filter?.status && envelope.status !== filter.status) continue
                if (
                    filter?.targetRepoPath &&
                    envelope.target.repoPath !== filter.targetRepoPath
                ) {
                    continue
                }
                envelopes.push(envelope)
            }
            // ORDERING GUARANTEE: `createdAt` ascending (oldest first), with
            // `id` as the tiebreak so the order is total and stable. Raw
            // `readdirSync` order is filesystem-defined and would make any
            // multi-envelope caller (the phase-2 CLI listing, the phase-5 hub)
            // non-deterministic.
            envelopes.sort((a, b) => {
                if (a.createdAt !== b.createdAt) {
                    return a.createdAt < b.createdAt ? -1 : 1
                }
                if (a.id === b.id) return 0
                return a.id < b.id ? -1 : 1
            })
            return { ok: true, envelopes }
        },

        async read(id: string): Promise<HandoffReadResult> {
            return loadEnvelope(id)
        },

        async updateStatus(
            id: string,
            to: HandoffStatus,
            options: UpdateStatusOptions
        ): Promise<HandoffStatusResult> {
            const path = mailboxPathFor(id, opts)
            if (path === null) {
                return fail('not-found', `no envelope for id "${id}"`)
            }

            const loaded = loadEnvelope(id)
            if (!loaded.ok) return loaded
            const current = loaded.envelope

            if (!isLegalHandoffTransition(current.status, to)) {
                return fail(
                    'illegal-transition',
                    `cannot move envelope "${id}" from "${current.status}" to "${to}"`
                )
            }

            if (current.updatedAt !== options.expectedUpdatedAt) {
                return fail(
                    'conflict',
                    `envelope "${id}" changed since it was read (expected updatedAt "${options.expectedUpdatedAt}", found "${current.updatedAt}")`
                )
            }

            if (to === 'complete' && options.result === undefined) {
                return fail(
                    'corrupt',
                    'result is required when transitioning to "complete" — the completion payload IS the callback'
                )
            }

            const stampedAt = nextUpdatedAt(current.updatedAt)
            // Mutate the ORIGINAL envelope in place (context D1): one file is
            // the whole exchange, so completion attaches `result` here rather
            // than emitting a reply envelope.
            const candidate: HandoffEnvelope = {
                ...current,
                status: to,
                updatedAt: stampedAt,
                result: options.result ?? current.result,
                statusHistory: [
                    ...current.statusHistory,
                    options.note === undefined
                        ? { status: to, at: stampedAt }
                        : { status: to, at: stampedAt, note: options.note },
                ],
            }

            const revalidated = HandoffEnvelopeSchema.safeParse(candidate)
            if (!revalidated.success) {
                return fail(
                    'corrupt',
                    `updated envelope "${id}" failed schema validation — ${summarizeIssues(revalidated.error)}`
                )
            }

            const writeFailure = atomicWrite(path, serialize(revalidated.data))
            if (writeFailure) return writeFailure

            return { ok: true, envelope: revalidated.data }
        },
    }
}
