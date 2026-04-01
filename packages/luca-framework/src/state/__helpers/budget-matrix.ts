/**
 * Budget Matrix resolver for the /lu orchestrator.
 *
 * Implements the 5x5x3 budget matrix from Section 7 of the v9.0.0
 * workflow spec (06-final-workflow.md). Resolves iteration limits
 * for any combination of complexity level and token profile.
 *
 * The function is pure: no side effects, no I/O, no state mutation.
 * The CLI entry point at the bottom provides a shell-friendly interface.
 *
 * @module luca-state/__helpers/budget-matrix
 */
import type {
  BaseBudgetLimits,
  BudgetComplexity,
  BudgetProfile,
  ConvergenceOverrideResult,
  ResolvedBudget,
} from "../__schemas/budget-matrix.schemas";
import {
  budgetMatrixInputSchema,
  convergenceSignalSchema,
  budgetStatusValueSchema,
} from "../__schemas/budget-matrix.schemas";

import type { z } from "zod";

// ─── Base Budget Matrix (5 complexity levels) ───────────────────────────────

/**
 * The base iteration limits by complexity level.
 *
 * This is the canonical encoding of the spec's Section 7 table.
 * Values are BEFORE profile multipliers are applied.
 *
 * | Parameter              | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
 * |------------------------|---------|--------|----------|---------|----------|
 * | MAX_IMPL_ITERATIONS    | 1       | 1      | 2        | 3       | 3        |
 * | HARNESS_FIX_ITERATIONS | 1       | 2      | 2        | 2       | 3        |
 * | REVIEW_FIX_ITERATIONS  | 0       | 1      | 1        | 2       | 2        |
 * | Max files per task     | 3       | 5      | 6        | 8       | 8        |
 * | Max tasks per wave     | 2       | 3      | 4        | 5       | 6        |
 */
export const BASE_BUDGET_MATRIX: Record<BudgetComplexity, BaseBudgetLimits> = {
  TRIVIAL: {
    max_impl_iterations: 1,
    harness_fix_iterations: 1,
    review_fix_iterations: 0,
    max_files_per_task: 3,
    max_tasks_per_wave: 2,
  },
  SIMPLE: {
    max_impl_iterations: 1,
    harness_fix_iterations: 2,
    review_fix_iterations: 1,
    max_files_per_task: 5,
    max_tasks_per_wave: 3,
  },
  MODERATE: {
    max_impl_iterations: 2,
    harness_fix_iterations: 2,
    review_fix_iterations: 1,
    max_files_per_task: 6,
    max_tasks_per_wave: 4,
  },
  COMPLEX: {
    max_impl_iterations: 3,
    harness_fix_iterations: 2,
    review_fix_iterations: 2,
    max_files_per_task: 8,
    max_tasks_per_wave: 5,
  },
  CRITICAL: {
    max_impl_iterations: 3,
    harness_fix_iterations: 3,
    review_fix_iterations: 2,
    max_files_per_task: 8,
    max_tasks_per_wave: 6,
  },
} as const;

// ─── Profile Multipliers ────────────────────────────────────────────────────

/**
 * Profile multipliers applied to loop budget values.
 *
 * - budget: 0.5x (halve iterations, minimum 1)
 * - balanced: 1.0x (no change)
 * - quality: 2.0x (double iterations)
 *
 * Task sizing limits (max_files_per_task, max_tasks_per_wave)
 * are NOT modified by profile multipliers.
 */
export const PROFILE_MULTIPLIERS: Record<BudgetProfile, number> = {
  budget: 0.5,
  balanced: 1.0,
  quality: 2.0,
} as const;

// ─── Budget Resolver ────────────────────────────────────────────────────────

/**
 * Apply profile multiplier to a base iteration value.
 *
 * Uses Math.floor with a minimum of 1 for active loops.
 * Special case: REVIEW_FIX_ITERATIONS at TRIVIAL is always 0
 * (no review fix loop at TRIVIAL complexity).
 *
 * @param baseValue - The base iteration count from the matrix
 * @param multiplier - The profile multiplier to apply
 * @param allowZero - Whether 0 is a valid result (true for review_fix at TRIVIAL)
 * @returns The effective iteration count after multiplier
 */
function applyMultiplier(
  baseValue: number,
  multiplier: number,
  allowZero: boolean = false,
): number {
  if (baseValue === 0 && allowZero) {
    return 0;
  }
  return Math.max(1, Math.floor(baseValue * multiplier));
}

/**
 * Resolve the full budget matrix for a given complexity and profile.
 *
 * Pure function that returns the effective iteration limits after
 * applying the profile multiplier. Task sizing limits are passed
 * through unchanged (not profile-modified).
 *
 * @param complexity - The complexity level (TRIVIAL through CRITICAL)
 * @param profile - The token profile (budget/balanced/quality)
 * @returns Resolved budget with all effective limits
 *
 * @example
 * ```typescript
 * const budget = resolveBudgetMatrix("MODERATE", "budget");
 * // { max_impl_iterations: 1, harness_fix_iterations: 1,
 * //   review_fix_iterations: 1, max_files_per_task: 6,
 * //   max_tasks_per_wave: 4, complexity: "MODERATE",
 * //   profile: "budget", multiplier: 0.5 }
 *
 * const quality = resolveBudgetMatrix("COMPLEX", "quality");
 * // { max_impl_iterations: 6, harness_fix_iterations: 4,
 * //   review_fix_iterations: 4, max_files_per_task: 8,
 * //   max_tasks_per_wave: 5, complexity: "COMPLEX",
 * //   profile: "quality", multiplier: 2.0 }
 * ```
 */
