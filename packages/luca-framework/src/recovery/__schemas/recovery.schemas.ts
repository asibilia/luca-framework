/**
 * Zod schemas for crash recovery types.
 *
 * Defines the RecoveryAction (the deterministic output of the recovery
 * algorithm) and ConvergenceState (persisted harness-loop progress that
 * survives crashes for mid-loop resume).
 *
 * Uses snake_case for all schema fields per API conventions.
 *
 * @module luca-recovery/recovery-schemas
 */
import { z } from "zod";

// ─── Error Ledger Entry ───────────────────────────────────────────────────────

/**
 * Zod schema for a single entry in the convergence error ledger.
 *
 * Tracks individual errors encountered during the harness fix loop
 * so that recovery can pick up mid-loop context.
 *
 * Uses snake_case for all properties per API conventions.
 */
export const errorLedgerEntrySchema = z.object({
  iteration: z.number().int().nonnegative(),
  error_type: z.string(),
  error_message: z.string(),
  timestamp: z.string(),
});

/**
 * TypeScript type for a single error ledger entry.
 */
export type ErrorLedgerEntry = z.infer<typeof errorLedgerEntrySchema>;

// ─── Convergence State ────────────────────────────────────────────────────────

/**
 * Zod schema for persisted convergence state.
 *
 * Written to `.planning/.convergence-state.json` during the harness
 * fix loop so that a mid-loop crash can resume with full context:
 * which errors were seen, how many stale iterations occurred, and
 * which checkpoint tags are active.
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const state: ConvergenceState = {
 *   phase_id: 266,
 *   loop_index: 2,
 *   max_iterations: 3,
 *   error_ledger: [
 *     { iteration: 1, error_type: "typecheck", error_message: "TS2345", timestamp: "..." },
 *   ],
 *   stale_count: 0,
 *   checkpoint_tags: ["harness-fix-1"],
 *   updated_at: "2026-04-01T12:00:00Z",
 * };
 * ```
 */
export const convergenceStateSchema = z.object({
  phase_id: z.number().int().nonnegative().optional(),
  loop_index: z.number().int().nonnegative().default(0),
  max_iterations: z.number().int().positive().default(3),
  error_ledger: z.array(errorLedgerEntrySchema).default([]),
  stale_count: z.number().int().nonnegative().default(0),
  checkpoint_tags: z.array(z.string()).default([]),
  updated_at: z.string().default(""),
});

/**
 * TypeScript type for persisted convergence state.
 *
 * Inferred from the Zod schema — single source of truth.
 */
export type ConvergenceState = z.infer<typeof convergenceStateSchema>;

/** File path for persisted convergence state (relative to project root). */
export const CONVERGENCE_STATE_PATH = ".planning/.convergence-state.json";

// ─── Recovery Action ──────────────────────────────────────────────────────────

/**
 * All possible recovery actions.
 *
 * - `fresh_start`: No meaningful state to recover — begin from scratch
 * - `restart_step`: Crashed mid-step — restart the indicated pipeline step
 * - `resume_phase`: Crashed mid-phase — resume at the indicated phase
 * - `advance_phase`: Phase was fully complete — advance to next phase
 */
export const RECOVERY_ACTIONS = [
  "fresh_start",
  "restart_step",
  "resume_phase",
  "advance_phase",
] as const;

/**
 * Zod schema for the recovery action output.
 *
 * This is the structured JSON returned by `determineRecoveryAction()`.
 * The orchestrator (lu.skill.ts) parses this to decide where to resume.
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const action: RecoveryAction = {
 *   action: "restart_step",
 *   step: "execute",
 *   phase_id: 266,
 *   briefing: "Crashed during phase 266 execution. Restarting at execute step.",
 *   convergence_state: null,
 * };
 * ```
 */
export const recoveryActionSchema = z.object({
  action: z.enum(RECOVERY_ACTIONS),
  step: z.string().optional(),
  phase_id: z.number().int().nonnegative().optional(),
  briefing: z.string(),
  convergence_state: convergenceStateSchema.nullable().default(null),
});

/**
 * TypeScript type for the recovery action output.
 *
 * Inferred from the Zod schema — single source of truth.
 */
export type RecoveryAction = z.infer<typeof recoveryActionSchema>;
