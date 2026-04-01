/**
 * Zod schema and types for the pipeline lock file.
 *
 * The lock file (`.planning/.pipeline-lock.json`) prevents concurrent `/lu`
 * sessions and provides deterministic crash-recovery state. It is written
 * on every pipeline step transition and deleted on clean exit.
 *
 * Uses snake_case for all schema fields per API conventions.
 *
 * @module luca-state/pipeline-lock-schemas
 */
import { z } from "zod";

// ─── Lock File Path ─────────────────────────────────────────────────────────

/**
 * Path to the pipeline lock file, relative to project root.
 *
 * Same cwd-relative convention as STATE_FILE_PATH (".planning/state.json").
 */
export const PIPELINE_LOCK_PATH = ".planning/.pipeline-lock.json";

// ─── Lock File Schema ───────────────────────────────────────────────────────

/**
 * Zod schema for the pipeline lock file.
 *
 * Written atomically on every step transition. Survives crashes intact
 * so crash recovery always knows the exact resume point.
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const lock: PipelineLock = {
 *   session_id: "a8080998-593d-40f1",
 *   pid: 12345,
 *   started_at: "2026-04-01T05:26:31.427Z",
 *   pipeline_step: "phase-loop",
 *   phase_step: "execute",
 *   phase_id: 259,
 *   lock_acquired_at: "2026-04-01T05:26:31.427Z",
 * };
 * ```
 */
export const pipelineLockSchema = z.object({
  session_id: z.string(),
  pid: z.number().int().positive(),
  started_at: z.string(),
  pipeline_step: z.string().default("init"),
  phase_step: z.string().default(""),
  phase_id: z.number().int().nonnegative().optional(),
  lock_acquired_at: z.string(),
});

/**
 * TypeScript type for the pipeline lock file.
 *
 * Inferred from the Zod schema — single source of truth.
 */
export type PipelineLock = z.infer<typeof pipelineLockSchema>;
