import type { PhaseQualityMetrics } from "./types.ts";
import { phaseQualityMetricsSchema } from "./types.ts";
import type { HarnessResult } from "../harness/types.ts";
import type { QualityZone } from "../planner/types.ts";

/**
 * Weight constants for composite score calculation.
 *
 * These weights define how much each quality component contributes
 * to the overall composite score. They sum to 1.0.
 *
 * - tests (40%): Most impactful -- failing tests indicate broken functionality
 * - verification (25%): Agent-level verification confirms correct behavior
 * - types (20%): Type safety catches structural issues
 * - learnings (15%): Knowledge capture ensures continuous improvement
 */
const WEIGHTS = {
  tests: 0.4,
  types: 0.2,
  verification: 0.25,
  learnings: 0.15,
} as const;

/**
 * Expected learning count per complexity level.
 *
 * Used to normalize the learning score: min(actual / expected, 1.0).
 * Higher complexity tasks are expected to produce more learnings.
 */
const EXPECTED_LEARNINGS: Record<string, number> = {
  TRIVIAL: 1,
  SIMPLE: 1,
  MODERATE: 3,
  COMPLEX: 5,
  CRITICAL: 5,
};

/**
 * Calculate composite quality metrics for a completed phase.
 *
 * Each component is scored 0-1:
 * - tests: (passed_test_checks / total_test_checks). 1.0 if all pass, 0.0 if all fail.
 * - types: (passed_type_checks / total_type_checks). 1.0 if clean, 0.0 if errors.
 * - verification: 1.0 if verified passed, 0.5 if partial/skipped, 0.0 if failed.
 * - learnings: min(learning_count / expected_count, 1.0).
 *
 * Composite = sum(component * weight)
 *
 * Zone mapping:
 * - composite >= 0.85 -> "peak"
 * - composite >= 0.65 -> "good"
 * - composite >= 0.45 -> "degrading"
 * - composite < 0.45 -> "stop"
 *
 * @param input - Phase quality input data
 * @returns Validated PhaseQualityMetrics via schema.parse()
 *
 * @example
 * ```typescript
 * const metrics = calculatePhaseQuality({
 *   phase_id: 36,
 *   harness_result: harnessResult,
 *   verification_status: "passed",
 *   learning_count: 3,
 *   complexity: "MODERATE",
 * });
 * console.log(metrics.zone);            // "peak"
 * console.log(metrics.composite_score);  // 0.925
 * ```
 */
export function calculatePhaseQuality(input: {
  phase_id: number;
  harness_result?: HarnessResult;
  verification_status: "passed" | "partial" | "failed" | "skipped";
  learning_count: number;
  complexity: string;
}): PhaseQualityMetrics {
  // 1. Extract test and type scores from harness result
  const testScore = extractCheckScore(input.harness_result, "test");
  const typeScore = extractCheckScore(input.harness_result, "typecheck");

  // 2. Map verification status to score
  const verificationScore = mapVerificationStatus(input.verification_status);

  // 3. Calculate learning score based on complexity-adjusted expectation
  const expectedLearnings =
    EXPECTED_LEARNINGS[input.complexity.toUpperCase()] ?? 3;
  const learningScore =
    expectedLearnings > 0
      ? Math.min(input.learning_count / expectedLearnings, 1.0)
      : input.learning_count > 0
        ? 1.0
        : 0.0;

  // 4. Compute composite score
  const compositeScore =
    testScore * WEIGHTS.tests +
    typeScore * WEIGHTS.types +
    verificationScore * WEIGHTS.verification +
    learningScore * WEIGHTS.learnings;

  // 5. Map to quality zone
  const zone = scoreToZone(compositeScore);

  // 6. Return validated PhaseQualityMetrics
  return phaseQualityMetricsSchema.parse({
    phase_id: input.phase_id,
    composite_score: Math.round(compositeScore * 1000) / 1000,
    zone,
    component_scores: {
      tests: testScore,
      types: typeScore,
      verification: verificationScore,
      learnings: Math.round(learningScore * 1000) / 1000,
    },
    weights: { ...WEIGHTS },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Extract the pass/fail score for a named check from a HarnessResult.
 *
 * If the harness result is undefined or the named check is not found,
 * returns 0.5 (unknown/neutral default) rather than 0.0 to avoid
 * penalizing phases where the harness was not run.
 *
 * @param harnessResult - Optional harness result to inspect
 * @param checkName - Name of the check to find (e.g., "test", "typecheck")
 * @returns Score between 0 and 1 (1.0 = passed, 0.0 = failed, 0.5 = unknown)
 */
function extractCheckScore(
  harnessResult: HarnessResult | undefined,
  checkName: string,
): number {
  if (!harnessResult) return 0.5;

  const check = harnessResult.checks.find((c) => c.name === checkName);

  if (!check) return 0.5;

  return check.status === "passed" ? 1.0 : 0.0;
}

/**
 * Map a verification status string to a numeric score.
 *
 * @param status - Verification status
 * @returns Score: passed=1.0, partial=0.5, skipped=0.5, failed=0.0
 */
function mapVerificationStatus(
  status: "passed" | "partial" | "failed" | "skipped",
): number {
  switch (status) {
    case "passed":
      return 1.0;
    case "partial":
      return 0.5;
    case "skipped":
      return 0.5;
    case "failed":
      return 0.0;
  }
}

/**
 * Map a composite score (0-1) to a quality zone.
 *
 * Zone boundaries:
 * - >= 0.85 -> "peak"
 * - >= 0.65 -> "good"
 * - >= 0.45 -> "degrading"
 * - < 0.45  -> "stop"
 *
 * @param score - Composite quality score between 0 and 1
 * @returns Quality zone label
 *
 * @example
 * ```typescript
 * scoreToZone(0.9);   // "peak"
 * scoreToZone(0.7);   // "good"
 * scoreToZone(0.5);   // "degrading"
 * scoreToZone(0.3);   // "stop"
 * ```
 */
export function scoreToZone(score: number): QualityZone {
  if (score >= 0.85) return "peak";
  if (score >= 0.65) return "good";
  if (score >= 0.45) return "degrading";
  return "stop";
}
