import { z } from "zod";
import {
  convergenceResultSchema,
  classifiedErrorSchema,
  loopTypeSchema,
} from "./iteration.schemas";

/**
 * Available strategies when a stall is detected during iteration.
 *
 * - halt: Stop the loop (convergence failure)
 * - retry_with_context_promotion: Retry with higher context tier
 * - retry_with_error_focus: Retry focusing on top correctable errors
 * - retry_with_rollback: Rollback to previous checkpoint and retry
 */
export const STALL_DEBATE_STRATEGIES = [
  "halt",
  "retry_with_context_promotion",
  "retry_with_error_focus",
  "retry_with_rollback",
] as const;

export const stallDebateStrategySchema = z.enum(STALL_DEBATE_STRATEGIES);
export type StallDebateStrategy = z.infer<typeof stallDebateStrategySchema>;

/**
 * Input for the stall debate evaluator.
 *
 * Provides all context needed to decide whether to halt or retry
 * when a stall is detected during the iteration loop.
 *
 * Uses snake_case for data schema compatibility.
 */
export const stallDebateInputSchema = z.object({
  /** Current convergence assessment result */
  convergence_result: convergenceResultSchema,
  /** Currently active classified errors */
  current_errors: z.array(classifiedErrorSchema),
  /** Number of budget iterations remaining */
  budget_remaining: z.number().int().nonnegative(),
  /** Which loop type is running */
  loop_type: loopTypeSchema,
  /** History of iteration records for pattern analysis */
  iteration_history: z.array(
    z.object({
      iteration: z.number().int().positive(),
      error_count: z.number().int().nonnegative(),
      convergence_status: z.string(),
      stale_count: z.number().int().nonnegative(),
    }),
  ),
  /** Current context tier (e.g., "T0", "T1", "T2", "T3") */
  context_tier: z.string(),
});
export type StallDebateInput = z.infer<typeof stallDebateInputSchema>;

/**
 * Output from the stall debate evaluator.
 *
 * Contains the recommended strategy, confidence level,
 * reasoning, and any strategy-specific parameters.
 *
 * Uses snake_case for data schema compatibility.
 */
export const stallDebateOutputSchema = z.object({
  /** Recommended strategy */
  recommended_strategy: stallDebateStrategySchema,
  /** Confidence in the recommendation (0.0 = uncertain, 1.0 = certain) */
  confidence: z.number().min(0).max(1),
  /** Human-readable reasoning for the recommendation */
  reasoning: z.string(),
  /** Strategy-specific parameters (e.g., target context tier, error focus list) */
  strategy_params: z.record(z.string(), z.unknown()).default({}),
});
export type StallDebateOutput = z.infer<typeof stallDebateOutputSchema>;
