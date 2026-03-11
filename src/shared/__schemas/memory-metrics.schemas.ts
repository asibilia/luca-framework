/**
 * Memory effectiveness measurement schemas.
 *
 * Defines Zod schemas for tracking memory feedback, per-phase metrics,
 * and aggregated health summaries. These are the T0 building blocks
 * for the memory effectiveness instrumentation pipeline.
 *
 * Uses snake_case per API convention rule (these schemas represent
 * data that flows between agents and may be persisted/reported).
 *
 * Source: src/shared/__schemas/memory-metrics.schemas.ts
 */

import { z } from "zod";

// ─── Feedback Entry ─────────────────────────────────────────────────────────

/**
 * A single feedback event for a recalled engram.
 *
 * Records whether a specific engram was useful during a phase,
 * along with verification context. Fed to MuninnDB `muninn_feedback`
 * to update engram confidence scores over time.
 *
 * @example
 * ```typescript
 * const entry: MemoryFeedbackEntry = {
 *   engram_id: "01JEXAMPLE123",
 *   concept: "pitfall:build-all-crashes",
 *   useful: true,
 *   phase: 140,
 *   verification_passed: true,
 *   feedback_at: "2026-03-10T16:30:00Z",
 * };
 * ```
 */
export const MemoryFeedbackEntrySchema = z.object({
  /** The MuninnDB engram ID that received feedback */
  engram_id: z.string().min(1),
  /** Engram concept label for readability (e.g. "pitfall:build-all-crashes") */
  concept: z.string().optional(),
  /** Whether the engram was useful during this phase */
  useful: z.boolean(),
  /** Phase number where feedback was given */
  phase: z.number().int().positive(),
  /** Whether the phase verification passed */
  verification_passed: z.boolean(),
  /** ISO 8601 timestamp when feedback was recorded */
  feedback_at: z.string(),
});

export type MemoryFeedbackEntry = z.infer<typeof MemoryFeedbackEntrySchema>;

// ─── Phase Metrics ──────────────────────────────────────────────────────────

/**
 * Per-phase memory effectiveness metrics.
 *
 * Computed after each phase completes, capturing recall precision,
 * hit rate, token cost, staleness, and confidence calibration.
 * These metrics drive the memory health dashboard and inform
 * decay/pruning decisions.
 *
 * @example
 * ```typescript
 * const metrics: MemoryPhaseMetrics = {
 *   phase: 140,
 *   milestone: "v4.1.0",
 *   total_recalled: 8,
 *   total_applied: 5,
 *   total_ignored: 3,
 *   recall_precision: 0.625,
 *   hit_rate: 0.75,
 *   memory_tokens_injected: 420,
 *   stale_engram_pct: 0.1,
 *   confidence_calibration: 0.0,
 *   computed_at: "2026-03-10T16:30:00Z",
 * };
 * ```
 */
export const MemoryPhaseMetricsSchema = z.object({
  /** Phase number */
  phase: z.number(),
  /** Milestone identifier (e.g. "v4.1.0") */
  milestone: z.string(),
  /** Total engrams recalled for this phase */
  total_recalled: z.number().int().nonnegative(),
  /** Engrams marked as applied by executor */
  total_applied: z.number().int().nonnegative(),
  /** Engrams recalled but not applied */
  total_ignored: z.number().int().nonnegative(),
  /** applied / recalled (0 if no recalls) */
  recall_precision: z.number().min(0).max(1),
  /** phases_with_useful_recall / total_phases (0 if none) */
  hit_rate: z.number().min(0).max(1),
  /** Tokens used for memory context injection */
  memory_tokens_injected: z.number().int().nonnegative(),
  /** Percentage of recalled engrams with no positive feedback in 5+ phases */
  stale_engram_pct: z.number().min(0).max(1),
  /** Correlation between engram confidence and actual usefulness */
  confidence_calibration: z.number().min(0).max(1),
  /** ISO 8601 timestamp when metrics were computed */
  computed_at: z.string(),
});

export type MemoryPhaseMetrics = z.infer<typeof MemoryPhaseMetricsSchema>;

// ─── Health Summary ─────────────────────────────────────────────────────────

/**
 * Aggregated memory health summary for progress display.
 *
 * Provides a high-level view of memory system effectiveness
 * across phases. Used by progress reporters and the memory
 * dashboard to surface health status.
 *
 * @example
 * ```typescript
 * const health: MemoryHealthSummary = {
 *   total_engrams_recalled: 42,
 *   total_feedback_given: 38,
 *   overall_precision: 0.71,
 *   stale_count: 3,
 *   last_feedback_phase: 140,
 *   health_status: "healthy",
 * };
 * ```
 */
