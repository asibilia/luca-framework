/**
 * Embedding-aware recall scoring for lu-cognition.
 *
 * Layers a composite scoring model on top of MuninnDB's native
 * semantic recall. Each result from `mcp__muninn__muninn_recall`
 * (with `mode: "semantic"`) already carries a relevance `score`.
 * This module computes additional signals -- tag overlap, milestone
 * proximity, agent name match, confidence, recency, and feedback
 * score -- then blends all seven via configurable weights into a
 * single `composite_score` for ranking.
 *
 * All functions are pure and side-effect-free.
 */
import orderBy from "lodash/orderBy";
import intersection from "lodash/intersection";
import union from "lodash/union";

import { escapeRegExp } from "~/shared";

import { RecallScoringWeightsSchema } from "~/agents/__schemas/recall-scoring.schemas";

import type {
  RecallScoringWeights,
  ScoreBreakdown,
  ScoredRecallResult,
} from "~/agents/__schemas/recall-scoring.schemas";

// ---------------------------------------------------------------------------
// Default weights (parsed from schema defaults so they stay in sync)
// ---------------------------------------------------------------------------

/**
 * Default weight configuration, derived from the schema's `.default()`
 * values so there is a single source of truth.
 */
export const DEFAULT_RECALL_WEIGHTS: RecallScoringWeights =
  RecallScoringWeightsSchema.parse({});

// ---------------------------------------------------------------------------
// Individual signal scorers
// ---------------------------------------------------------------------------

/**
 * Compute Jaccard similarity between two tag sets.
 *
 * Returns `|intersection| / |union|`, giving a 0.0-1.0 measure of
 * overlap. Returns 0.0 when either set is empty.
 *
 * @param resultTags  - Tags attached to the recalled engram
 * @param contextTags - Tags derived from the current task context
 * @returns Jaccard index (0.0-1.0)
 *
 * @example
 * ```typescript
 * computeTagOverlap(["auth", "api"], ["api", "debug"]) // 0.333...
 * computeTagOverlap(["auth"], ["auth"])                 // 1.0
 * computeTagOverlap([], ["api"])                        // 0.0
 * ```
 */
export function computeTagOverlap(
  resultTags: string[],
  contextTags: string[],
): number {
  const inter = intersection(resultTags, contextTags);
  const uni = union(resultTags, contextTags);

  if (uni.length === 0) return 0;

  return inter.length / uni.length;
}

/**
 * Compute milestone proximity score.
 *
 * Returns 1.0 if the result content mentions the current milestone,
 * 0.5 if it mentions any "recent" milestone pattern (e.g. `v3.x`,
 * `v4.x` when current is `v4.1.0`), and 0.0 otherwise.
 *
 * Matching is case-insensitive and supports common milestone
 * formats: `v1.2.3`, `v1.2`, `v1.x`.
 *
 * @param resultContent   - Full text content of the engram
 * @param currentMilestone - Current milestone identifier (e.g. "v4.1.0")
 * @returns Proximity score (0.0, 0.5, or 1.0)
 *
 * @example
 * ```typescript
 * computeMilestoneProximity("Shipped in v4.1.0", "v4.1.0") // 1.0
 * computeMilestoneProximity("Shipped in v4.0.0", "v4.1.0") // 0.5
 * computeMilestoneProximity("Old note from v2", "v4.1.0")   // 0.0
 * ```
 */
export function computeMilestoneProximity(
  resultContent: string,
  currentMilestone: string,
): number {
  if (!currentMilestone || !resultContent) return 0;

  const lower = resultContent.toLowerCase();
  const milestoneLower = currentMilestone.toLowerCase();

  // Exact milestone match
  if (lower.includes(milestoneLower)) return 1.0;

  // Extract major version prefix for "recent" milestone matching.
  // e.g. "v4.1.0" -> "v4."
  const majorMatch = milestoneLower.match(/^(v?\d+)\./);
  if (majorMatch) {
    const majorPrefix = majorMatch[1] ?? "";
    if (!majorPrefix) return 0;
    // Check if content mentions any version with the same major
    // e.g. "v4.0", "v4.2.1", etc.
    const recentPattern = new RegExp(
      `${escapeRegExp(majorPrefix)}\\.\\d+`,
      "i",
    );
    if (recentPattern.test(lower)) return 0.5;
  }

  return 0;
}

