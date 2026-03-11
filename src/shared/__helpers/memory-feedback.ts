/**
 * Memory feedback determination and phase metrics computation.
 *
 * Provides two core functions for the memory effectiveness pipeline:
 * 1. `determineFeedback()` — maps verification outcomes to per-engram feedback
 * 2. `computeMemoryPhaseMetrics()` — computes effectiveness metrics from feedback
 *
 * Uses a SIMPLE heuristic (per research Pitfall 2): verification pass/fail
 * combined with applied-engram tracking determines usefulness. This avoids
 * over-engineering attribution while still providing actionable signal.
 *
 * Source: src/shared/__helpers/memory-feedback.ts
 */

import { z } from "zod";
import filter from "lodash/filter";
import mean from "lodash/mean";

import { RecalledEngramSchema } from "../__schemas/recall-cache.schemas";
import type { RecalledEngram } from "../__schemas/recall-cache.schemas";

import {
  MemoryFeedbackEntrySchema,
  MemoryPhaseMetricsSchema,
  HistoricalPhaseDataSchema,
} from "../__schemas/memory-metrics.schemas";

import type {
  MemoryFeedbackEntry,
  MemoryPhaseMetrics,
  HistoricalPhaseData,
} from "../__schemas/memory-metrics.schemas";

// ─── Config Schemas ─────────────────────────────────────────────────────────

/**
 * Configuration for `determineFeedback()`.
 *
 * Internal schema, uses camelCase. Provides the inputs needed to
 * map verification outcomes to per-engram feedback entries.
 *
 * @example
 * ```typescript
 * const config: DetermineFeedbackConfig = {
 *   recalledEngrams: [
 *     { engramId: "01JEXAMPLE1", content: "Use Bun APIs", concept: "pattern:bun" },
 *     { engramId: "01JEXAMPLE2", content: "No classes", concept: "decision:no-classes" },
 *   ],
 *   verificationPassed: true,
 *   appliedEngramIds: ["01JEXAMPLE1"],
 *   phase: 140,
 * };
 * ```
 */
const DetermineFeedbackConfigSchema = z.object({
  /** Recalled engrams from the recall cache */
  recalledEngrams: z.array(RecalledEngramSchema),
  /** Whether the phase verification passed */
  verificationPassed: z.boolean(),
  /** IDs of engrams the executor reported as applied */
  appliedEngramIds: z.array(z.string()).default([]),
  /** Current phase number */
  phase: z.number().int().positive(),
});

type DetermineFeedbackConfig = z.infer<typeof DetermineFeedbackConfigSchema>;

/**
 * Configuration for `computeMemoryPhaseMetrics()`.
 *
 * Internal schema, uses camelCase. Provides the inputs needed to
 * compute the five effectiveness metrics for a phase. The optional
 * `historicalData` field enables computation of `stale_engram_pct`
 * and `confidence_calibration` from cross-phase MuninnDB data.
 *
 * @example
 * ```typescript
 * const config: ComputeMetricsConfig = {
 *   feedbackEntries: [...],
 *   totalRecalled: 8,
 *   totalApplied: 5,
 *   memoryTokensInjected: 420,
 *   phase: 140,
 *   milestone: "v4.1.0",
 *   historicalData: {
 *     engram_feedback_history: [...],
 *     confidence_actuals: [...],
 *   },
 * };
 * ```
 */
const ComputeMetricsConfigSchema = z.object({
  /** Feedback entries from determineFeedback() */
  feedbackEntries: z.array(MemoryFeedbackEntrySchema),
  /** Total engrams recalled */
  totalRecalled: z.number().int().nonnegative(),
  /** Total engrams marked as applied */
  totalApplied: z.number().int().nonnegative(),
  /** Tokens used for memory context injection */
  memoryTokensInjected: z.number().int().nonnegative(),
  /** Current phase number */
  phase: z.number(),
  /** Milestone identifier */
  milestone: z.string(),
  /** Optional historical data for stale_engram_pct and confidence_calibration */
  historicalData: HistoricalPhaseDataSchema.optional(),
});

type ComputeMetricsConfig = z.infer<typeof ComputeMetricsConfigSchema>;

// ─── Private Helpers ────────────────────────────────────────────────────────

/**
 * Compute the percentage of stale engrams from historical feedback data.
 *
 * An engram is considered stale when BOTH conditions are met:
 * 1. `total_recalls >= MIN_STALE_RECALLS` AND `positive_recalls === 0` (recalled often, never useful)
 * 2. `milestones_with_no_positive >= MIN_DORMANT_MILESTONES` (consistently unhelpful across milestones)
 *
 * This conservative dual-threshold approach minimizes false positives — an engram
 * must be both heavily recalled and consistently unhelpful to be flagged stale.
 *
 * @param historicalData - Historical phase data from MuninnDB, or undefined
 * @returns Stale percentage clamped to [0, 1], or 0 if no data
 */
