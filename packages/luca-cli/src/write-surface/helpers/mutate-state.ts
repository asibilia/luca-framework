import { existsSync } from 'node:fs'
import { open, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

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

/**
 * Serialized, strict read-modify-write of `.luca/state.json`.
 *
 * Holds the exclusive lock across the whole read→modify→write so a stale-state
 * write can never revert another writer's update mid-run — the v13 corruption
 * where `pipelineStep`/`currentPhase` silently reverted under concurrent agents.
 *
 * STRICT: refuses to mutate when `state.json` is missing or malformed instead
 * of silently writing schema defaults (which would overwrite an active
 * workflow with `idle`/`currentPhase: 0`). Permissive read paths still use
 * `loadCurrentState`; this is exclusively for mutations.
 */
export async function mutateState(
    cwd: string,
    mutator: (state: LucaState) => LucaState
): Promise<LucaState> {
    const statePath = join(cwd, '.luca', 'state.json')
    return withStateLock(cwd, async () => {
        if (!existsSync(statePath)) {
            throw new Error(
                'cannot mutate .luca/state.json: file missing (workflow not initialized — run `luca init`)'
            )
        }
        let current: LucaState
        try {
            current = lucaStateSchemaTolerant.parse(
                JSON.parse(await readFile(statePath, 'utf-8'))
            )
        } catch {
            throw new Error(
                'cannot mutate .luca/state.json: file is malformed — refusing to overwrite (resolve by hand or `luca workflow reset --confirm`)'
            )
        }
        const next = mutator(current)
        await writeAtomicFile(statePath, JSON.stringify(next, null, 2) + '\n')
        return next
    })
}
