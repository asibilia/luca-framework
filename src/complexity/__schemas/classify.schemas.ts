/**
 * Zod schemas for the deterministic classifier system.
 *
 * Defines input/output shapes, keyword dictionaries, weights,
 * thresholds, and routing history entries for the heuristic
 * complexity classifier.
 *
 * Uses snake_case for all field names per API conventions.
 * All types are inferred from schemas via z.infer.
 */
import { z } from "zod";

import { COMPLEXITY_LEVELS } from "./complexity.schemas";

import type { ComplexityLevel } from "./complexity.schemas";

// ─── Complexity Level Schema (local) ────────────────────────────────────────

/**
 * Complexity level Zod schema for classifier I/O validation.
 *
 * Uses the canonical COMPLEXITY_LEVELS array from the sibling
 * complexity.schemas module (T0 intra-domain import).
 */
export const classifierComplexitySchema = z.enum(COMPLEXITY_LEVELS);

// ─── Classifier Input ───────────────────────────────────────────────────────

/**
 * Input to the deterministic heuristic classifier.
 *
 * Contains task description and optional signal dimensions used
 * by the weighted-sum scoring algorithm.
 *
 * Uses snake_case for API compatibility.
 */
export const classifierInputSchema = z.object({
  /** Task description text to analyze for complexity signals */
  description: z.string(),
  /** Number of files expected to be touched */
  file_count: z.number().int().nonnegative().optional(),
  /** Cross-cutting scope domains (e.g., ["auth", "api", "database"]) */
  cross_cutting_scope: z.array(z.string()).optional(),
  /** Risk indicator keywords found in the task */
  risk_indicators: z.array(z.string()).optional(),
  /** Number of upstream/downstream dependencies */
  dependency_count: z.number().int().nonnegative().optional(),
  /** Roadmap phase data for additional context */
  roadmap_phase: z
    .object({
      task_count: z.number().int().nonnegative().optional(),
      file_references: z.number().int().nonnegative().optional(),
      dependencies: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type ClassifierInput = z.infer<typeof classifierInputSchema>;

// ─── Classifier Output ──────────────────────────────────────────────────────

/**
 * Output from the deterministic heuristic classifier.
 *
 * Contains the determined complexity level, routing decision,
 * composite score, and per-signal breakdown.
 *
 * Uses snake_case for API compatibility.
 */
export const classifierOutputSchema = z.object({
  /** Determined complexity level */
  complexity: classifierComplexitySchema,
  /** Routing decision: "direct" for simple tasks, "phased" for complex */
  route: z.enum(["direct", "phased"]),
  /** Composite score from 0.0 to 1.0 */
  score: z.number().min(0).max(1),
  /** Per-signal score breakdown */
  signals: z.record(z.string(), z.number()),
});
export type ClassifierOutput = z.infer<typeof classifierOutputSchema>;

// ─── Keyword Dictionary ─────────────────────────────────────────────────────

/**
 * Maps each complexity level to an array of keyword strings.
 *
 * Used by the keyword scoring dimension to determine the highest
 * matching complexity level from a task description.
 */
export const keywordDictionarySchema = z.record(
  classifierComplexitySchema,
  z.array(z.string()),
);
export type KeywordDictionary = z.infer<typeof keywordDictionarySchema>;

// ─── Classifier Weights ─────────────────────────────────────────────────────

/**
 * Weights for each signal dimension in the weighted-sum scorer.
 *
 * Default values match the D4 specification weights.
 * All weights should sum to 1.0 for normalized scoring.
 */
export const classifierWeightsSchema = z.object({
  keyword: z.number().min(0).max(1).default(0.2),
  file_scope: z.number().min(0).max(1).default(0.3),
  cross_cutting: z.number().min(0).max(1).default(0.2),
  risk: z.number().min(0).max(1).default(0.15),
  novelty: z.number().min(0).max(1).default(0.15),
});
export type ClassifierWeights = z.infer<typeof classifierWeightsSchema>;

// ─── Classifier Thresholds ──────────────────────────────────────────────────

/**
 * Score thresholds mapping each complexity level to its upper bound.
 *
 * TRIVIAL < 0.2, SIMPLE < 0.4, MODERATE < 0.6, COMPLEX < 0.8,
 * CRITICAL >= 0.8.
 */
export const classifierThresholdsSchema = z.object({
  TRIVIAL: z.number().default(0.2),
  SIMPLE: z.number().default(0.4),
  MODERATE: z.number().default(0.6),
  COMPLEX: z.number().default(0.8),
  CRITICAL: z.number().default(1.0),
});
export type ClassifierThresholds = z.infer<typeof classifierThresholdsSchema>;

// ─── Routing History Entry ──────────────────────────────────────────────────

/**
 * A single routing history entry for adaptive complexity adjustment.
 *
 * Records the outcome of a complexity classification for a phase,
 * including whether the initial classification was accurate.
 *
 * Uses snake_case for API compatibility.
 */
export const routingHistoryEntrySchema = z.object({
  /** ISO timestamp of when the classification was made */
  timestamp: z.string(),
  /** Phase number */
  phase: z.number().int(),
  /** Complexity level assigned by the classifier */
  initial_complexity: classifierComplexitySchema,
  /** Complexity level after any adjustments during execution */
  final_complexity: classifierComplexitySchema,
  /** Whether the phase execution succeeded */
  succeeded: z.boolean(),
  /** Whether execution stalled */
  stalled: z.boolean(),
  /** Iteration counts for fix loops */
  iteration_counts: z.object({
    harness_fix: z.number().int().nonnegative(),
    verify_fix: z.number().int().nonnegative(),
  }),
  /** Number of tasks in the phase */
  task_count: z.number().int().nonnegative(),
  /** Number of files touched */
  file_count: z.number().int().nonnegative(),
  /** Keywords that contributed to the classification */
  keywords: z.array(z.string()),
});
export type RoutingHistoryEntry = z.infer<typeof routingHistoryEntrySchema>;
