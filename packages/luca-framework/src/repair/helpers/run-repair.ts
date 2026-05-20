import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { lucaStateSchema } from '@alecsibilia/luca-core'

export interface RunRepairOptions {
    cwd: string
    log?: (msg: string) => void
}

export interface RunRepairResult {
    /** Human-readable actions actually taken (e.g. "cleared stale lock"). */
    actions: string[]
    /** Problems diagnosed but NOT auto-fixed (e.g. invalid state.json). */
    errors: string[]
}

interface LockFile {
    pid?: number
    acquired_at?: string
}

/**
 * Inspect the .luca/ directory for known recoverable issues and fix them
 * deterministically.
 *
 * Phase 2 scope:
 *   - Clear lock.json when its PID is not running anymore (stale).
 *   - Validate state.json against lucaStateSchema; report errors without
 *     auto-fixing (state schema corruption is too risky to repair blindly).
 *
 * Does not throw — accumulates findings in the returned result.
 */
export async function runRepair(
    opts: RunRepairOptions,
): Promise<RunRepairResult> {
    const log = opts.log ?? (() => {})
    const lucaDir = join(opts.cwd, '.luca')

    if (!existsSync(lucaDir)) {
        return { actions: [], errors: [] }
    }

    const actions: string[] = []
    const errors: string[] = []

    // ── Lock handling ────────────────────────────────────────────────────────
    const lockPath = join(lucaDir, 'lock.json')
    if (existsSync(lockPath)) {
        try {
            const raw = await readFile(lockPath, 'utf-8')
            const lock = JSON.parse(raw) as LockFile

            if (typeof lock.pid === 'number' && isPidRunning(lock.pid)) {
                const msg = `lock is held by running PID ${lock.pid}`
                actions.push(msg)
                log(msg)
            } else {
                await rm(lockPath, { force: true })
                const msg = `cleared stale lock (PID ${lock.pid ?? 'unknown'})`
                actions.push(msg)
                log(msg)
            }
        } catch (err) {
            const msg = `failed to read lock.json: ${(err as Error).message}`
            errors.push(msg)
            log(msg)
        }
    }

    // ── state.json validation ────────────────────────────────────────────────
    const statePath = join(lucaDir, 'state.json')
    if (existsSync(statePath)) {
        try {
            const raw = JSON.parse(await readFile(statePath, 'utf-8'))
            const parsed = lucaStateSchema.safeParse(raw)
            if (!parsed.success) {
                const msg = `state.json failed schema validation: ${parsed.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; ')}`
                errors.push(msg)
                log(msg)
            }
        } catch (err) {
            errors.push(
                `state.json could not be parsed as JSON: ${(err as Error).message}`,
            )
        }
    }

    return { actions, errors }
}

/**
 * Cross-platform check for "is this PID currently a running process?"
 *
 * Sending signal 0 doesn't actually deliver a signal — it just runs the
 * permission and existence checks. Throws ESRCH if the PID doesn't exist,
 * EPERM if it exists but we can't signal it (we treat that as "running").
 */
function isPidRunning(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch (err) {
        // EPERM means the process exists but is owned by someone else —
        // still "running" for our purposes.
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return true
        return false
    }
}
