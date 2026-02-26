import type { PhaseQualityMetrics, QualityTrend } from "../__schemas/memory.schemas";
import { qualityTrendSchema } from "../__schemas/memory.schemas";
import type { Result } from "~/shared/__schemas/shared.schemas";

/**
 * Create an empty quality trend tracker.
 *
 * Initializes a new QualityTrend with no phases, zero rolling average,
 * no regression detected, and the specified window size for rolling
 * average computation.
 *
 * @param windowSize - Number of recent phases to include in rolling average (default: 5)
 * @returns Initialized QualityTrend via schema.parse()
 *
 * @example
 * ```typescript
 * const trend = createQualityTrend();
 * // { phases: [], rolling_average: 0, regression_detected: false, window_size: 5 }
 *
 * const customTrend = createQualityTrend(10);
 * // { phases: [], rolling_average: 0, regression_detected: false, window_size: 10 }
 * ```
 */
export function createQualityTrend(windowSize?: number): QualityTrend {
  // Internal construction — .parse() validates shape, data is computed (not external input)
  return qualityTrendSchema.parse({
    phases: [],
    rolling_average: 0,
    regression_detected: false,
    window_size: windowSize ?? 5,
  });
}

/**
 * Add phase metrics to the trend and recompute rolling average.
 *
 * Returns a NEW QualityTrend (immutable -- does not mutate input).
 * After appending the new metrics, the rolling average is recomputed
 * over the last `window_size` phases, and regression detection runs.
 *
 * @param trend - Current quality trend (not mutated)
 * @param metrics - New phase quality metrics to add
 * @returns New QualityTrend with updated phases, rolling average, and regression status
 *
 * @example
 * ```typescript
 * let trend = createQualityTrend();
 * trend = addPhaseMetrics(trend, phase1Metrics);
 * trend = addPhaseMetrics(trend, phase2Metrics);
 * console.log(trend.rolling_average);
 * ```
 */
export function addPhaseMetrics(
  trend: QualityTrend,
  metrics: PhaseQualityMetrics,
): QualityTrend {
  const newPhases = [...trend.phases, metrics];
  const rollingAverage = computeRollingAverage(newPhases, trend.window_size);
  const regression = detectRegression(
    newPhases,
    rollingAverage,
    trend.window_size,
  );

  // Internal construction — .parse() validates shape, data is computed (not external input)
  return qualityTrendSchema.parse({
    phases: newPhases,
    rolling_average: Math.round(rollingAverage * 1000) / 1000,
    regression_detected: regression.detected,
    regression_details: regression.details,
    window_size: trend.window_size,
  });
}

/**
 * Compute rolling average of composite scores over the window.
 *
 * Takes the last `windowSize` phases and averages their composite_score
 * values. Returns 0 if no phases are available.
 *
 * @param phases - Ordered array of phase quality metrics
 * @param windowSize - Number of recent phases to include
 * @returns Rolling average of composite scores (0-1)
 *
 * @example
 * ```typescript
 * const avg = computeRollingAverage(phases, 5);
 * // Returns average of last 5 phases' composite scores
 * ```
 */
export function computeRollingAverage(
  phases: PhaseQualityMetrics[],
  windowSize: number,
): number {
  if (phases.length === 0) return 0;

  const window = phases.slice(-windowSize);
  const sum = window.reduce((acc, p) => acc + p.composite_score, 0);

  return sum / window.length;
}

/**
 * Detect quality regression.
 *
 * Regression is detected when:
 * 1. There are at least 3 phases in the trend, AND
 * 2. The current phase composite_score is more than 0.15 below the rolling average,
 *    OR two consecutive phases show declining scores.
 *
 * @param phases - Ordered array of phase quality metrics
 * @param rollingAverage - Current rolling average of composite scores
 * @param _windowSize - Window size (reserved for future use)
 * @returns Object with detected flag and optional details string
 *
 * @example
 * ```typescript
 * const result = detectRegression(phases, 0.8, 5);
 * if (result.detected) {
 *   console.warn(result.details);
 * }
 * ```
 */
export function detectRegression(
  phases: PhaseQualityMetrics[],
  rollingAverage: number,
  _windowSize: number,
): { detected: boolean; details?: string } {
  if (phases.length < 3) {
    return { detected: false };
  }

  const currentPhase = phases[phases.length - 1]!;
  const currentScore = currentPhase.composite_score;

  // Check condition 1: current score is > 0.15 below rolling average
  const dropFromAverage = rollingAverage - currentScore;
  if (dropFromAverage > 0.15) {
    return {
      detected: true,
      details: `Quality regression: phase ${currentPhase.phase_id} score (${currentScore.toFixed(3)}) is ${dropFromAverage.toFixed(3)} below rolling average (${rollingAverage.toFixed(3)}). Threshold: 0.15.`,
    };
  }

  // Check condition 2: two consecutive declining phases
  if (phases.length >= 3) {
    const prev = phases[phases.length - 2]!;
    const prevPrev = phases[phases.length - 3]!;

    if (
      currentScore < prev.composite_score &&
      prev.composite_score < prevPrev.composite_score
    ) {
      return {
        detected: true,
        details: `Quality regression: two consecutive declining phases detected. Scores: ${prevPrev.composite_score.toFixed(3)} -> ${prev.composite_score.toFixed(3)} -> ${currentScore.toFixed(3)}.`,
      };
    }
  }

  return { detected: false };
}

/**
 * Serialize quality trend to JSON for storage in STATE.md or MEMORY.md.
 *
 * Produces a pretty-printed JSON string that can be embedded in markdown
 * code blocks or stored as a standalone file.
 *
 * @param trend - Quality trend to serialize
 * @returns Pretty-printed JSON string
 *
 * @example
 * ```typescript
 * const json = serializeTrend(trend);
 * await Bun.write(".planning/quality-trend.json", json);
 * ```
 */
export function serializeTrend(trend: QualityTrend): string {
  return JSON.stringify(trend, null, 2);
}

/**
 * Deserialize quality trend from stored JSON.
 *
 * Parses the JSON string and validates it against the qualityTrendSchema.
 * Returns a Result discriminated union: success with data, or failure
 * with an error message.
 *
 * @param json - JSON string to deserialize
 * @returns Result with QualityTrend on success, or error message on failure
 *
 * @example
 * ```typescript
 * const json = await Bun.file(".planning/quality-trend.json").text();
 * const result = deserializeTrend(json);
 * if (result.success) {
 *   console.log(result.data.rolling_average);
 * }
 * ```
 */
export function deserializeTrend(json: string): Result<QualityTrend> {
  try {
    const parsed = JSON.parse(json) as unknown;
    const result = qualityTrendSchema.safeParse(parsed);

    if (!result.success) {
      return {
        success: false,
        error: `Invalid QualityTrend schema: ${result.error.message}`,
      };
    }

    return { success: true, data: result.data };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
