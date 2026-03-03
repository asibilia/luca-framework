import { z } from "zod";
import { loopTypeSchema, loopOutcomeSchema } from "./iteration.schemas";

/**
 * Metrics schema for tracking iteration loop outcomes.
 *
 * Records predicted vs actual iteration counts, stall events,
 * and whether debate changed the outcome. Used for ground truth
 * measurement of debate system effectiveness.
 *
 * Uses snake_case for data schema compatibility.
 */
export const iterationMetricsSchema = z.object({
  /** Phase number */
  phase: z.number().int().positive(),
  /** Which loop type produced these metrics */
  loop: loopTypeSchema,
  /** Predicted stall point (from heuristics, 0 = no prediction) */
  predicted_stall_point: z.number().int().nonnegative().default(0),
  /** Actual number of iterations completed */
  actual_iteration_count: z.number().int().nonnegative(),
  /** How the loop terminated */
  outcome: loopOutcomeSchema,
  /** Number of stall events during the loop */
  stall_events: z.number().int().nonnegative().default(0),
  /** Whether a debate agent changed the outcome (retry vs halt) */
  debate_changed_outcome: z.boolean().default(false),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});
export type IterationMetrics = z.infer<typeof iterationMetricsSchema>;

/**
 * Metrics schema for tracking plan quality outcomes.
 *
 * Records WSJF scores, complexity, execution duration,
 * and gap counts for plan-level quality measurement.
 *
 * Uses snake_case for data schema compatibility.
 */
export const planQualityMetricsSchema = z.object({
  /** Plan identifier (e.g., "91-A") */
  plan_id: z.string(),
  /** Phase number */
  phase: z.number().int().positive(),
  /** WSJF priority score assigned to this plan */
  wsjf_score: z.number().nonnegative().default(0),
  /** Complexity classification of the plan */
  complexity: z.string(),
  /** Total execution duration in milliseconds */
  execution_duration_ms: z.number().int().nonnegative().default(0),
  /** How the plan execution concluded */
  outcome: z.string(),
  /** Number of verification gaps found post-execution */
  gap_count: z.number().int().nonnegative().default(0),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});
export type PlanQualityMetrics = z.infer<typeof planQualityMetricsSchema>;

/**
 * Metrics schema for tracking code review outcomes.
 *
 * Records reviewer counts, issue totals, and debate-related
 * disagreement detection for review quality measurement.
 *
 * Uses snake_case for data schema compatibility.
 */
export const reviewMetricsSchema = z.object({
  /** Phase number */
  phase: z.number().int().positive(),
  /** Number of reviewers that participated */
  reviewer_count: z.number().int().nonnegative(),
  /** Total issues found across all reviewers */
  total_issues: z.number().int().nonnegative(),
  /** Issue count by severity level */
  issues_by_severity: z.record(z.string(), z.number().int().nonnegative()),
  /** Issue count by source agent */
  issues_by_agent: z.record(z.string(), z.number().int().nonnegative()),
  /** Whether debate/tribunal was enabled for this review */
  debate_enabled: z.boolean().default(false),
  /** Number of inter-reviewer disagreements detected */
  disagreements_detected: z.number().int().nonnegative().default(0),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});
export type ReviewMetrics = z.infer<typeof reviewMetricsSchema>;

/**
 * Metrics schema for tracking convergence behavior.
 *
 * Records premature halts, stale counts, and whether
 * debate overrode a halt decision for convergence analysis.
 *
 * Uses snake_case for data schema compatibility.
 */
export const convergenceMetricsSchema = z.object({
  /** Phase number */
  phase: z.number().int().positive(),
  /** Which loop type this convergence was assessed in */
  loop: loopTypeSchema,
  /** Whether the loop halted prematurely (before max iterations) */
  premature_halt: z.boolean(),
  /** Iteration number at which halt occurred (0 = no halt) */
  halt_iteration: z.number().int().nonnegative().default(0),
  /** Total consecutive stale count at halt */
  total_stale_count: z.number().int().nonnegative(),
  /** Convergence signal values at the time of halt */
  signals_at_halt: z
    .object({
      error_count_delta: z.number().int(),
      fingerprint_overlap: z.number().min(0).max(1),
      artifact_change_delta: z.number().int().nonnegative(),
      semantic_overlap: z.number().min(0).max(1).optional(),
    })
    .optional(),
  /** Whether a debate agent overrode the halt decision */
  debate_override: z.boolean().default(false),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});
export type ConvergenceMetrics = z.infer<typeof convergenceMetricsSchema>;

/**
 * Top-level metrics file schema.
 *
 * Contains versioned arrays of all metric types.
 * Stored at `.planning/metrics.json`.
 *
 * Uses snake_case for data schema compatibility.
 */
export const metricsFileSchema = z.object({
  /** Schema version */
  version: z.literal("1.0"),
  /** Iteration loop metrics */
  iteration_metrics: z.array(iterationMetricsSchema).default([]),
  /** Plan quality metrics */
  plan_quality_metrics: z.array(planQualityMetricsSchema).default([]),
  /** Code review metrics */
  review_metrics: z.array(reviewMetricsSchema).default([]),
  /** Convergence behavior metrics */
  convergence_metrics: z.array(convergenceMetricsSchema).default([]),
});
export type MetricsFile = z.infer<typeof metricsFileSchema>;
