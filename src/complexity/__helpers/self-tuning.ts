import { z } from "zod";

import {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  type ComplexityLevel,
} from "../__schemas/complexity.schemas";

// ─── Schemas ────────────────────────────────────────────────────────────────

/**
 * A single complexity prediction record for accuracy assessment.
 *
 * Captures what was predicted vs what was observed after execution,
 * enabling calibration of the complexity routing model.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ComplexityPredictionRecordSchema = z.object({
  /** Unique identifier for this prediction (e.g., phase or task id) */
  task_id: z.string(),
  /** Predicted complexity level from lu-router */
  predicted: z.enum(COMPLEXITY_LEVELS),
  /** Actual complexity observed after execution */
  actual: z.enum(COMPLEXITY_LEVELS),
  /** ISO 8601 timestamp when prediction was made */
  predicted_at: z.string(),
  /** Optional: number of files actually modified */
  actual_file_count: z.number().int().nonnegative().optional(),
  /** Optional: actual execution iterations needed */
  actual_iterations: z.number().int().nonnegative().optional(),
});

/** A single complexity prediction record. */
export type ComplexityPredictionRecord = z.infer<
  typeof ComplexityPredictionRecordSchema
>;

/**
 * Result of assessing a single prediction's accuracy.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ComplexityAccuracyResultSchema = z.object({
  /** The task ID assessed */
  task_id: z.string(),
  /** Whether prediction exactly matched actual */
  exact_match: z.boolean(),
  /** Signed distance: positive = over-predicted, negative = under-predicted */
  distance: z.number().int(),
  /** Direction of mismatch */
  direction: z.enum(["exact", "over", "under"]),
});

/** Result of a single prediction accuracy assessment. */
export type ComplexityAccuracyResult = z.infer<
  typeof ComplexityAccuracyResultSchema
>;

/**
 * Tuning recommendation from analyzing prediction history.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ComplexityTuningResultSchema = z.object({
  /** Total number of predictions analyzed */
  total_predictions: z.number().int().nonnegative(),
  /** Number of exact matches */
  exact_matches: z.number().int().nonnegative(),
  /** Accuracy rate (exact_matches / total_predictions) */
  accuracy_rate: z.number().min(0).max(1),
  /** Average signed distance (positive = systematic over-prediction) */
  mean_distance: z.number(),
  /** Per-level accuracy breakdown */
  per_level: z.array(
    z.object({
      level: z.enum(COMPLEXITY_LEVELS),
      predictions: z.number().int().nonnegative(),
      exact: z.number().int().nonnegative(),
      over: z.number().int().nonnegative(),
      under: z.number().int().nonnegative(),
    }),
  ),
  /** Actionable recommendations for threshold adjustments */
  recommendations: z.array(z.string()),
});

/** Tuning recommendation result. */
export type ComplexityTuningResult = z.infer<
  typeof ComplexityTuningResultSchema
>;

// ─── Assess Single Prediction ───────────────────────────────────────────────

/**
 * Assess the accuracy of a single complexity prediction.
 *
 * Computes the signed distance between predicted and actual complexity
 * levels using the COMPLEXITY_ORDER index. Positive distance means
 * over-prediction (predicted harder than actual), negative means
 * under-prediction (predicted easier than actual).
 *
 * @param predicted - The predicted complexity level
 * @param actual - The actual complexity level observed
 * @param taskId - Optional task identifier for the result
 * @returns Accuracy assessment with distance and direction
 *
 * @example
 * ```typescript
 * const result = assessComplexityAccuracy("COMPLEX", "MODERATE");
 * // result.distance === 1 (over-predicted by 1 level)
 * // result.direction === "over"
 * ```
 */
export function assessComplexityAccuracy(
  predicted: ComplexityLevel,
  actual: ComplexityLevel,
  taskId: string = "",
): ComplexityAccuracyResult {
  const predictedIndex = COMPLEXITY_ORDER[predicted];
  const actualIndex = COMPLEXITY_ORDER[actual];
  const distance = predictedIndex - actualIndex;

  let direction: "exact" | "over" | "under";
  if (distance === 0) {
    direction = "exact";
  } else if (distance > 0) {
    direction = "over";
  } else {
    direction = "under";
  }

  return {
    task_id: taskId,
    exact_match: distance === 0,
    distance,
    direction,
  };
}

