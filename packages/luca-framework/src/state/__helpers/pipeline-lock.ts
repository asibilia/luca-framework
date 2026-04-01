/**
 * Pipeline lock file manager — functional API for concurrent session
 * prevention and crash recovery.
 *
 * The lock file (`.planning/.pipeline-lock.json`) is atomically written
 * on every pipeline step transition and deleted on clean exit. If a session
 * crashes, the lock file survives intact for deterministic recovery.
 *
 * All functions use try-catch and never throw — they return Result<T> or
 * null for graceful degradation in the shell environment.
 *
 * @module luca-state/pipeline-lock
 */
import { rename, unlink } from "node:fs/promises";

import {
  pipelineLockSchema,
  PIPELINE_LOCK_PATH,
} from "../__schemas/pipeline-lock.schemas";
import { sanitizeJsonParse } from "../../utils/sanitize";

import type { PipelineLock } from "../__schemas/pipeline-lock.schemas";
import type { Result } from "../types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Tmp file path for atomic writes (write + rename pattern). */
const TMP_PATH = `${PIPELINE_LOCK_PATH}.tmp`;

/** 24-hour staleness threshold in milliseconds. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if a process with the given PID is alive.
 *
 * Uses `process.kill(pid, 0)` which sends signal 0 (no-op) to check
 * process existence. Catches ESRCH (no such process) to detect dead PIDs.
 *
 * @param pid - Process ID to check
 * @returns true if the process is alive, false if dead or inaccessible
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    // ESRCH = no such process (dead)
    // EPERM = process exists but we lack permission (alive)
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    return false;
  }
}

/**
 * Atomically write JSON data to the lock file path.
 *
 * Uses the write-to-tmp + rename pattern so the lock file is never
 * partially written. If the process crashes mid-write, only the tmp
 * file is corrupted — the previous lock file remains intact.
 *
 * @param data - The lock data to write
 */
async function atomicWriteLock(data: PipelineLock): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await Bun.write(TMP_PATH, json);
  await rename(TMP_PATH, PIPELINE_LOCK_PATH);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Acquire the pipeline lock for the current session.
 *
 * Creates the lock file atomically. If a live lock already exists
 * (live PID, not stale), returns a conflict error. Stale locks are
 * automatically cleared before acquiring.
 *
 * @param sessionId - Unique session identifier
 * @param pipelineStep - Current pipeline step name (e.g., "init", "routed")
 * @param phaseStep - Current phase sub-step (e.g., "", "discuss", "execute")
 * @param phaseId - Current phase number (optional)
 * @returns Result with the created lock on success, or error on conflict
 *
 * @example
 * ```typescript
 * const result = await acquireLock("abc123", "init", "");
 * if (result.success) {
 *   console.log("Lock acquired:", result.data.pid);
 * } else {
 *   console.error("Conflict:", result.error);
 * }
 * ```
 */
