import groupBy from "lodash/groupBy";

import type {
  MemoryEntry,
  CompressionRecommendation,
  CompressionStrategy,
} from "../__schemas/memory.schemas";
import { estimateTokens } from "./token-estimator.ts";

/**
 * Configuration options for the compression analysis engine.
 */
interface CompressionOptions {
  /** Maximum age in days before entries become highly compressible (default: 365) */
  max_age_days?: number;
  /** Minimum recall count below which entries are considered stale (default: 0) */
  min_recall_threshold?: number;
}

/** Default options for compression analysis. */
const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  max_age_days: 365,
  min_recall_threshold: 0,
};

/** Confidence level mapped to a numeric weight (higher = less compressible). */
const CONFIDENCE_WEIGHTS: Record<string, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.9,
};

/**
 * Token savings multiplier per strategy.
 *
 * - archive: 100% of entry tokens saved (removed from active context)
 * - summarize: ~70% savings (keep ~30% as a 1-2 line summary)
 * - deduplicate: 100% of duplicate tokens saved
 * - merge: ~40% savings (combined entry shorter than sum of parts)
 * - keep: 0% savings
 */
const SAVINGS_MULTIPLIERS: Record<CompressionStrategy, number> = {
  archive: 1.0,
  summarize: 0.7,
  deduplicate: 1.0,
  merge: 0.4,
  keep: 0.0,
};

/**
 * Analyze memory entries and produce compression recommendations.
 *
 * Scoring factors (all normalized 0-1, higher = more compressible):
 * - age: (days_since_added / max_age_days). Older entries are more compressible.
 * - staleness: 1 - (recall_count / max_recall_count). Less recalled = more compressible.
 * - confidence_weight: low=0.3, medium=0.6, high=0.9. Low confidence = more compressible.
 *
 * Composite priority = (age * 0.3) + (staleness * 0.4) + ((1 - confidence_weight) * 0.3)
 *
 * Strategy assignment:
 * - duplicate detected -> "deduplicate" (merge into existing entry)
 * - priority >= 0.7 -> "archive" (move to archive section)
 * - priority >= 0.5 -> "summarize" (compress content to 1-2 lines)
 * - similar entries found -> "merge" (combine related entries)
 * - priority < 0.3 -> "keep" (no action)
 * - otherwise -> "summarize" (default for mid-range priority)
 *
 * @param entries - Array of memory entries to analyze
 * @param options - Optional configuration overrides
 * @returns Array of compression recommendations, one per entry
 *
 * @example
 * ```typescript
 * const entries = [
 *   { id: "1", category: "pattern", title: "Old pattern", content: "...",
 *     confidence: "low", added_at: "2023-01-01T00:00:00Z", recall_count: 0 },
 *   { id: "2", category: "decision", title: "Recent decision", content: "...",
 *     confidence: "high", added_at: "2024-12-01T00:00:00Z", recall_count: 5 },
 * ];
 * const recommendations = analyzeMemoryEntries(entries);
 * // First entry -> archive (old, low confidence, never recalled)
 * // Second entry -> keep (recent, high confidence, frequently recalled)
 * ```
 */
