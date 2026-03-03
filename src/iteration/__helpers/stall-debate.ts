import orderBy from "lodash/orderBy";
import filter from "lodash/filter";

import type { ConvergenceResult } from "../__schemas/iteration.schemas";
import { stallDebateOutputSchema } from "../__schemas/stall-debate.schemas";
import type {
  StallDebateInput,
  StallDebateOutput,
} from "../__schemas/stall-debate.schemas";

/** Context tier promotion order */
const TIER_ORDER = ["T0", "T1", "T2", "T3"];

/**
 * Determine whether a stall debate should be attempted.
 *
 * The debate gate activates when:
 * - 2+ consecutive stale iterations detected (convergence recommends halt)
 * - Budget has at least 1 iteration remaining (room to retry)
 *
 * @param convergenceResult - Current convergence assessment
 * @param budgetRemaining - Number of iterations remaining in budget
 * @returns true if stall debate should run
 *
 * @example
 * ```typescript
 * if (shouldAttemptDebate(convergenceResult, budgetRemaining)) {
 *   const debateResult = evaluateStallDebate(input);
 *   // Act on debateResult.recommended_strategy
 * }
 * ```
 */
export function shouldAttemptDebate(
  convergenceResult: ConvergenceResult,
  budgetRemaining: number,
): boolean {
  return convergenceResult.should_halt && budgetRemaining >= 1;
}

/**
 * Evaluate whether to halt or retry when a stall is detected.
 *
 * This is a pure heuristic function with NO LLM calls. It analyzes
 * convergence signals, error composition, and remaining budget to
 * recommend one of four strategies:
 *
 * 1. **halt** (confidence 1.0): No budget remaining — must stop
 * 2. **retry_with_context_promotion** (confidence 0.7): High fingerprint
 *    overlap with room to promote context tier — try richer context
 * 3. **retry_with_error_focus** (confidence 0.6): Most errors are
 *    correctable — retry focusing on top error patterns
 * 4. **retry_with_rollback** (confidence 0.5): Artifact changes detected
 *    but errors unchanged — rollback may help
 * 5. **halt** (confidence 0.3): Default when no retry heuristic matches
 *
 * @param input - Stall debate input with all context
 * @returns Validated StallDebateOutput with strategy and reasoning
 *
 * @example
 * ```typescript
 * const result = evaluateStallDebate({
 *   convergence_result: { signals: {...}, status: "stalled", consecutive_stale: 2, should_halt: true },
 *   current_errors: [...],
 *   budget_remaining: 1,
 *   loop_type: "harness",
 *   iteration_history: [...],
 *   context_tier: "T1",
 * });
 * // result.recommended_strategy: "retry_with_context_promotion" | "halt" | ...
 * ```
 */
export function evaluateStallDebate(
  input: StallDebateInput,
): StallDebateOutput {
  const { convergence_result, current_errors, budget_remaining, context_tier } =
    input;
  const { signals } = convergence_result;

  // Rule 1: No budget remaining — must halt
  if (budget_remaining <= 0) {
    return stallDebateOutputSchema.parse({
      recommended_strategy: "halt",
      confidence: 1.0,
      reasoning: "No budget remaining. Cannot retry regardless of error state.",
      strategy_params: {},
    });
  }

  // Rule 2: High fingerprint overlap + tier below max → context promotion
  const tierIndex = TIER_ORDER.indexOf(context_tier);
  const canPromote = tierIndex >= 0 && tierIndex < TIER_ORDER.length - 1;

  if (signals.fingerprint_overlap >= 0.9 && canPromote) {
    const nextTier = TIER_ORDER[tierIndex + 1];
    return stallDebateOutputSchema.parse({
      recommended_strategy: "retry_with_context_promotion",
      confidence: 0.7,
      reasoning: `High fingerprint overlap (${signals.fingerprint_overlap.toFixed(2)}) indicates same errors repeating. Promoting context from ${context_tier} to ${nextTier} may provide executor with additional information to resolve stalled errors.`,
      strategy_params: {
        current_tier: context_tier,
        target_tier: nextTier,
      },
    });
  }

  // Rule 3: Majority correctable errors → error focus strategy
  const correctableCount = filter(
    current_errors,
    (e) => e.classification === "correctable",
  ).length;
  const totalActive = filter(
    current_errors,
    (e) => e.classification !== "permanent",
  ).length;
  const correctableRatio = totalActive > 0 ? correctableCount / totalActive : 0;

  if (correctableRatio > 0.6 && totalActive > 0) {
    // Find the most common error sources
    const sourceCounts = new Map<string, number>();
    for (const err of current_errors) {
      if (err.classification === "correctable") {
        const key = err.code ?? err.source;
        sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
      }
    }
    const topSources = orderBy(
      Array.from(sourceCounts.entries()),
      ([, count]) => count,
      "desc",
    )
      .slice(0, 3)
      .map(([source]) => source);

    return stallDebateOutputSchema.parse({
      recommended_strategy: "retry_with_error_focus",
      confidence: 0.6,
      reasoning: `${correctableCount}/${totalActive} active errors (${(correctableRatio * 100).toFixed(0)}%) are correctable. Retrying with focused error context for top patterns: ${topSources.join(", ")}.`,
      strategy_params: {
        correctable_ratio: correctableRatio,
        focus_sources: topSources,
      },
    });
  }

  // Rule 4: Artifact changes detected but errors unchanged → rollback
  if (signals.artifact_change_delta > 0 && signals.error_count_delta >= 0) {
    return stallDebateOutputSchema.parse({
      recommended_strategy: "retry_with_rollback",
      confidence: 0.5,
      reasoning: `Files were changed (${signals.artifact_change_delta} artifacts) but errors did not decrease (delta: ${signals.error_count_delta}). Changes may have introduced new issues. Rolling back and retrying with different approach.`,
      strategy_params: {
        artifact_change_delta: signals.artifact_change_delta,
        error_count_delta: signals.error_count_delta,
      },
    });
  }

  // Default: Halt with low confidence
  return stallDebateOutputSchema.parse({
    recommended_strategy: "halt",
    confidence: 0.3,
    reasoning:
      "No retry heuristic matched. Errors are stale with no clear recovery path. Halting to avoid wasting budget.",
    strategy_params: {},
  });
}