export async function acquireLock(
  sessionId: string,
  pipelineStep: string,
  phaseStep: string,
  phaseId?: number,
): Promise<Result<PipelineLock>> {
  try {
    // Check for existing lock
    const status = await checkLockStatus();
    if (status.status === "live") {
      return {
        success: false,
        error: `Live lock exists: PID ${status.lock?.pid}, session ${status.lock?.session_id}. ${status.reason ?? ""}`,
      };
    }

    // Stale lock — clear it before acquiring
    if (status.status === "stale") {
      await releaseLock();
    }

    const now = new Date().toISOString();
    const lockData: PipelineLock = pipelineLockSchema.parse({
      session_id: sessionId,
      pid: process.pid,
      started_at: now,
      pipeline_step: pipelineStep,
      phase_step: phaseStep,
      phase_id: phaseId,
      lock_acquired_at: now,
    });

    await atomicWriteLock(lockData);
    return { success: true, data: lockData };
  } catch (err) {
    return {
      success: false,
      error: `Failed to acquire lock: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Update the pipeline lock with new step information.
 *
 * Reads the existing lock, applies the provided patch fields, and
 * writes back atomically. If no lock exists, returns an error.
 *
 * @param patch - Partial fields to update (pipeline_step, phase_step, phase_id)
 * @returns Result with the updated lock on success, or error on failure
 *
 * @example
 * ```typescript
 * const result = await updateLock({
 *   pipeline_step: "phase-loop",
 *   phase_step: "execute",
 *   phase_id: 259,
 * });
 * ```
 */
export async function updateLock(
  patch: Partial<
    Pick<PipelineLock, "pipeline_step" | "phase_step" | "phase_id">
  >,
): Promise<Result<PipelineLock>> {
  try {
    const existing = await readLock();
    if (!existing) {
      return { success: false, error: "No lock file to update" };
    }

    const updated: PipelineLock = {
      ...existing,
      ...patch,
      lock_acquired_at: new Date().toISOString(),
    };

    await atomicWriteLock(updated);
    return { success: true, data: updated };
  } catch (err) {
    return {
      success: false,
      error: `Failed to update lock: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Release the pipeline lock (clean exit).
 *
 * Deletes the lock file from disk. Idempotent — does not error if
 * the file does not exist. Also cleans up any leftover tmp file.
 *
 * @returns Result with void on success, or error on failure
 *
 * @example
 * ```typescript
 * const result = await releaseLock();
 * // { success: true, data: undefined }
 * ```
 */
export async function releaseLock(): Promise<Result<void>> {
  try {
    try {
      await unlink(PIPELINE_LOCK_PATH);
    } catch {
      // File doesn't exist — that's fine
    }
    try {
      await unlink(TMP_PATH);
    } catch {
      // Tmp file doesn't exist — that's fine
    }
    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to release lock: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Read and parse the pipeline lock file.
 *
 * Returns null if the file is absent, empty, or unparseable.
 * Never throws.
 *
 * @returns The parsed PipelineLock, or null if not available
 *
 * @example
 * ```typescript
 * const lock = await readLock();
 * if (lock) {
 *   console.log(`Session: ${lock.session_id}, Step: ${lock.pipeline_step}`);
 * }
 * ```
 */
export async function readLock(): Promise<PipelineLock | null> {
  try {
    const file = Bun.file(PIPELINE_LOCK_PATH);
    if (!(await file.exists())) return null;

    const text = await file.text();
    if (!text.trim()) return null;

    const raw = sanitizeJsonParse(text);
    const result = pipelineLockSchema.safeParse(raw);
    if (!result.success) return null;

    return result.data;
  } catch {
    return null;
  }
}

/**
 * Check the status of the pipeline lock.
 *
 * Determines whether the lock is clear (no lock), live (active session),
 * or stale (dead PID or older than 24 hours).
 *
 * @returns Status object with lock data and optional reason string
 *
 * @example
 * ```typescript
 * const { status, lock, reason } = await checkLockStatus();
 * if (status === "live") {
 *   console.error(`Session running: PID ${lock?.pid}`);
 * } else if (status === "stale") {
 *   console.warn(`Stale lock: ${reason}`);
 * }
 * ```
 */
export async function checkLockStatus(): Promise<{
  status: "clear" | "live" | "stale";
  lock: PipelineLock | null;
  reason?: string;
}> {
  try {
    const lock = await readLock();
    if (!lock) {
      return { status: "clear", lock: null };
    }

    // Check PID liveness
    const alive = isPidAlive(lock.pid);
    if (!alive) {
      return {
        status: "stale",
        lock,
        reason: `PID ${lock.pid} is no longer running`,
      };
    }

    // Check 24-hour staleness threshold
    const acquiredAt = new Date(lock.lock_acquired_at).getTime();
    const elapsed = Date.now() - acquiredAt;
    if (elapsed > STALE_THRESHOLD_MS) {
      return {
        status: "stale",
        lock,
        reason: `Lock acquired ${Math.round(elapsed / 3600000)}h ago (threshold: 24h)`,
      };
    }

    // PID is alive and lock is fresh
    return { status: "live", lock };
  } catch {
    // On any error, treat as clear (graceful degradation)
    return { status: "clear", lock: null };
  }
}
