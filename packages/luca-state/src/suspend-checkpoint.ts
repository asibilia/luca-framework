/**
 * Checkpoint persistence for phase suspension and resumption.
 *
 * Persists phase progress (wave index, completed tasks, working memory snapshot)
 * to `.planning/checkpoints/suspend-{phase}.json` so that suspended phases
 * can be resumed in a new session with full context restoration.
 *
 * Uses snake_case for all schema field names per API conventions.
 *
 * @module luca-state/suspend-checkpoint
 */
import { z } from "zod";
import { mkdirSync, unlinkSync } from "node:fs";

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Schema for a suspend checkpoint persisted to disk.
 *
 * Contains all state needed to resume a phase from the exact point
 * of suspension, including wave progress and working memory content.
 */
export const suspendCheckpointSchema = z.object({
  /** Phase number that was suspended */
  phase_id: z.number().int(),
  /** Wave index to resume from (0-based) */
  wave_index: z.number().int().nonnegative(),
  /** Task IDs completed before suspension */
  completed_task_ids: z.array(z.string()).default([]),
  /** Serialized WORKING.md content at suspension time */
  working_memory_snapshot: z.string().default(""),
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
 * Persists phase progress to `.planning/checkpoints/suspend-{phase}.json`.
 * Creates the checkpoints directory if it doesn't exist. Validates input
 * against the checkpoint schema.
 *
 * @param checkpoint - The checkpoint data to persist
 * @returns The checkpoint file path on success
 */
export async function createSuspendCheckpoint(
  checkpoint: SuspendCheckpoint,
): Promise<string> {
  const parsed = suspendCheckpointSchema.parse(checkpoint);
  mkdirSync(CHECKPOINTS_DIR, { recursive: true });
  const filePath = `${CHECKPOINTS_DIR}/suspend-${parsed.phase_id}.json`;
  await Bun.write(filePath, JSON.stringify(parsed, null, 2));
  return filePath;
}

// ─── Load ────────────────────────────────────────────────────────────────────

/**
 * Load a suspend checkpoint for a phase.
 *
 * Reads and validates the checkpoint file from disk.
 *
 * @param phaseId - The phase number to load checkpoint for
 * @returns The validated checkpoint data
 * @throws If the checkpoint file doesn't exist or is invalid
 */
export async function loadSuspendCheckpoint(
  phaseId: number,
): Promise<SuspendCheckpoint> {
  const filePath = `${CHECKPOINTS_DIR}/suspend-${phaseId}.json`;
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`No suspend checkpoint found for phase ${phaseId}`);
  }

  const raw = await file.json();
  return suspendCheckpointSchema.parse(raw);
}

// ─── Clear ───────────────────────────────────────────────────────────────────

/**
 * Clear (delete) a suspend checkpoint for a phase.
 *
 * Called after successful phase resumption and completion.
 *
 * @param phaseId - The phase number to clear checkpoint for
 */
export async function clearSuspendCheckpoint(phaseId: number): Promise<void> {
  const filePath = `${CHECKPOINTS_DIR}/suspend-${phaseId}.json`;
  const file = Bun.file(filePath);

  if (await file.exists()) {
    unlinkSync(filePath);
  }
}
