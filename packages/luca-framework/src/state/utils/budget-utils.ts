/**
 * Budget tracking types and utilities for luca-state.
 *
 * Self-contained copy of budget-related schemas and functions
 * used by guards for iteration budget checks.
 *
 * @module luca-state/utils/budget-utils
 */
import { z } from "zod";

/**
 * Budget status for iteration cost tracking.
 *
 * - under_budget: Safe to continue
 * - soft_stop: At or above 80% threshold, finish current iteration but don't start new one
 * - exceeded: Hard budget exceeded (max iterations hit)
 */
export const BUDGET_STATUSES = [
  "under_budget",
  "soft_stop",
  "exceeded",
] as const;
export const budgetStatusSchema = z.enum(BUDGET_STATUSES);
export type BudgetStatus = z.infer<typeof budgetStatusSchema>;

/**
 * Budget tracking state for an iteration loop.
 *
 * Uses iteration count as a proxy for token cost since exact token
 * counting is not available in the Claude Code runtime.
 *
 * Uses snake_case for data schema compatibility.
 */
export const budgetStateSchema = z.object({
  /** Maximum iterations allowed (from ComplexityGate) */
  max_iterations: z.number().int().positive(),
  /** Current iteration number (1-based) */
  current_iteration: z.number().int().nonnegative(),
  /** Soft stop threshold as percentage (default 80) */
  soft_stop_percent: z.number().min(0).max(100).default(80),
  /** Current budget status */
  status: budgetStatusSchema,
});
export type BudgetState = z.infer<typeof budgetStateSchema>;

/**
 * Assess the budget status based on current iteration vs max.
 *
 * Status determination:
 * - exceeded: current_iteration >= max_iterations (hard limit)
 * - soft_stop: current_iteration / max_iterations >= soft_stop_percent / 100
 * - under_budget: still within budget
 *
 * @param state - Current budget state
 * @returns The assessed BudgetStatus
 */
export function assessBudget(state: BudgetState): BudgetStatus {
  if (state.current_iteration >= state.max_iterations) {
    return "exceeded";
  }

  const percentUsed = (state.current_iteration / state.max_iterations) * 100;

  if (percentUsed >= state.soft_stop_percent) {
    return "soft_stop";
  }

  return "under_budget";
}

/**
 * Determine whether a new iteration should be started.
 *
 * This is the primary decision point called by the orchestrator
 * BEFORE beginning a new iteration.
 *
 * Logic:
 * - If max_iterations is 0: not allowed (loop disabled for this complexity)
 * - If status is "exceeded": not allowed (hard limit reached)
 * - If status is "soft_stop": not allowed (soft threshold reached)
 * - Otherwise: allowed
 *
 * @param state - Current budget state
 * @returns Decision object with boolean and human-readable reason
 */
export function shouldStartIteration(state: BudgetState): {
  allowed: boolean;
  reason: string;
} {
  if (state.max_iterations === 0) {
    return {
      allowed: false,
      reason: "Loop disabled: max_iterations is 0 for this complexity level",
    };
  }

  const percentUsed = Math.round(
    (state.current_iteration / state.max_iterations) * 100,
  );

  if (state.status === "exceeded") {
    return {
      allowed: false,
      reason: `Budget exceeded: ${state.current_iteration} of ${state.max_iterations} iterations used (${percentUsed}%)`,
    };
  }

  if (state.status === "soft_stop") {
    return {
      allowed: false,
      reason: `Soft stop: ${state.current_iteration} of ${state.max_iterations} iterations used (${percentUsed}% >= ${state.soft_stop_percent}% threshold)`,
    };
  }

  return {
    allowed: true,
    reason: `Budget OK: iteration ${state.current_iteration + 1} of ${state.max_iterations} (${percentUsed}%)`,
  };
}