/**
 * Compute agent name match score.
 *
 * Returns 1.0 if the engram content mentions the given agent name,
 * 0.0 otherwise. Matching is case-insensitive.
 *
 * @param resultContent - Full text content of the engram
 * @param agentName     - Name of the current/target agent (e.g. "lu-executor")
 * @returns 1.0 if matched, 0.0 otherwise
 *
 * @example
 * ```typescript
 * computeAgentMatch("Used by lu-executor for wave grouping", "lu-executor") // 1.0
 * computeAgentMatch("General pattern for all agents", "lu-executor")        // 0.0
 * ```
 */
export function computeAgentMatch(
  resultContent: string,
  agentName: string,
): number {
  if (!agentName || !resultContent) return 0;

  return resultContent.toLowerCase().includes(agentName.toLowerCase())
    ? 1.0
    : 0.0;
}

/**
 * Compute recency score with exponential decay.
 *
 * Score is 1.0 for today, decaying exponentially toward 0.1 over
 * a 30-day half-life window. Results older than 30 days floor at 0.1.
 *
 * If `createdAt` is empty or unparseable, returns 0.5 as a neutral
 * fallback (legacy entries without timestamps).
 *
 * @param createdAt - ISO-8601 date string (or any Date-parseable string)
 * @param now       - Reference date (defaults to current time; injectable for testing)
 * @returns Recency score (0.1-1.0), or 0.5 for unparseable dates
 *
 * @example
 * ```typescript
 * computeRecencyScore(new Date().toISOString())                      // ~1.0
 * computeRecencyScore("2020-01-01T00:00:00Z", new Date("2026-03-10")) // 0.1
 * computeRecencyScore("")                                             // 0.5
 * ```
 */
