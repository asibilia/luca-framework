/**
 * Mid-execution complexity reassessment logic.
 *
 * Provides threshold-based promotion detection and calibration engram
 * generation for the adaptive complexity self-tuning system.
 *
 * Called at wave boundaries by phase-execute to determine whether the
 * current complexity level should be promoted based on observed signals.
 *
 * Uses OR logic: any single signal exceeding its threshold triggers
 * promotion to the next level. Maximum one promotion per phase.
 */

import {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  type ComplexityLevel,
  type ReassessmentSignals,
  type ReassessmentResult,
} from "../__schemas/complexity.schemas";
import { REASSESSMENT_THRESHOLDS } from "./defaults";

// ─── shouldPromoteComplexity ──────────────────────────────────────────────

/**
 * Determine whether the current complexity level should be promoted.
 *
 * Compares observed signals against the REASSESSMENT_THRESHOLDS for the
 * current level. Uses OR logic — any single signal exceeding its threshold
 * triggers promotion to the next level.
 *
 * @param signals - Observed signals at the current wave/harness boundary
 * @param alreadyPromoted - Whether a promotion already occurred this phase
 * @returns Reassessment result with promotion decision and explanation
 *
 * @example
 * ```typescript
 * const result = shouldPromoteComplexity(
 *   {
 *     files_touched: 7,
 *     iteration_budget_ratio: 0.3,
 *     stall_detected: false,
 *     error_count: 2,
 *     current_level: "MODERATE",
 *   },
 *   false,
 * );
 * // result.should_promote === true
 * // result.promoted_to === "COMPLEX"
 * // result.triggered_by === ["files_touched exceeded upper bound (7 > 5)"]
 * ```
 */
export function shouldPromoteComplexity(
  signals: ReassessmentSignals,
  alreadyPromoted: boolean = false,
): ReassessmentResult {
  const { current_level } = signals;

  // CRITICAL has no higher level — cannot promote
  if (current_level === "CRITICAL") {
    return {
      should_promote: false,
      triggered_by: [],
      promoted_to: current_level,
      reason: "Already at CRITICAL level — no promotion possible.",
    };
  }

  // Maximum one promotion per phase to prevent thrashing
  if (alreadyPromoted) {
    return {
      should_promote: false,
      triggered_by: [],
      promoted_to: current_level,
      reason: "Already promoted once this phase — skipping reassessment.",
    };
  }

  const thresholds = REASSESSMENT_THRESHOLDS[current_level];
  const triggers: string[] = [];

  // Check each signal against its threshold (OR logic)
  if (signals.files_touched > thresholds.files_touched_upper_bound) {
    triggers.push(
      `files_touched exceeded upper bound (${signals.files_touched} > ${thresholds.files_touched_upper_bound})`,
    );
  }

  if (signals.iteration_budget_ratio > thresholds.iteration_budget_ratio) {
    triggers.push(
      `iteration_budget_ratio exceeded threshold (${signals.iteration_budget_ratio.toFixed(2)} > ${thresholds.iteration_budget_ratio})`,
    );
  }

  if (signals.stall_detected) {
    triggers.push("stall_detected — convergence failure flagged");
  }

  if (signals.error_count > thresholds.error_count_threshold) {
    triggers.push(
      `error_count exceeded threshold (${signals.error_count} > ${thresholds.error_count_threshold})`,
    );
  }

  // No triggers — no promotion needed
  if (triggers.length === 0) {
    return {
      should_promote: false,
      triggered_by: [],
      promoted_to: current_level,
      reason: `All signals within ${current_level} thresholds — no promotion needed.`,
    };
  }

  // Compute next level
  const currentIndex = COMPLEXITY_ORDER[current_level];
  const nextLevel = COMPLEXITY_LEVELS[currentIndex + 1]!;

  return {
    should_promote: true,
    triggered_by: triggers,
    promoted_to: nextLevel,
    reason: `Promoting from ${current_level} to ${nextLevel}: ${triggers.join("; ")}.`,
  };
}

// ─── buildCalibrationEngram ───────────────────────────────────────────────

/**
 * Parameters for building a calibration engram.
 */
export interface CalibrationEngramParams {
  /** Phase number */
  phase: number;
  /** Milestone identifier (e.g., "v3.3.0") */
  milestone: string;
  /** Initial lu-router classification */
  predicted: ComplexityLevel;
  /** Final observed level (post-promotion if any) */
  actual: ComplexityLevel;
  /** Whether a mid-execution promotion occurred */
  promoted_mid_execution: boolean;
  /** Description of what triggered promotion (empty string if none) */
  promotion_trigger: string;
  /** Total files touched during the phase */
  files_touched: number;
  /** Total harness iterations consumed */
  harness_iterations: number;
}

/**
 * Build a MuninnDB-compatible calibration engram for complexity prediction feedback.
 *
 * Produces a concept/content pair suitable for storing in MuninnDB via
 * `mcp__muninn__muninn_remember`. The concept uses milestone-scoped naming
 * to ensure uniqueness across phases within the same milestone.
 *
 * @param params - Calibration data collected after phase execution
 * @returns Object with `concept` (engram key) and `content` (JSON-stringified data)
 *
 * @example
 * ```typescript
 * const engram = buildCalibrationEngram({
 *   phase: 2,
 *   milestone: "v3.3.0",
 *   predicted: "MODERATE",
 *   actual: "COMPLEX",
 *   promoted_mid_execution: true,
 *   promotion_trigger: "files_touched exceeded upper bound (7 > 5)",
 *   files_touched: 7,
 *   harness_iterations: 3,
 * });
 * // engram.concept === "decision:complexity-calibration-v3.3.0-phase-2"
 * // engram.content === '{"phase":2,"milestone":"v3.3.0",...}'
 * ```
 */
export function buildCalibrationEngram(params: CalibrationEngramParams): {
  concept: string;
  content: string;
} {
  const concept = `decision:complexity-calibration-${params.milestone}-phase-${params.phase}`;

  const content = JSON.stringify({
    phase: params.phase,
    milestone: params.milestone,
    predicted: params.predicted,
    actual: params.actual,
    promoted_mid_execution: params.promoted_mid_execution,
    promotion_trigger: params.promotion_trigger,
    files_touched: params.files_touched,
    harness_iterations: params.harness_iterations,
    timestamp: new Date().toISOString(),
  });

  return { concept, content };
}