export const MemoryHealthSummarySchema = z.object({
  /** Total engrams recalled across all tracked phases */
  total_engrams_recalled: z.number().int().nonnegative(),
  /** Total feedback entries recorded */
  total_feedback_given: z.number().int().nonnegative(),
  /** Overall precision across all phases (applied / recalled) */
  overall_precision: z.number().min(0).max(1),
  /** Engrams with no positive feedback recently */
  stale_count: z.number().int().nonnegative(),
  /** Most recent phase where feedback was given */
  last_feedback_phase: z.number().optional(),
  /** Summary health status */
  health_status: z.enum(["healthy", "degraded", "no_data"]),
});

export type MemoryHealthSummary = z.infer<typeof MemoryHealthSummarySchema>;

// ─── Historical Phase Data ──────────────────────────────────────────────────

/**
 * Per-engram feedback history entry for stale detection.
 *
 * Tracks how many times an engram has been recalled and whether it received
 * positive feedback, across a rolling window of phases. Used by
 * `computeMemoryPhaseMetrics()` to compute `stale_engram_pct`.
 *
 * @example
 * ```typescript
 * const entry: EngramFeedbackHistoryEntry = {
 *   engram_id: "01JEXAMPLE123",
 *   total_recalls: 8,
 *   positive_recalls: 2,
 *   milestones_with_no_positive: 1,
 *   confidence: "high",
 * };
 * ```
 */
export const EngramFeedbackHistoryEntrySchema = z.object({
  /** The MuninnDB engram ID */
  engram_id: z.string().min(1),
  /** Times recalled across the rolling window */
  total_recalls: z.number().int().nonnegative(),
  /** Times feedback was useful=true */
  positive_recalls: z.number().int().nonnegative(),
  /** Milestones where this engram had 0 positive feedback */
  milestones_with_no_positive: z.number().int().nonnegative(),
  /** Current engram confidence level (if known) */
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

export type EngramFeedbackHistoryEntry = z.infer<
  typeof EngramFeedbackHistoryEntrySchema
>;

/**
 * A single confidence-vs-actual data point for calibration computation.
 *
 * Records the predicted confidence level of an engram alongside whether
 * it was actually useful. Collected across phases to measure how well
 * confidence scores predict real-world usefulness.
 *
 * @example
 * ```typescript
 * const entry: ConfidenceActualEntry = {
 *   confidence: "high",
 *   actually_useful: true,
 * };
 * ```
 */
export const ConfidenceActualEntrySchema = z.object({
  /** Predicted confidence level of the engram */
  confidence: z.enum(["low", "medium", "high"]),
  /** Whether the engram was actually useful in practice */
  actually_useful: z.boolean(),
});

export type ConfidenceActualEntry = z.infer<typeof ConfidenceActualEntrySchema>;

/**
 * Container for historical phase data passed to `computeMemoryPhaseMetrics()`.
 *
 * Provides the cross-phase context needed to compute `stale_engram_pct` and
 * `confidence_calibration`. Callers (phase-execute, milestone-complete) query
 * MuninnDB for the last N phases of data and populate this structure.
 *
 * Both arrays default to empty, so omitting either field gracefully degrades
 * the corresponding metric to 0 (backward compatible).
 *
 * @example
 * ```typescript
 * const historicalData: HistoricalPhaseData = {
 *   engram_feedback_history: [
 *     { engram_id: "01JEX1", total_recalls: 8, positive_recalls: 0,
 *       milestones_with_no_positive: 4, confidence: "low" },
 *     { engram_id: "01JEX2", total_recalls: 6, positive_recalls: 3,
 *       milestones_with_no_positive: 0, confidence: "high" },
 *   ],
 *   confidence_actuals: [
 *     { confidence: "high", actually_useful: true },
 *     { confidence: "low", actually_useful: false },
 *     // ... at least 10 entries for calibration to compute
 *   ],
 * };
 * ```
 */
export const HistoricalPhaseDataSchema = z.object({
  /** Per-engram feedback histories across the rolling window */
  engram_feedback_history: z
    .array(EngramFeedbackHistoryEntrySchema)
    .default([]),
  /** Confidence vs actual usefulness data points */
  confidence_actuals: z.array(ConfidenceActualEntrySchema).default([]),
});

export type HistoricalPhaseData = z.infer<typeof HistoricalPhaseDataSchema>;