export function analyzeMemoryEntries(
  entries: MemoryEntry[],
  options?: CompressionOptions,
): CompressionRecommendation[] {
  if (entries.length === 0) return [];

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const now = Date.now();

  // Find max recall count for staleness normalization
  const maxRecallCount = Math.max(1, ...entries.map((e) => e.recall_count));

  // Detect duplicates by normalized title
  const duplicateMap = detectDuplicates(entries);

  // Track which entries have already been marked as duplicate targets
  const duplicateTargets = new Set<string>();
  for (const ids of Object.values(duplicateMap)) {
    if (ids.length > 1) {
      // First occurrence is the "original", rest are duplicates
      for (let i = 1; i < ids.length; i++) {
        duplicateTargets.add(ids[i]!);
      }
    }
  }

  const recommendations: CompressionRecommendation[] = [];

  for (const entry of entries) {
    // Check if this entry is a duplicate (not the first occurrence)
    if (duplicateTargets.has(entry.id)) {
      const normalizedTitle = normalizeTitle(entry.title);
      const groupIds = duplicateMap[normalizedTitle] ?? [];
      const originalId = groupIds[0] ?? entry.id;

      recommendations.push({
        entry_id: entry.id,
        strategy: "deduplicate",
        reason: `Duplicate of entry "${originalId}": titles match after normalization`,
        priority: 0.9,
        estimated_token_savings: estimateTokenSavings(entry, "deduplicate"),
        merge_target_id: originalId,
      });
      continue;
    }

    // Score the entry
    const ageDays = Math.max(
      0,
      (now - new Date(entry.added_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    const ageScore = Math.min(1, ageDays / opts.max_age_days);
    const stalenessScore = 1 - entry.recall_count / maxRecallCount;
    const confidenceWeight = CONFIDENCE_WEIGHTS[entry.confidence] ?? 0.5;
    const invertedConfidence = 1 - confidenceWeight;

    const priority =
      ageScore * 0.3 + stalenessScore * 0.4 + invertedConfidence * 0.3;

    // Assign strategy based on priority
    const { strategy, reason } = assignStrategy(
      entry,
      priority,
      ageScore,
      stalenessScore,
      confidenceWeight,
    );

    recommendations.push({
      entry_id: entry.id,
      strategy,
      reason,
      priority: Math.round(priority * 1000) / 1000,
      estimated_token_savings: estimateTokenSavings(entry, strategy),
    });
  }

  return recommendations;
}

/**
 * Assign a compression strategy based on the composite priority score.
 *
 * @param entry - The memory entry being evaluated
 * @param priority - Composite priority score (0-1)
 * @param ageScore - Age component score (0-1)
 * @param stalenessScore - Staleness component score (0-1)
 * @param confidenceWeight - Confidence weight (0-1, higher = more confident)
 * @returns Strategy and human-readable reason
 */
function assignStrategy(
  entry: MemoryEntry,
  priority: number,
  ageScore: number,
  stalenessScore: number,
  confidenceWeight: number,
): { strategy: CompressionStrategy; reason: string } {
  if (priority >= 0.7) {
    return {
      strategy: "archive",
      reason: `High compressibility (priority=${priority.toFixed(2)}): age=${ageScore.toFixed(2)}, staleness=${stalenessScore.toFixed(2)}, confidence=${confidenceWeight.toFixed(2)}. Entry "${entry.title}" is old, rarely recalled, and low confidence.`,
    };
  }

  if (priority >= 0.5) {
    return {
      strategy: "summarize",
      reason: `Moderate compressibility (priority=${priority.toFixed(2)}): age=${ageScore.toFixed(2)}, staleness=${stalenessScore.toFixed(2)}, confidence=${confidenceWeight.toFixed(2)}. Entry "${entry.title}" can be condensed to a summary.`,
    };
  }

  if (priority < 0.3) {
    return {
      strategy: "keep",
      reason: `Low compressibility (priority=${priority.toFixed(2)}): entry "${entry.title}" is recent, frequently recalled, or high confidence. No action needed.`,
    };
  }

  // Mid-range (0.3-0.5): default to summarize
  return {
    strategy: "summarize",
    reason: `Mid-range compressibility (priority=${priority.toFixed(2)}): entry "${entry.title}" may benefit from summarization.`,
  };
}

/**
 * Detect potential duplicate entries by title similarity.
 *
 * Groups entries by normalized title (lowercase, stripped punctuation,
 * collapsed whitespace). Entries with identical normalized titles
 * are considered duplicates.
 *
 * Cross-project deduplication: When entries share a normalized title,
 * local entries (no source_project) are ordered first so they become
 * the "original" that imported entries are deduplicated against.
 * This prevents global imports from accumulating duplicate entries.
 *
 * @param entries - Array of memory entries to check
 * @returns Map of normalized title to array of entry IDs (local entries first)
 */
function detectDuplicates(entries: MemoryEntry[]): Record<string, string[]> {
  const grouped = groupBy(entries, (e) => normalizeTitle(e.title));
  const result: Record<string, string[]> = {};
  for (const [key, group] of Object.entries(grouped)) {
    // Sort local entries (no source_project) before imported entries.
    // This ensures local entries are treated as the "original" when
    // deduplicating, so imported entries get marked as duplicates.
    const sorted = [...group].sort((a, b) => {
      const aIsLocal = !a.source_project ? 0 : 1;
      const bIsLocal = !b.source_project ? 0 : 1;
      return aIsLocal - bIsLocal;
    });
    result[key] = sorted.map((e) => e.id);
  }
  return result;
}

/**
 * Normalize a title for duplicate detection.
 *
 * Converts to lowercase, removes punctuation, and collapses whitespace.
 *
 * @param title - Raw title string
 * @returns Normalized title string
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Estimate token savings for a compression recommendation.
 *
 * @param entry - The memory entry to estimate savings for
 * @param strategy - The compression strategy to apply
 * @returns Estimated number of tokens saved (always >= 0)
 */
function estimateTokenSavings(
  entry: MemoryEntry,
  strategy: CompressionStrategy,
): number {
  const entryTokens =
    entry.token_estimate > 0
      ? entry.token_estimate
      : estimateTokens(entry.content);

  const multiplier = SAVINGS_MULTIPLIERS[strategy];
  return Math.round(entryTokens * multiplier);
}
