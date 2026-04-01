/**
 * Convergence state persistence for crash recovery.
 *
 * Persists harness fix loop progress to `.planning/.convergence-state.json`
 * so that a mid-loop crash can resume with full context: error ledger,
 * stale iteration count, and active checkpoint tags.
 *
 * Uses atomic write (write-to-tmp + rename) pattern to prevent corruption.
 *
 * @module luca-recovery/convergence-state
 */
import { rename, unlink } from "node:fs/promises";

import {
  convergenceStateSchema,
  CONVERGENCE_STATE_PATH,
} from "../__schemas/recovery.schemas";

import type { ConvergenceState } from "../__schemas/recovery.schemas";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Tmp file path for atomic writes (write + rename pattern). */
const TMP_PATH = `${CONVERGENCE_STATE_PATH}.tmp`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write convergence state to disk atomically.
 *
 * Uses the write-to-tmp + rename pattern so the convergence state
 * file is never partially written. Automatically sets `updated_at`.
 *
 * @param state - The convergence state to persist
 *
 * @example
 * ```typescript
 * await writeConvergenceState({
 *   phase_id: 266,
 *   loop_index: 1,
 *   max_iterations: 3,
 *   error_ledger: [{ iteration: 1, error_type: "typecheck", error_message: "TS2345", timestamp: "..." }],
 *   stale_count: 0,
 *   checkpoint_tags: ["harness-fix-1"],
 * });
 * ```
 */
export async function writeConvergenceState(
  state: ConvergenceState,
): Promise<void> {
  const withTimestamp: ConvergenceState = {
    ...state,
    updated_at: new Date().toISOString(),
  };

  const result = convergenceStateSchema.safeParse(withTimestamp);
  if (!result.success) {
    console.error("Convergence state validation failed:", result.error.message);
    return;
  }

  const json = JSON.stringify(result.data, null, 2);
  await Bun.write(TMP_PATH, json);
  await rename(TMP_PATH, CONVERGENCE_STATE_PATH);
}

/**
 * Read and parse the convergence state file.
 *
 * Returns null if the file is absent, empty, or unparseable.
 * Never throws.
 *
 * @returns The parsed ConvergenceState, or null if not available
 *
 * @example
 * ```typescript
 * const state = await readConvergenceState();
 * if (state) {
 *   console.log(`Loop ${state.loop_index}/${state.max_iterations}`);
 * }
 * ```
 */
export async function readConvergenceState(): Promise<ConvergenceState | null> {
  try {
    const file = Bun.file(CONVERGENCE_STATE_PATH);
    if (!(await file.exists())) return null;

    const text = await file.text();
    if (!text.trim()) return null;

    const raw = JSON.parse(text);
    const result = convergenceStateSchema.safeParse(raw);
    if (!result.success) return null;

    return result.data;
  } catch {
    return null;
  }
}

/**
 * Delete the convergence state file.
 *
 * Called on clean phase completion. Idempotent — does not error
 * if the file does not exist.
 *
 * @example
 * ```typescript
 * await clearConvergenceState();
 * ```
 */
export async function clearConvergenceState(): Promise<void> {
  try {
    await unlink(CONVERGENCE_STATE_PATH);
  } catch {
    // File doesn't exist — that's fine
  }
  try {
    await unlink(TMP_PATH);
  } catch {
    // Tmp file doesn't exist — that's fine
  }
}
