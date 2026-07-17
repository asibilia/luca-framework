/**
 * Pipeline lock — single-flight protection for `.luca/state.json`.
 *
 * The inner-pipeline crash-recovery lock at `.luca/lock.json` (NOT to be
 * confused with the higher-level `.luca/orchestrator.lock` defined in
 * `docs/orchestrator-design.md §2.5 / §5b`). The two locks have distinct
 * scopes:
 *
 *   - `.luca/orchestrator.lock`  — outer "only one /luca iteration per
 *                                  repo at a time" single-flight lock,
 *                                  owned by the orchestrator agent.
 *   - `.luca/lock.json`          — inner pipeline lock. Acquired by
 *                                  any process that mutates state.json
 *                                  (CLI write commands, the MCP server,
 *                                  the legacy harness during the
 *                                  transition window). Prevents two
 *                                  processes from racing on the same
 *                                  state.json read-modify-write cycle.
 *
 * This module owns the **inner** lock. Ported from
 * `packages/luca-mastracode/src/tools/pipeline-lock.ts`. Changes from the
 * mastracode original:
 *
 *   - Pure functions over a caller-supplied `cwd` (no implicit
 *     `process.cwd()`).
 *   - No Mastra `createTool` wrapper — that delivery vehicle is dead
 *     post-Phase-H. The functions are the contract; CLI / hook surfaces
 *     wrap them.
 *   - Atomic acquisition via `openSync(p, 'wx')` (`O_EXCL`-equivalent).
 *     The mastracode version used `atomicWriteSync` which is a write,
 *     not a create — racy against a concurrent acquirer.
 *   - The `recover` / `update` action surfaces from the mastracode tool
 *     are NOT ported; recovery is handled by the orchestrator's state
 *     machine + checkpoint/resume protocol, not by reading the inner
 *     lock. The inner lock only protects state.json read-modify-write
 *     atomicity.
 *
 * Audit ref CF2.
 */
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    unlinkSync,
    writeSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { lucaRootPaths } from '../luca-dir/index.ts'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * The on-disk shape of `.luca/lock.json`. Matches the inner-lock contract
 * referenced by `docs/orchestrator-design.md §2.5` (which calls out
 * `state.lockPid` as the in-state mirror of this file's `pid` field).
 */
export const PipelineLockSchema = z.object({
    pid: z.number().int().positive(),
    acquired_at: z.string().min(1),
    run_id: z.string().min(1),
    /** Best-effort hostname (omitted when `os.hostname()` is unavailable). */
    host: z.string().optional(),
})
export type PipelineLock = z.infer<typeof PipelineLockSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lockPath(cwd: string): string {
    return join(cwd, lucaRootPaths.lock)
}

/**
 * Best-effort hostname capture. Returns `undefined` when `os.hostname()`
 * throws (some restricted execution environments) so callers can omit
 * the field rather than carrying an empty string.
 */
function safeHostname(): string | undefined {
    try {
        const name = hostname()
        return typeof name === 'string' && name.length > 0 ? name : undefined
    } catch {
        return undefined
    }
}

/**
 * PID-liveness probe. `process.kill(pid, 0)` does not actually deliver a
 * signal — it just probes whether the kernel will accept one. Returns
 * `true` for a live PID, `false` for a dead PID. Treats `EPERM`
 * (PID-exists-but-owned-by-another-user) as live (conservative — better
 * to refuse a force-unlock than to clobber a cross-user run).
 */
export function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch (err) {
        // `ESRCH` means "no such process" — definitively dead.
        // `EPERM` means "exists, not yours" — treat as live (conservative).
        // Any other error is treated as dead so a corrupt-lock recovery
        // path is reachable.
        const code = (err as NodeJS.ErrnoException).code
        return code === 'EPERM'
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the current pipeline-lock contents, or `null` when no lock is
 * held or the file is corrupt. Pure read — does not touch the lock file.
 */
export function readLock(cwd: string): PipelineLock | null {
    const p = lockPath(cwd)
    if (!existsSync(p)) return null
    try {
        const raw = readFileSync(p, 'utf-8')
        const parsed = PipelineLockSchema.safeParse(JSON.parse(raw))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

export interface AcquireOptions {
    cwd: string
    /** Run identifier the lock will be stamped with. */
    runId: string
}

export type AcquireResult =
    | { ok: true; lock: PipelineLock }
    | {
          ok: false
          reason: 'held'
          /** The current holder, when readable. */
          holder: PipelineLock | null
      }

/**
 * Acquire the pipeline lock. Atomic — uses `openSync(p, 'wx')` so two
 * concurrent acquirers cannot both succeed (the second one's `open` will
 * throw `EEXIST`).
 *
 * Returns `{ ok: true, lock }` on success. On contention, returns
 * `{ ok: false, reason: 'held', holder }` — the caller decides whether
 * to refuse, retry, or escalate to `forceUnlock`. **Never throws on
 * contention** — that's the whole point of the structured return.
 *
 * Caller is responsible for calling {@link release} when the
 * read-modify-write cycle completes. A process crash leaves a stale
 * lock that {@link forceUnlock} can clear after PID-liveness checks.
 */
export function acquire(opts: AcquireOptions): AcquireResult {
    const p = lockPath(opts.cwd)
    mkdirSync(dirname(p), { recursive: true })

    const host = safeHostname()
    const lock: PipelineLock = {
        pid: process.pid,
        acquired_at: new Date().toISOString(),
        run_id: opts.runId,
        ...(host !== undefined ? { host } : {}),
    }
    const payload = `${JSON.stringify(lock, null, 2)}\n`

    let fd: number
    try {
        // 'wx' = open for writing, fail if it exists. Atomic create-or-fail.
        fd = openSync(p, 'wx')
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EEXIST') {
            return { ok: false, reason: 'held', holder: readLock(opts.cwd) }
        }
        throw err
    }
    try {
        writeSync(fd, payload)
    } finally {
        closeSync(fd)
    }
    return { ok: true, lock }
}

export interface ReleaseOptions {
    cwd: string
    /**
     * Run identifier expected to own the lock. Release only proceeds
     * when the on-disk lock's `run_id` matches — protects against a
     * stale release in a process that thinks it still owns the lock.
     */
    runId: string
}

export type ReleaseResult =
    | { ok: true; released: true }
    | { ok: false; reason: 'absent' | 'mismatched-run-id' }

/**
 * Release the pipeline lock IF the on-disk `run_id` matches the
 * supplied `runId`. Non-throwing, idempotent: returns
 * `{ ok: false, reason: 'absent' }` when no lock is present (treat as
 * success in most callers).
 */
export function release(opts: ReleaseOptions): ReleaseResult {
    const p = lockPath(opts.cwd)
    if (!existsSync(p)) return { ok: false, reason: 'absent' }
    const holder = readLock(opts.cwd)
    if (holder && holder.run_id !== opts.runId) {
        return { ok: false, reason: 'mismatched-run-id' }
    }
    try {
        unlinkSync(p)
    } catch {
        // Race with another release / force-unlock — treat as released.
    }
    return { ok: true, released: true }
}

export interface ForceUnlockOptions {
    cwd: string
    /**
     * When provided, force-unlock proceeds unconditionally if the lock
     * file's `run_id` matches. Without `runId`, the lock holder's PID
     * must be dead (per `process.kill(pid, 0)`) to proceed — refuses
     * to clobber a live run.
     */
    runId?: string
}

export type ForceUnlockResult =
    | { ok: true; released: true; previous: PipelineLock | null }
    | {
          ok: false
          reason: 'absent' | 'live-holder'
          holder: PipelineLock | null
      }

/**
 * Force-unlock the pipeline lock. Two safe paths:
 *   1. `runId` matches the on-disk `run_id` — operator knows the run.
 *   2. The holder's PID is verifiably dead — stale lock recovery.
 *
 * Refuses (returns `{ ok: false, reason: 'live-holder' }`) when neither
 * condition holds — clobbering a live run would silently corrupt
 * `state.json`.
 */
export function forceUnlock(opts: ForceUnlockOptions): ForceUnlockResult {
    const p = lockPath(opts.cwd)
    if (!existsSync(p)) return { ok: false, reason: 'absent', holder: null }
    const holder = readLock(opts.cwd)

    // Path 1: runId matches.
    if (opts.runId && holder && holder.run_id === opts.runId) {
        unlinkSync(p)
        return { ok: true, released: true, previous: holder }
    }

    // Path 2: PID is dead.
    if (holder && !isPidAlive(holder.pid)) {
        unlinkSync(p)
        return { ok: true, released: true, previous: holder }
    }

    // Corrupt/unreadable lock file — clear it.
    if (!holder) {
        unlinkSync(p)
        return { ok: true, released: true, previous: null }
    }

    return { ok: false, reason: 'live-holder', holder }
}
