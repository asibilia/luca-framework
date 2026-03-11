/**
 * Zod schemas for recall scoring in the Luca Framework.
 *
 * Defines the weight configuration, per-signal score breakdowns,
 * and scored recall result shapes used by the embedding-aware
 * recall pipeline in lu-cognition.
 *
 * MuninnDB's semantic recall already returns a relevance `score` for
 * each result. These schemas layer a composite scoring model on top,
 * blending seven signals: semantic similarity, tag overlap, milestone
 * proximity, agent match, confidence, recency, and feedback score.
 * Weights sum to 1.0 for a normalised composite score.
 */
import { z } from "zod";

/**
 * Configurable weights for each scoring signal.
 *
 * Weights should sum to 1.0 for a normalised composite score.
 * Defaults are tuned so that milestone proximity and semantic
 * similarity dominate, with tag overlap and agent match providing
 * moderate differentiation, and confidence/recency/feedback acting
 * as light tie-breakers.
 *
 * Uses snake_case for API/data compatibility.
 */
export const RecallScoringWeightsSchema = z.object({
  /** Weight for the MuninnDB semantic similarity score (0.0-1.0). */
  semantic_similarity: z.number().min(0).max(1).default(0.25),
  /** Weight for Jaccard tag overlap between result tags and context tags. */
  tag_overlap: z.number().min(0).max(1).default(0.15),
  /** Weight for milestone proximity (current milestone = 1.0, recent = 0.5, old = 0.0). */
  milestone_proximity: z.number().min(0).max(1).default(0.225),
  /** Weight for agent name match in result content. */
  agent_match: z.number().min(0).max(1).default(0.15),
  /** Weight for confidence level of the engram (High > Medium > Low). */
  confidence: z.number().min(0).max(1).default(0.075),
  /** Weight for recency (exponential decay over 30 days). */
  recency: z.number().min(0).max(1).default(0.075),
  /** Weight for feedback score proxy (High=0.8, Medium/none=0.5, Low=0.2). */
  feedback_score: z.number().min(0).max(1).default(0.075),
});

export type RecallScoringWeights = z.infer<typeof RecallScoringWeightsSchema>;

/**
 * Breakdown of individual signal scores for a single recall result.
 *
 * Each field is the raw 0.0-1.0 score for that signal, before
 * weight multiplication. All seven signals are present:
 * semantic_similarity, tag_overlap, milestone_proximity,
 * agent_match, confidence, recency, and feedback_score.
 * Included in `ScoredRecallResult` for transparency and debugging.
 */
export const ScoreBreakdownSchema = z.object({
  semantic_similarity: z.number().min(0).max(1),
  tag_overlap: z.number().min(0).max(1),
  milestone_proximity: z.number().min(0).max(1),
  agent_match: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  recency: z.number().min(0).max(1),
  feedback_score: z.number().min(0).max(1),
});

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

/**
 * A single MuninnDB recall result enriched with composite scoring.
 *
 * `score` is the raw relevance score returned by MuninnDB's
 * semantic recall. `composite_score` is the weighted blend of
 * all scoring signals. `score_breakdown` exposes the per-signal
 * values for auditability.
 */
export const ScoredRecallResultSchema = z.object({
  /** MuninnDB engram ID. */
  id: z.string(),
  /** Concept key (e.g. "pattern:factory-functions"). */
  concept: z.string(),
  /** Full engram content text. */
  content: z.string(),
  /** Raw relevance score from MuninnDB semantic recall (0.0-1.0). */
  score: z.number().min(0).default(0),
  /** Weighted composite score blending all signals (0.0-1.0). */
  composite_score: z.number().min(0).default(0),
  /** Per-signal score breakdown for transparency. */
  score_breakdown: ScoreBreakdownSchema,
  /** Tags attached to the engram (empty array for legacy untagged entries). */
  tags: z.array(z.string()).default([]),
});

export type ScoredRecallResult = z.infer<typeof ScoredRecallResultSchema>;