export function computeRecencyScore(createdAt: string, now?: Date): number {
  if (!createdAt) return 0.5;

  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return 0.5;

  const reference = now ?? new Date();
  const daysDiff =
    (reference.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

  if (daysDiff <= 0) return 1.0;
  if (daysDiff >= 30) return 0.1;

  // Exponential decay from 1.0 to ~0.1 over 30 days
  // Using decay constant: ln(0.1) / 30 ~ -0.0767
  const decayRate = Math.log(0.1) / 30;
  return Math.max(0.1, Math.exp(decayRate * daysDiff));
}

/**
 * Compute feedback score as a proxy via engram confidence level.
 *
 * lu-learner promotes/demotes engram confidence based on actual
 * `muninn_feedback` results, so confidence serves as a usable proxy
 * for accumulated feedback data. The mapping:
 *
 * - "Confidence: High" in content -> 0.8
 * - "Confidence: Medium" or no marker -> 0.5 (neutral default)
 * - "Confidence: Low" in content -> 0.2
 *
 * The weight for this signal is deliberately small (0.075) to avoid
 * circular amplification with MuninnDB's internal SGD-based scoring.
 *
 * @param content - Engram content text
 * @returns Feedback score proxy (0.2, 0.5, or 0.8)
 *
 * @example
 * ```typescript
 * computeFeedbackScore("Confidence: High pattern")  // 0.8
 * computeFeedbackScore("Confidence: Low pitfall")    // 0.2
 * computeFeedbackScore("No confidence marker here")  // 0.5
 * ```
 */
export function computeFeedbackScore(content: string): number {
  if (!content) return 0.5;

  const lower = content.toLowerCase();

  if (lower.includes("confidence: high") || lower.includes("confidence:high")) {
    return 0.8;
  }
  if (lower.includes("confidence: low") || lower.includes("confidence:low")) {
    return 0.2;
  }

  // Medium, no marker, or unrecognised -> neutral default
  return 0.5;
}

// ---------------------------------------------------------------------------
// Raw recall result shape (what MuninnDB returns before scoring)
// ---------------------------------------------------------------------------

/**
 * Shape of a single result from MuninnDB recall.
 *
 * This is the input shape before composite scoring is applied.
 * We keep it as an interface (not a Zod schema) because it
 * represents external data that is already validated by MuninnDB.
 */
export interface RecallResult {
  /** MuninnDB engram ID. */
  id: string;
  /** Concept key. */
  concept: string;
  /** Full engram content. */
  content: string;
  /** Raw relevance score from MuninnDB semantic recall (0.0-1.0). */
  score: number;
  /** Tags attached to the engram. */
  tags?: string[];
  /** ISO-8601 creation timestamp (if available). */
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Composite scorer
// ---------------------------------------------------------------------------

/**
 * Scoring context derived from the current task/workflow state.
 */
export interface RecallScoringContext {
  /** Tags derived from the current task (keywords, phase tags, etc.). */
  tags: string[];
  /** Current milestone identifier (e.g. "v4.1.0"). */
  milestone: string;
  /** Name of the target/upcoming agent. */
  agentName: string;
}

/**
 * Score and rank a batch of MuninnDB recall results.
 *
 * For each result, computes individual signal scores, applies the
 * configured weights, and produces a composite score. Results are
 * returned sorted by `composite_score` descending.
 *
 * The MuninnDB `score` field from semantic recall is used directly
 * as the `semantic_similarity` signal -- it already represents
 * embedding-based relevance.
 *
 * @param results - Raw recall results from MuninnDB
 * @param context - Current task context for signal computation
 * @param weights - Optional weight overrides (schema defaults used if omitted)
 * @returns Scored results sorted by composite_score descending
 *
 * @example
 * ```typescript
 * const scored = scoreRecallResults(
 *   muninnResults,
 *   { tags: ["auth", "api"], milestone: "v4.1.0", agentName: "lu-executor" },
 * );
 * // scored[0] has the highest composite_score
 * // scored[0].score_breakdown shows per-signal detail
 * ```
 */
export function scoreRecallResults(
  results: RecallResult[],
  context: RecallScoringContext,
  weights?: Partial<RecallScoringWeights>,
): ScoredRecallResult[] {
  const resolvedWeights = RecallScoringWeightsSchema.parse(weights ?? {});

  const scored: ScoredRecallResult[] = results.map((result) => {
    const breakdown: ScoreBreakdown = {
      semantic_similarity: Math.min(1, Math.max(0, result.score)),
      tag_overlap: computeTagOverlap(result.tags ?? [], context.tags),
      milestone_proximity: computeMilestoneProximity(
        result.content,
        context.milestone,
      ),
      agent_match: computeAgentMatch(result.content, context.agentName),
      confidence: extractConfidenceScore(result.content),
      recency: computeRecencyScore(result.created_at ?? ""),
      feedback_score: computeFeedbackScore(result.content),
    };

    const compositeScore =
      breakdown.semantic_similarity * resolvedWeights.semantic_similarity +
      breakdown.tag_overlap * resolvedWeights.tag_overlap +
      breakdown.milestone_proximity * resolvedWeights.milestone_proximity +
      breakdown.agent_match * resolvedWeights.agent_match +
      breakdown.confidence * resolvedWeights.confidence +
      breakdown.recency * resolvedWeights.recency +
      breakdown.feedback_score * resolvedWeights.feedback_score;

    return {
      id: result.id,
      concept: result.concept,
      content: result.content,
      score: result.score,
      composite_score: Math.round(compositeScore * 1000) / 1000,
      score_breakdown: breakdown,
      tags: result.tags ?? [],
    };
  });

  return orderBy(scored, "composite_score", "desc");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a confidence score from engram content text.
 *
 * Scans for "Confidence: High/Medium/Low" patterns commonly found
 * in MuninnDB engrams. Returns 1.0 for High, 0.5 for Medium,
 * 0.25 for Low, and 0.5 as a neutral default when no marker is found.
 *
 * @param content - Engram content text
 * @returns Confidence score (0.25-1.0)
 */
function extractConfidenceScore(content: string): number {
  if (!content) return 0.5;

  const lower = content.toLowerCase();

  if (lower.includes("confidence: high") || lower.includes("confidence:high")) {
    return 1.0;
  }
  if (
    lower.includes("confidence: medium") ||
    lower.includes("confidence:medium")
  ) {
    return 0.5;
  }
  if (lower.includes("confidence: low") || lower.includes("confidence:low")) {
    return 0.25;
  }

  // No confidence marker -- neutral default
  return 0.5;
}
