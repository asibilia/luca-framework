/**
 * Milestone-scoped recall scoring for MEMORY.md entries.
 *
 * Scores and ranks memory entries by milestone proximity and tag relevance.
 * Current milestone entries get higher weight; older milestone entries
 * get progressively lower temporal relevance scores.
 *
 * Scoring formula:
 *   score = (tag_overlap * tag_weight) + (milestone_proximity * milestone_weight)
 *         + (confidence_score * confidence_weight) + (recency * recency_weight)
 *
 * Default weights: tag=0.3, milestone=0.4, confidence=0.15, recency=0.15
 *
 * Uses snake_case for all schema field names per API conventions.
 *
 * @module memory/milestone-recall
 */
import type { MemoryEntry } from "./memory.schemas";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for milestone-scoped recall scoring.
 *
 * All weight fields are optional with sensible defaults.
 */
export interface MilestoneRecallConfig {
  /** Current milestone version string (e.g., "v1.6.0") */
  current_milestone: string;
  /** Weight multiplier for milestone relevance (default: 0.4) */
  milestone_weight?: number;
  /** Weight multiplier for tag overlap (default: 0.3) */
  tag_weight?: number;
  /** Weight multiplier for confidence (default: 0.15) */
  confidence_weight?: number;
  /** Weight multiplier for recency (default: 0.15) */
  recency_weight?: number;
}

/**
 * A memory entry with computed relevance scores.
 */
export interface ScoredMemoryEntry {
  /** The original memory entry */
  entry: MemoryEntry;
  /** Composite relevance score (0.0 - 1.0) */
  score: number;
  /** Milestone proximity score (0.0 - 1.0) */
  milestone_proximity: number;
  /** Tag overlap score (0.0 - 1.0) */
  tag_overlap: number;
}

// ─── Default Weights ────────────────────────────────────────────────────────

const DEFAULT_MILESTONE_WEIGHT = 0.4;
const DEFAULT_TAG_WEIGHT = 0.3;
const DEFAULT_CONFIDENCE_WEIGHT = 0.15;
const DEFAULT_RECENCY_WEIGHT = 0.15;

/** Proximity score for entries without a milestone field */
const NEUTRAL_MILESTONE_PROXIMITY = 0.5;

/** Milestone proximity scores by version distance */
const PROXIMITY_SCORES: Record<number, number> = {
  0: 1.0, // Same milestone
  1: 0.7, // Adjacent version
  2: 0.4, // Two versions apart
};
const DISTANT_PROXIMITY = 0.2; // Three+ versions apart

// ─── Version Parsing ────────────────────────────────────────────────────────

/**
 * Parsed semver-like version for comparison.
 */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parse a version string into numeric components.
 *
 * Handles common formats: "v1.6.0", "1.6.0", "v1.6", "1.6"
 * Returns null if the string cannot be parsed.
 *
 * @param version - Version string to parse
 * @returns Parsed version or null
 */
export function parseVersion(version: string): ParsedVersion | null {
  const cleaned = version.trim().replace(/^v/i, "");
  const parts = cleaned.split(".");

  if (parts.length < 2) return null;

  const major = parseInt(parts[0]!, 10);
  const minor = parseInt(parts[1]!, 10);
  const patch = parts[2] ? parseInt(parts[2], 10) : 0;

  if (
    !Number.isFinite(major) ||
    !Number.isFinite(minor) ||
    !Number.isFinite(patch)
  ) {
    return null;
  }

  return { major, minor, patch };
}

/**
 * Calculate the distance between two versions.
 *
 * Uses a weighted scheme: major difference counts as 10, minor as 1,
 * and patch differences are ignored for milestone proximity.
 *
 * @param a - First version
 * @param b - Second version
 * @returns Non-negative version distance
 */
export function versionDistance(a: ParsedVersion, b: ParsedVersion): number {
  const majorDiff = Math.abs(a.major - b.major);
  const minorDiff = Math.abs(a.minor - b.minor);
  return majorDiff * 10 + minorDiff;
}

// ─── Scoring Functions ──────────────────────────────────────────────────────

/**
 * Calculate milestone proximity score for an entry.
 *
 * @param entryMilestone - Entry's milestone string (may be undefined)
 * @param currentMilestone - Current milestone version string
 * @returns Proximity score (0.0 - 1.0)
 */