function computeStaleEngramPct(
  historicalData: HistoricalPhaseData | undefined,
): number {
  if (!historicalData || historicalData.engram_feedback_history.length === 0) {
    return 0;
  }

  const history = historicalData.engram_feedback_history;

  const staleCount = filter(
    history,
    (entry) =>
      entry.total_recalls >= MIN_STALE_RECALLS &&
      entry.positive_recalls === 0 &&
      entry.milestones_with_no_positive >= MIN_DORMANT_MILESTONES,
  ).length;

  return staleCount / history.length;
}

/** Minimum recalls with 0 positive feedback to be considered stale. */
const MIN_STALE_RECALLS = 5;

/** Minimum milestones with no positive feedback to be considered stale. */
const MIN_DORMANT_MILESTONES = 3;

/** Minimum number of confidence_actuals entries required for calibration. */
const MIN_CALIBRATION_SAMPLES = 10;

/**
 * Expected usefulness rate per confidence level.
 *
 * These rates represent reasonable calibration targets:
 * - low (0.33): engrams marked low confidence should be useful ~1/3 of the time
 * - medium (0.66): engrams marked medium should be useful ~2/3 of the time
 * - high (0.90): engrams marked high should be useful ~90% of the time
 */
const EXPECTED_USEFULNESS = {
  low: 0.33,
  medium: 0.66,
  high: 0.9,
} as const;

/**
 * Compute confidence calibration score from historical confidence-vs-actual data.
 *
 * Measures how well engram confidence levels predict actual usefulness.
 * For each confidence level (low, medium, high), compares the expected
 * usefulness rate against the actual rate, then returns:
 *
 *   `1 - average(|expected - actual| for each level with data)`
 *
 * Expected usefulness rates: low=0.33, medium=0.66, high=0.90.
 *
 * Requires a minimum of 10 entries (per research Pitfall 5 -- minimum
 * sample size guard) to avoid noisy calibration from sparse data.
 * Confidence levels with no entries are skipped in the average.
 *
 * @param historicalData - Historical phase data from MuninnDB, or undefined
 * @returns Calibration score clamped to [0, 1], or 0 if insufficient data
 */
