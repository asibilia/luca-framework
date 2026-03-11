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
 * Note: `stale_engram_pct` and `confidence_calibration` are set to 0
 * for now -- they require historical cross-phase data that will be
 * populated at milestone boundaries by the metrics aggregator.
 *
 * @param rawConfig - Feedback entries, recall/apply counts, token cost, phase info
 * @returns Computed phase metrics
 *
 * @example
 * ```typescript
 * const metrics = computeMemoryPhaseMetrics({
 *   feedbackEntries: feedback,
 *   totalRecalled: 8,
 *   totalApplied: 5,
 *   memoryTokensInjected: 420,
 *   phase: 140,
 *   milestone: "v4.1.0",
 * });
 * // metrics.recall_precision === 0.625 (5/8)
 * // metrics.hit_rate === 0.625 (5 useful / 8 total)
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
    stale_engram_pct: 0, // Requires historical data, populated at milestone boundary
    confidence_calibration: 0, // Requires multi-phase data
    computed_at: new Date().toISOString(),
  });
}