export function calculateMilestoneProximity(
  entryMilestone: string | undefined,
  currentMilestone: string,
): number {
  if (!entryMilestone) return NEUTRAL_MILESTONE_PROXIMITY;

  const entrySemver = parseVersion(entryMilestone);
  const currentSemver = parseVersion(currentMilestone);

  if (!entrySemver || !currentSemver) return NEUTRAL_MILESTONE_PROXIMITY;

  const distance = versionDistance(entrySemver, currentSemver);

  return PROXIMITY_SCORES[distance] ?? DISTANT_PROXIMITY;
}

/**
 * Calculate tag overlap score between entry tags and query tags.
 *
 * @param entryTags - Tags on the memory entry
 * @param queryTags - Tags to match against
 * @returns Overlap score (0.0 - 1.0)
 */
export function calculateTagOverlap(
  entryTags: string[],
  queryTags: string[],
): number {
  if (queryTags.length === 0) return 0;
  if (entryTags.length === 0) return 0;

  const entrySet = new Set(entryTags.map((t) => t.toLowerCase()));
  const querySet = new Set(queryTags.map((t) => t.toLowerCase()));

  let overlap = 0;
  for (const tag of querySet) {
    if (entrySet.has(tag)) overlap++;
  }

  return overlap / querySet.size;
}

/**
 * Map confidence level to a numeric score.
 *
 * @param confidence - Confidence level string
 * @returns Confidence score (0.0 - 1.0)
 */
function confidenceScore(confidence: string): number {
  switch (confidence) {
    case "high":
      return 1.0;
    case "medium":
      return 0.6;
    case "low":
      return 0.3;
    default:
      return 0.3;
  }
}

/**
 * Calculate recency score based on when the entry was added.
 *
 * Recent entries (< 30 days) get higher scores.
 * Entries older than 180 days get a minimum baseline.
 *
 * @param addedAt - ISO 8601 date string when entry was added
 * @returns Recency score (0.0 - 1.0)
 */
function recencyScore(addedAt: string): number {
  const added = new Date(addedAt).getTime();
  if (!Number.isFinite(added)) return 0.3;

  const now = Date.now();
  const daysSinceAdded = (now - added) / (1000 * 60 * 60 * 24);

  if (daysSinceAdded < 30) return 1.0;
  if (daysSinceAdded < 90) return 0.7;
  if (daysSinceAdded < 180) return 0.4;
  return 0.2;
}

// ─── Main Scoring Function ──────────────────────────────────────────────────

/**
 * Score and rank memory entries by milestone proximity and relevance.
 *
 * Computes a composite score for each entry using weighted factors:
 * - Tag overlap with query tags (default weight: 0.3)
 * - Milestone proximity to current milestone (default weight: 0.4)
 * - Confidence level (default weight: 0.15)
 * - Recency of entry (default weight: 0.15)
 *
 * Returns entries sorted by descending score.
 *
 * @param entries - All parsed memory entries
 * @param queryTags - Tags to match against (from phase/task context)
 * @param config - Scoring configuration with current milestone and optional weights
 * @returns Entries sorted by descending composite score
 *
 * @example
 * ```typescript
 * const scored = scoreMilestoneRecall(entries, ["state-machine"], {
 *   current_milestone: "v1.6.0",
 * });
 * // scored[0] has the highest relevance to current milestone + tags
 * ```
 */
export function scoreMilestoneRecall(
  entries: MemoryEntry[],
  queryTags: string[],
  config: MilestoneRecallConfig,
): ScoredMemoryEntry[] {
  const milestoneWeight = config.milestone_weight ?? DEFAULT_MILESTONE_WEIGHT;
  const tagWeight = config.tag_weight ?? DEFAULT_TAG_WEIGHT;
  const confWeight = config.confidence_weight ?? DEFAULT_CONFIDENCE_WEIGHT;
  const recWeight = config.recency_weight ?? DEFAULT_RECENCY_WEIGHT;

  const scored: ScoredMemoryEntry[] = entries.map((entry) => {
    const milestoneProximity = calculateMilestoneProximity(
      entry.milestone,
      config.current_milestone,
    );
    const tagOverlap = calculateTagOverlap(entry.tags, queryTags);
    const conf = confidenceScore(entry.confidence);
    const recency = recencyScore(entry.added_at);

    const score =
      tagOverlap * tagWeight +
      milestoneProximity * milestoneWeight +
      conf * confWeight +
      recency * recWeight;

    return {
      entry,
      score: Math.round(score * 1000) / 1000,
      milestone_proximity: milestoneProximity,
      tag_overlap: tagOverlap,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}