// ─── Tune Complexity Model ──────────────────────────────────────────────────

/**
 * Analyze prediction history and recommend threshold adjustments.
 *
 * Aggregates accuracy metrics across all predictions, computes
 * per-level breakdown of over/under/exact predictions, and generates
 * actionable recommendations for improving routing accuracy.
 *
 * @param history - Array of prediction records to analyze
 * @returns Tuning result with accuracy metrics and recommendations
 *
 * @example
 * ```typescript
 * const tuning = tuneComplexityModel([
 *   { task_id: "t1", predicted: "COMPLEX", actual: "MODERATE", predicted_at: "..." },
 *   { task_id: "t2", predicted: "SIMPLE", actual: "SIMPLE", predicted_at: "..." },
 * ]);
 * // tuning.accuracy_rate === 0.5
 * // tuning.recommendations may include "Reduce COMPLEX threshold..."
 * ```
 */
export function tuneComplexityModel(
  history: ComplexityPredictionRecord[],
): ComplexityTuningResult {
  if (history.length === 0) {
    return {
      total_predictions: 0,
      exact_matches: 0,
      accuracy_rate: 0,
      mean_distance: 0,
      per_level: COMPLEXITY_LEVELS.map((level) => ({
        level,
        predictions: 0,
        exact: 0,
        over: 0,
        under: 0,
      })),
      recommendations: ["Insufficient data: no prediction records to analyze."],
    };
  }

  // Assess each prediction
  const assessments = history.map((record) =>
    assessComplexityAccuracy(record.predicted, record.actual, record.task_id),
  );

  const exactMatches = assessments.filter((a) => a.exact_match).length;
  const totalDistance = assessments.reduce((sum, a) => sum + a.distance, 0);
  const accuracyRate = Math.round((exactMatches / history.length) * 100) / 100;
  const meanDistance = Math.round((totalDistance / history.length) * 100) / 100;

  // Per-level breakdown
  const perLevel = COMPLEXITY_LEVELS.map((level) => {
    const levelAssessments = assessments.filter(
      (_, i) => history[i]!.predicted === level,
    );

    return {
      level,
      predictions: levelAssessments.length,
      exact: levelAssessments.filter((a) => a.direction === "exact").length,
      over: levelAssessments.filter((a) => a.direction === "over").length,
      under: levelAssessments.filter((a) => a.direction === "under").length,
    };
  });

  // Generate recommendations
  const recommendations: string[] = [];

  if (accuracyRate < 0.5) {
    recommendations.push(
      `Low overall accuracy (${(accuracyRate * 100).toFixed(0)}%). Consider recalibrating complexity classification criteria.`,
    );
  }

  if (meanDistance > 0.5) {
    recommendations.push(
      `Systematic over-prediction (mean distance: +${meanDistance.toFixed(2)}). Consider raising thresholds for higher complexity levels.`,
    );
  } else if (meanDistance < -0.5) {
    recommendations.push(
      `Systematic under-prediction (mean distance: ${meanDistance.toFixed(2)}). Consider lowering thresholds for higher complexity levels.`,
    );
  }

  // Per-level recommendations for consistently mispredicted levels
  for (const levelStats of perLevel) {
    if (levelStats.predictions < 3) continue;

    const overRate = levelStats.over / levelStats.predictions;
    const underRate = levelStats.under / levelStats.predictions;

    if (overRate > 0.6) {
      recommendations.push(
        `${levelStats.level} is over-predicted ${(overRate * 100).toFixed(0)}% of the time. Raise the ${levelStats.level} threshold to reduce false positives.`,
      );
    }
    if (underRate > 0.6) {
      recommendations.push(
        `${levelStats.level} is under-predicted ${(underRate * 100).toFixed(0)}% of the time. Lower the ${levelStats.level} threshold to catch more tasks at this level.`,
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      `Model accuracy is good (${(accuracyRate * 100).toFixed(0)}%). No threshold adjustments recommended.`,
    );
  }

  return {
    total_predictions: history.length,
    exact_matches: exactMatches,
    accuracy_rate: accuracyRate,
    mean_distance: meanDistance,
    per_level: perLevel,
    recommendations,
  };
}
