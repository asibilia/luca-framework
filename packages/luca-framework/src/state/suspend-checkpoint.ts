/**
 * Checkpoint persistence for phase suspension and resumption.
 *
 * SpacetimeDB-primary: writes call the `save_checkpoint` reducer,
 * reads query SpacetimeDB first with file fallback. Clears call
 * the `delete_checkpoint` reducer.
 *
 * Uses snake_case for all schema field names per API conventions.
 *
 * @module luca-state/suspend-checkpoint
 */
import { z } from "zod";
import { mkdir } from "node:fs/promises";
import { sanitizeJsonParse } from "../utils/sanitize";
import { queryOne } from "./__helpers/spacetimedb-client";
import { callReducer } from "./__helpers/observer-emitter";

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Schema for a suspend checkpoint persisted to disk.
 *
 * Contains all state needed to resume a phase from the exact point
 * of suspension, including wave progress. Session memory persists
 * independently via MuninnDB (muninn_session / muninn_where_left_off).
 */
export const suspendCheckpointSchema = z.object({
  /** Phase number that was suspended */
  phase_id: z.number().int(),
  /** Wave index to resume from (0-based) */
  wave_index: z.number().int().nonnegative(),
  /** Task IDs completed before suspension */
  completed_task_ids: z.array(z.string()).default([]),
  /** ISO 8601 timestamp of suspension */
  suspended_at: z.string(),
  /** Reason for suspension (e.g., "context_exhaustion") */
  reason: z.string().optional(),
  /** Session ID that created this checkpoint */
  session_id: z.string(),
});

/** Typed suspend checkpoint data. */
export type SuspendCheckpoint = z.infer<typeof suspendCheckpointSchema>;

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default directory for suspend checkpoints */
const CHECKPOINTS_DIR = ".planning/checkpoints";

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Create a suspend checkpoint for a phase.
 *
 * SpacetimeDB-primary: calls the `save_checkpoint` reducer.
 * Also writes to `.planning/checkpoints/suspend-{phase}.json` as backup.
 *
 * @param checkpoint - The checkpoint data to persist
 * @returns The checkpoint file path on success
 */
export async function createSuspendCheckpoint(
  checkpoint: SuspendCheckpoint,
): Promise<string> {
  const parsed = suspendCheckpointSchema.parse(checkpoint);

  // Primary: write to SpacetimeDB via reducer
  callReducer("save_checkpoint", {
    phaseId: parsed.phase_id,
    checkpointJson: JSON.stringify(parsed),
    timestamp: Date.now(),
  });

  // Backup: write to local file
  await mkdir(CHECKPOINTS_DIR, { recursive: true });
  const filePath = `${CHECKPOINTS_DIR}/suspend-${parsed.phase_id}.json`;
  await Bun.write(filePath, JSON.stringify(parsed, null, 2));
  return filePath;
}

// ─── Load ────────────────────────────────────────────────────────────────────

/**
 * Load a suspend checkpoint for a phase.
 *
 * SpacetimeDB-primary: queries `suspend_checkpoints` table.
 * Falls back to reading the checkpoint file from disk.
 *
 * @param phaseId - The phase number to load checkpoint for
 * @returns The validated checkpoint data
 * @throws If the checkpoint is not found in either source
 */
export async function loadSuspendCheckpoint(
  phaseId: number,
): Promise<SuspendCheckpoint> {
  // Primary: try SpacetimeDB
  try {
    // phaseId is parseInt-validated and Number.isFinite-checked — safe for interpolation.
    const row = await queryOne<{ checkpointJson: string }>(
      `SELECT checkpointJson FROM suspend_checkpoints WHERE phaseId = ${phaseId}`,
    );
    if (row && row.checkpointJson) {
      return suspendCheckpointSchema.parse(JSON.parse(row.checkpointJson));
    }
  } catch {
    // SpacetimeDB unavailable — fall through
  }

  // Fallback: read from file
  const filePath = `${CHECKPOINTS_DIR}/suspend-${phaseId}.json`;
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`No suspend checkpoint found for phase ${phaseId}`);
  }

  const text = await file.text();
  const raw = sanitizeJsonParse(text);
  return suspendCheckpointSchema.parse(raw);
}

// ─── Clear ───────────────────────────────────────────────────────────────────

/**
 * Clear (delete) a suspend checkpoint for a phase.
 *
 * SpacetimeDB-primary: calls the `delete_checkpoint` reducer.
 * Also removes the local file if it exists.
 *
 * @param phaseId - The phase number to clear checkpoint for
 */
export async function clearSuspendCheckpoint(phaseId: number): Promise<void> {
  // Primary: delete from SpacetimeDB via reducer
  callReducer("delete_checkpoint", {
    phaseId,
    timestamp: Date.now(),
  });

  // Also clean up local file
  const filePath = `${CHECKPOINTS_DIR}/suspend-${phaseId}.json`;
  const file = Bun.file(filePath);

  if (await file.exists()) {
    const { unlink } = await import("node:fs/promises");
    await unlink(filePath);
  }
}