export function resolveBudgetMatrix(
  complexity: BudgetComplexity,
  profile: BudgetProfile = "balanced",
): ResolvedBudget {
  const base = BASE_BUDGET_MATRIX[complexity];
  const multiplier = PROFILE_MULTIPLIERS[profile];

  // TRIVIAL has review_fix_iterations=0 as a special case (no fix loop)
  const isReviewFixZeroCase =
    complexity === "TRIVIAL" && base.review_fix_iterations === 0;

  return {
    max_impl_iterations: applyMultiplier(base.max_impl_iterations, multiplier),
    harness_fix_iterations: applyMultiplier(
      base.harness_fix_iterations,
      multiplier,
    ),
    review_fix_iterations: applyMultiplier(
      base.review_fix_iterations,
      multiplier,
      isReviewFixZeroCase,
    ),
    // Task sizing limits are NOT profile-modified
    max_files_per_task: base.max_files_per_task,
    max_tasks_per_wave: base.max_tasks_per_wave,
    // Metadata
    complexity,
    profile,
    multiplier,
  };
}

// ─── Convergence Override ───────────────────────────────────────────────────

/**
 * Determine whether convergence signals should override budget limits.
 *
 * Priority: convergence signals > iteration count > soft stop.
 *
 * - A loop making progress should continue even at soft stop (80% budget)
 * - A loop that is stalled should stop even if budget remains
 *
 * @param budgetStatus - Current budget status (under_budget/soft_stop/exceeded)
 * @param convergenceSignal - Current convergence signal (progressing/stalled/unknown)
 * @returns Whether the loop should continue and why
 *
 * @example
 * ```typescript
 * // Progress extends past soft stop
 * resolveConvergenceOverride("soft_stop", "progressing");
 * // { should_continue: true, reason: "...", override_applied: true }
 *
 * // Stall shortens even under budget
 * resolveConvergenceOverride("under_budget", "stalled");
 * // { should_continue: false, reason: "...", override_applied: true }
 * ```
 */
export function resolveConvergenceOverride(
  budgetStatus: z.infer<typeof budgetStatusValueSchema>,
  convergenceSignal: z.infer<typeof convergenceSignalSchema>,
): ConvergenceOverrideResult {
  // Hard budget exceeded: never continue regardless of convergence
  if (budgetStatus === "exceeded") {
    return {
      should_continue: false,
      reason:
        "Budget hard limit exceeded. Cannot continue regardless of convergence signal.",
      override_applied: false,
    };
  }

  // Stalled loop: stop early even if budget remains
  if (convergenceSignal === "stalled") {
    if (budgetStatus === "under_budget") {
      return {
        should_continue: false,
        reason:
          "Convergence stall detected. Stopping early despite remaining budget.",
        override_applied: true,
      };
    }
    // Stalled at soft stop: definitely stop
    return {
      should_continue: false,
      reason: "Convergence stall detected at soft stop. Stopping immediately.",
      override_applied: false,
    };
  }

  // Making progress at soft stop: allow one more iteration
  if (convergenceSignal === "progressing" && budgetStatus === "soft_stop") {
    return {
      should_continue: true,
      reason:
        "Making progress at soft stop. Allowing one extension beyond soft stop threshold.",
      override_applied: true,
    };
  }

  // Under budget with progress or unknown: continue normally
  if (budgetStatus === "under_budget") {
    return {
      should_continue: true,
      reason: `Under budget with signal='${convergenceSignal}'. Continue normally.`,
      override_applied: false,
    };
  }

  // Soft stop with unknown signal: respect the soft stop
  return {
    should_continue: false,
    reason: "Soft stop reached with no clear progress signal. Stopping.",
    override_applied: false,
  };
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

/**
 * CLI entry point for the budget matrix resolver.
 *
 * Called by the orchestrator via:
 * ```bash
 * bun src/state/__helpers/budget-matrix.ts \
 *   --complexity="MODERATE" \
 *   --profile="balanced"
 * ```
 *
 * Outputs JSON to stdout. Exits with code 0 on success, 1 on error.
 * On error, outputs MODERATE/balanced defaults as fail-closed fallback.
 */
async function main(): Promise<void> {
  const FALLBACK_BUDGET: ResolvedBudget = {
    max_impl_iterations: 2,
    harness_fix_iterations: 2,
    review_fix_iterations: 1,
    max_files_per_task: 6,
    max_tasks_per_wave: 4,
    complexity: "MODERATE",
    profile: "balanced",
    multiplier: 1.0,
  };

  try {
    const args: Record<string, string> = {};
    for (const arg of process.argv.slice(2)) {
      const match = arg.match(/^--(\w+)=(.+)$/);
      if (match && match[1] && match[2]) {
        args[match[1]] = match[2];
      }
    }

    const parseResult = budgetMatrixInputSchema.safeParse(args);
    if (!parseResult.success) {
      // Fail-closed: output MODERATE/balanced defaults
      console.log(JSON.stringify(FALLBACK_BUDGET));
      process.exit(1);
    }

    const { complexity, profile } = parseResult.data;
    const result = resolveBudgetMatrix(complexity, profile);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch {
    // Fail-closed: output MODERATE/balanced defaults
    console.log(JSON.stringify(FALLBACK_BUDGET));
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
const isDirectExecution =
  typeof Bun !== "undefined" && Bun.main === import.meta.path;
if (isDirectExecution) {
  main();
}