function computeConfidenceCalibration(
  historicalData: HistoricalPhaseData | undefined,
): number {
  if (
    !historicalData ||
    historicalData.confidence_actuals.length < MIN_CALIBRATION_SAMPLES
  ) {
    return 0;
  }

  const actuals = historicalData.confidence_actuals;

  // Group entries by confidence level
  const byLevel: Record<string, { total: number; useful: number }> = {};

  for (const entry of actuals) {
    const level = entry.confidence;
    if (!byLevel[level]) {
      byLevel[level] = { total: 0, useful: 0 };
    }
    byLevel[level].total += 1;
    if (entry.actually_useful) {
      byLevel[level].useful += 1;
    }
  }

  // Compute |expected - actual| for each level that has data
  const deviations: number[] = [];

  for (const level of ["low", "medium", "high"] as const) {
    const data = byLevel[level];
    if (!data || data.total === 0) {
      continue;
    }

    const actualRate = data.useful / data.total;
    const expectedRate = EXPECTED_USEFULNESS[level];
    deviations.push(Math.abs(expectedRate - actualRate));
  }

  // No confidence levels had data (shouldn't happen with 10+ entries, but guard)
  if (deviations.length === 0) {
    return 0;
  }

  const avgDeviation = mean(deviations);

  return Math.min(Math.max(1 - avgDeviation, 0), 1);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Determine feedback for each recalled engram based on verification outcome.
 *
 * Uses a SIMPLE heuristic to avoid over-engineering attribution:
 *
 * - **Verification PASSED**: All recalled engrams marked as `useful: true`
 * - **Verification FAILED + applied engrams specified**: Applied engrams
 *   marked `useful: false` (they contributed to failing code), non-applied
 *   marked `useful: true` (they were not responsible)
 * - **Verification FAILED + no applied engrams**: All marked `useful: false`
 *
 * Returns an array of `MemoryFeedbackEntry` objects ready for MuninnDB
 * `muninn_feedback` calls.
 *
 * @param rawConfig - Recalled engrams, verification result, applied IDs, phase
 * @returns Array of feedback entries for each recalled engram
 *
 * @example
 * ```typescript
 * // Phase passed -- all engrams were useful
 * const feedback = determineFeedback({
 *   recalledEngrams: [
 *     { engramId: "01JEX1", content: "Use Bun APIs", concept: "pattern:bun" },
 *     { engramId: "01JEX2", content: "No classes", concept: "decision:no-classes" },
 *   ],
 *   verificationPassed: true,
 *   appliedEngramIds: ["01JEX1"],
 *   phase: 140,
 * });
 * // feedback[0].useful === true, feedback[1].useful === true
 *
 * // Phase failed, some applied -- applied engrams marked not useful
 * const feedback2 = determineFeedback({
 *   recalledEngrams: [...],
 *   verificationPassed: false,
 *   appliedEngramIds: ["01JEX1"],
 *   phase: 140,
 * });
 * // 01JEX1: useful === false, 01JEX2: useful === true
 * ```
 */
export function determineFeedback(
  rawConfig: DetermineFeedbackConfig,
): MemoryFeedbackEntry[] {
  const parseResult = DetermineFeedbackConfigSchema.safeParse(rawConfig);

  if (!parseResult.success) {
    console.warn(
      "[MEMORY] determineFeedback received invalid config:",
      parseResult.error.message,
    );
    return [];
  }

  const config = parseResult.data;

  if (config.recalledEngrams.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const appliedSet = new Set(config.appliedEngramIds);

  return config.recalledEngrams.map((engram): MemoryFeedbackEntry => {
    let useful: boolean;

    if (config.verificationPassed) {
      // Phase passed: all recalled engrams considered useful
      useful = true;
    } else if (appliedSet.size > 0) {
      // Phase failed with known applied engrams:
      // applied = not useful (contributed to failure), non-applied = useful
      useful = !appliedSet.has(engram.engramId);
    } else {
      // Phase failed with no applied info: all marked not useful
      useful = false;
    }

    return MemoryFeedbackEntrySchema.parse({
      engram_id: engram.engramId,
      concept: engram.concept,
      useful,
      phase: config.phase,
      verification_passed: config.verificationPassed,
      feedback_at: now,
    });
  });
}

/**
 * Compute per-phase memory effectiveness metrics.
 *
 * Takes feedback entries and token cost data, produces the five
 * core effectiveness metrics defined in `MemoryPhaseMetricsSchema`.
 *
 * When `historicalData` is provided, `stale_engram_pct` is computed from
 * engram feedback history using a dual-threshold: engrams with 5+ recalls
 * and 0 positive feedback across 3+ milestones are considered stale.
 * When omitted, `stale_engram_pct` returns 0 (backward compatible).
 *
 * `confidence_calibration` requires `historicalData.confidence_actuals`
 * with 10+ entries (minimum sample size guard). When insufficient data
 * is available, returns 0 (backward compatible).
 *
 * @param rawConfig - Feedback entries, recall/apply counts, token cost, phase info,
 *   and optional historicalData for stale/calibration computation
 * @returns Computed phase metrics
 *
 * @example
 * ```typescript
 * // Basic usage (no historical data -- stale and calibration are 0)
 * const metrics = computeMemoryPhaseMetrics({
 *   feedbackEntries: feedback,
 *   totalRecalled: 8,
 *   totalApplied: 5,
 *   memoryTokensInjected: 420,
 *   phase: 140,
 *   milestone: "v4.1.0",
 * });
 * // metrics.recall_precision === 0.625 (5/8)
 * // metrics.stale_engram_pct === 0
 *
 * // With historical data
 * const metricsWithHistory = computeMemoryPhaseMetrics({
 *   feedbackEntries: feedback,
 *   totalRecalled: 8,
 *   totalApplied: 5,
 *   memoryTokensInjected: 420,
 *   phase: 140,
 *   milestone: "v4.1.0",
 *   historicalData: {
 *     engram_feedback_history: [
 *       { engram_id: "01JEX1", total_recalls: 8, positive_recalls: 0,
 *         milestones_with_no_positive: 4 },
 *       { engram_id: "01JEX2", total_recalls: 6, positive_recalls: 3,
 *         milestones_with_no_positive: 0 },
 *     ],
 *     confidence_actuals: [
 *       { confidence: "high", actually_useful: true },
 *       // ... 10+ entries needed
 *     ],
 *   },
 * });
 * // metricsWithHistory.stale_engram_pct === 0.5 (1 stale / 2 total)
 * ```
 */
export function computeMemoryPhaseMetrics(
  rawConfig: ComputeMetricsConfig,
): MemoryPhaseMetrics {
  const parseResult = ComputeMetricsConfigSchema.safeParse(rawConfig);

  if (!parseResult.success) {
    console.warn(
      "[MEMORY] computeMemoryPhaseMetrics received invalid config:",
      parseResult.error.message,
    );
    return MemoryPhaseMetricsSchema.parse({
      phase: 0,
      milestone: "unknown",
      total_recalled: 0,
      total_applied: 0,
      total_ignored: 0,
      recall_precision: 0,
      hit_rate: 0,
      memory_tokens_injected: 0,
      stale_engram_pct: 0,
      confidence_calibration: 0,
      computed_at: new Date().toISOString(),
    });
  }

  const config = parseResult.data;

  const recallPrecision =
    config.totalRecalled > 0 ? config.totalApplied / config.totalRecalled : 0;

  const usefulCount = config.feedbackEntries.filter((e) => e.useful).length;
  const hitRate =
    config.totalRecalled > 0 ? usefulCount / config.totalRecalled : 0;

  return MemoryPhaseMetricsSchema.parse({
    phase: config.phase,
    milestone: config.milestone,
    total_recalled: config.totalRecalled,
    total_applied: config.totalApplied,
    total_ignored: config.totalRecalled - config.totalApplied,
    recall_precision: Math.min(recallPrecision, 1),
    hit_rate: Math.min(hitRate, 1),
    memory_tokens_injected: config.memoryTokensInjected,
    stale_engram_pct: computeStaleEngramPct(config.historicalData),
    confidence_calibration: computeConfidenceCalibration(config.historicalData),
    computed_at: new Date().toISOString(),
  });
}
