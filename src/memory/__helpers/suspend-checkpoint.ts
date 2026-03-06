/**
 * Checkpoint persistence for phase suspension and resumption.
 *
 * Persists phase progress (wave index, completed tasks, working memory snapshot)
 * to `.planning/checkpoints/suspend-{phase}.json` so that suspended phases
 * can be resumed in a new session with full context restoration.
 *
 * Uses snake_case for all schema field names per API conventions.
 *
 * @module memory/suspend-checkpoint
 */
import { z } from "zod";
import { join } from "pathe";
import { mkdir } from "node:fs/promises";
import type { Result } from "~/shared/__schemas/shared.schemas";

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

// ─── Paths ───────────────────────────────────────────────────────────────────

const CHECKPOINTS_DIR = ".planning/checkpoints";

/**
 * Get the checkpoint file path for a given phase.
 *
 * @param phaseId - The phase number
 * @returns Absolute path to the checkpoint JSON file
 */
function checkpointPath(phaseId: number): string {
  return join(process.cwd(), CHECKPOINTS_DIR, `suspend-${phaseId}.json`);
}

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Create a suspend checkpoint for a phase.
 *
 * Persists phase progress to `.planning/checkpoints/suspend-{phase}.json`.
 * Creates the checkpoints directory if it doesn't exist.
 *
 * @param checkpoint - The checkpoint data to persist
 * @returns Result with the checkpoint file path on success
 *
 * @example
 * ```typescript
 * const result = await createSuspendCheckpoint({
 *   phase_id: 42,
 *   wave_index: 1,
 *   completed_task_ids: ["42-01-T1", "42-01-T2"],
 *   working_memory_snapshot: "# Working Memory\n...",
 *   suspended_at: new Date().toISOString(),
 *   session_id: "abc-123",
 *   reason: "context_exhaustion",
 * });
 * ```
 */
export async function createSuspendCheckpoint(
  checkpoint: SuspendCheckpoint,
): Promise<Result<string>> {
  try {
    const parsed = suspendCheckpointSchema.safeParse(checkpoint);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid checkpoint data: ${parsed.error.message}`,
      };
    }

    const dirPath = join(process.cwd(), CHECKPOINTS_DIR);
    await mkdir(dirPath, { recursive: true });

    const filePath = checkpointPath(parsed.data.phase_id);
    await Bun.write(filePath, JSON.stringify(parsed.data, null, 2));

    return { success: true, data: filePath };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create checkpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Load ────────────────────────────────────────────────────────────────────

/**
 * Load a suspend checkpoint for a phase.
 *
 * Reads and validates the checkpoint file from disk.
 *
 * @param phaseId - The phase number to load checkpoint for
 * @returns Result with the checkpoint data on success
 *
 * @example
 * ```typescript
 * const result = await loadSuspendCheckpoint(42);
 * if (result.success) {
 *   console.log(`Resuming from wave ${result.data.wave_index}`);
 * }
 * ```
 */
export async function loadSuspendCheckpoint(
  phaseId: number,
): Promise<Result<SuspendCheckpoint>> {
  try {
    const filePath = checkpointPath(phaseId);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return {
        success: false,
        error: `No checkpoint found for phase ${phaseId}`,
      };
    }

    const raw = await file.text();
    const data = JSON.parse(raw);
    const parsed = suspendCheckpointSchema.safeParse(data);

    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid checkpoint file: ${parsed.error.message}`,
      };
    }

    return { success: true, data: parsed.data };
  } catch (err) {
    return {
      success: false,
      error: `Failed to load checkpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Clear ───────────────────────────────────────────────────────────────────

/**
 * Clear (delete) a suspend checkpoint for a phase.
 *
 * Called after successful phase resumption and completion.
 *
 * @param phaseId - The phase number to clear checkpoint for
 * @returns Result indicating success or failure
 */
export async function clearSuspendCheckpoint(
  phaseId: number,
): Promise<Result<void>> {
  try {
    const filePath = checkpointPath(phaseId);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath);
    }

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to clear checkpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Exists ──────────────────────────────────────────────────────────────────

/**
 * Check if a suspend checkpoint exists for a phase.
 *
 * @param phaseId - The phase number to check
 * @returns true if checkpoint file exists
 */
export async function suspendCheckpointExists(
  phaseId: number,
): Promise<boolean> {
  const filePath = checkpointPath(phaseId);
  return Bun.file(filePath).exists();
}
