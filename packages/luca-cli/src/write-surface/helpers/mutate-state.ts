import { existsSync } from 'node:fs'
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { lucaStateSchemaTolerant, type LucaState } from '@alecsibilia/luca-core'

import { writeAtomicFile } from './write-atomic.ts'

const LOCK_TIMEOUT_MS = 5000
const LOCK_POLL_MS = 40
// A lock older than this is presumed abandoned by a crashed holder and
// stolen, so a dead process can never deadlock state mutations forever.
const STALE_LOCK_MS = 15000

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function lockPathFor(cwd: string): string {
    return join(cwd, '.luca', 'state.json.lock')
}

/**
 * Acquire an exclusive on-disk lock by creating the lock file with the `wx`
 * (exclusive create) flag. Retries on contention, steals a stale lock, and
 * times out rather than hanging.
 */
async function acquireLock(lockPath: string): Promise<void> {
    // Ensure `.luca/` exists before the exclusive create — otherwise `open(…,
    // 'wx')` throws ENOENT (not EEXIST) for callers operating on a workflow
    // that was never initialized (e.g. `luca workflow reset` recreating
    // bookkeeping from scratch). mkdir recursive is idempotent and cheap.
    await mkdir(dirname(lockPath), { recursive: true })
    const deadline = Date.now() + LOCK_TIMEOUT_MS
    for (;;) {
        try {
            const fh = await open(lockPath, 'wx')
            await fh.writeFile(`${process.pid}`)
            await fh.close()
            return
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
            // Lock held — steal it if the holder is stale (likely crashed).
            try {
                const st = await stat(lockPath)
                if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
                    await rm(lockPath, { force: true })
                    continue
                }
            } catch {
                // Lock vanished between EEXIST and stat — just retry.
            }
            if (Date.now() > deadline) {
                throw new Error(
                    `could not acquire ${lockPath} within ${LOCK_TIMEOUT_MS}ms (another luca process is mutating state)`
                )
            }
            await sleep(LOCK_POLL_MS)
        }
    }
}

/**
 * Run `fn` while holding the exclusive `.luca/state.json` lock, releasing it
 * even on throw. Use for any operation that writes `state.json` so concurrent
 * luca invocations (orchestrator + subagent, or parallel subagents) serialize
 * instead of clobbering each other.
 */
export async function withStateLock<T>(
    cwd: string,
    fn: () => Promise<T>
): Promise<T> {
    const lockPath = lockPathFor(cwd)
    await acquireLock(lockPath)
    try {
        return await fn()
    } finally {
        await rm(lockPath, { force: true })
    }
}

export interface MutateStateOptions {
    /**
     * Base state to use when `state.json` is ABSENT (ENOENT). Lets the
     * legitimate bootstrap path (`luca state advance` on a fresh repo, `luca
     * workflow reset`) create the file from a known default instead of
     * failing. Has NO effect when the file is present-but-malformed — that is
     * always the corruption case and always throws. Omit to require an
     * already-initialized workflow.
     */
    bootstrapIfMissing?: LucaState
}

/**
 * The minimal key whose presence distinguishes a real, fully-serialized
 * `state.json` from a truncated/empty fragment. Every legitimate write emits
 * `pipelineStep`; a partial write that lands as `{}` (or any object lacking
 * it) is treated as corruption rather than silently defaulting to
 * `idle`/`currentPhase: 0` and overwriting an active workflow.
 */
function hasRequiredStateKeys(raw: unknown): boolean {
    return (
        typeof raw === 'object' &&
        raw !== null &&
        !Array.isArray(raw) &&
        'pipelineStep' in raw
    )
}

/**
 * Serialized, strict read-modify-write of `.luca/state.json`.
 *
 * Holds the exclusive lock across the whole read→modify→write so a stale-state
 * write can never revert another writer's update mid-run — the v13 corruption
 * where `pipelineStep`/`currentPhase` silently reverted under concurrent agents.
 *
 * STRICT: a present-but-incomplete/malformed file always throws rather than
 * silently writing schema defaults (which would overwrite an active workflow
 * with `idle`/`currentPhase: 0`). "Strict" is enforced BEFORE schema defaults
 * apply — the raw JSON must contain the required keys (see
 * `hasRequiredStateKeys`), otherwise the tolerant schema's `.default()`s would
 * paper over a truncated write. An ABSENT file is a different case: it throws
 * unless the caller opts into `bootstrapIfMissing`, which is reserved for the
 * legitimate initialize/reset paths. Permissive read paths still use
 * `loadCurrentState`; this is exclusively for mutations.
 */
export async function mutateState(
    cwd: string,
    mutator: (state: LucaState) => LucaState,
    opts: MutateStateOptions = {}
): Promise<LucaState> {
    const statePath = join(cwd, '.luca', 'state.json')
    return withStateLock(cwd, async () => {
        let current: LucaState
        if (!existsSync(statePath)) {
            if (opts.bootstrapIfMissing === undefined) {
                throw new Error(
                    'cannot mutate .luca/state.json: file missing (workflow not initialized — run `luca init`)'
                )
            }
            current = opts.bootstrapIfMissing
        } else {
            let raw: unknown
            try {
                raw = JSON.parse(await readFile(statePath, 'utf-8'))
            } catch {
                throw new Error(
                    'cannot mutate .luca/state.json: file is malformed JSON — refusing to overwrite (resolve by hand or `luca workflow reset --confirm`)'
                )
            }
            // Strict: validate required keys are PRESENT in the raw object
            // before the tolerant schema applies its defaults. A truncated
            // write that parses as `{}` lacks `pipelineStep` and must be
            // rejected, not silently reset to idle/0.
            if (!hasRequiredStateKeys(raw)) {
                throw new Error(
                    'cannot mutate .luca/state.json: file is incomplete (missing required `pipelineStep`) — refusing to overwrite an active workflow with defaults (resolve by hand or `luca workflow reset --confirm`)'
                )
            }
            current = lucaStateSchemaTolerant.parse(raw)
        }
        const next = mutator(current)
        await writeAtomicFile(statePath, JSON.stringify(next, null, 2) + '\n')
        return next
    })
}
