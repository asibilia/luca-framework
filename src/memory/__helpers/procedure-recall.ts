import { z } from "zod";
import type { ProcedureEntry } from "../__schemas/memory.schemas";

/**
 * Input validation schema for procedure recall context.
 *
 * Validates the planning context passed to recallProcedures() from
 * CLI bridge arguments (external input boundary).
 */
const recallContextSchema = z.object({
  phase_description: z.string().default(""),
  phase_tags: z.array(z.string()).default([]),
});

// ─── Stop Words ──────────────────────────────────────────────────────────────

/**
 * Common English stop words filtered during trigger similarity computation.
 * Removing these improves keyword-based Jaccard similarity by focusing on
 * content-bearing tokens.
 */
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "can",
  "could",
  "and",
  "but",
  "or",
  "nor",
  "for",
  "yet",
  "so",
  "in",
  "on",
  "at",
  "to",
  "from",
  "by",
  "with",
  "of",
  "it",
  "this",
  "that",
  "these",
  "those",
  "when",
  "where",
  "how",
  "what",
  "which",
  "who",
]);

// ─── Tag Overlap ─────────────────────────────────────────────────────────────

/**
 * Compute Jaccard similarity between two tag sets.
 *
 * Jaccard similarity = |intersection| / |union|.
 * Both tag arrays are lowercased before comparison.
 * Returns 0 if both sets are empty.
 *
 * @param tagsA - First tag array
 * @param tagsB - Second tag array
 * @returns Jaccard similarity coefficient (0.0 - 1.0)
 *
 * @example
 * ```typescript
 * computeTagOverlap(["coding", "testing"], ["testing", "patterns"])
 * // => 0.333... (1 shared / 3 union)
 * ```
 */
export function computeTagOverlap(tagsA: string[], tagsB: string[]): number {
  const setA = new Set(tagsA.map((t) => t.toLowerCase()));
  const setB = new Set(tagsB.map((t) => t.toLowerCase()));

  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const tag of setA) {
    if (setB.has(tag)) {
      intersectionSize++;
    }
  }

  const unionSize = new Set([...setA, ...setB]).size;

  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

// ─── Trigger Similarity ──────────────────────────────────────────────────────

/**
 * Compute keyword overlap between trigger text and phase description.
 *
 * Tokenizes both strings to lowercase words, removes stop words,
 * then computes Jaccard similarity on the remaining tokens.
 * Returns 0 if both token sets are empty after stop word removal.
 *
 * @param trigger - Procedure trigger text
 * @param description - Phase description text
 * @returns Jaccard similarity on content-bearing tokens (0.0 - 1.0)
 *
 * @example
 * ```typescript
 * computeTriggerSimilarity(
 *   "When adding a new API endpoint",
 *   "Add new REST API endpoints for user management"
 * )
 * // => high score due to shared "new", "api", "endpoint" tokens
 * ```
 */
export function computeTriggerSimilarity(
  trigger: string,
  description: string,
): number {
  const tokenize = (text: string): Set<string> => {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
    return new Set(words);
  };

  const triggerTokens = tokenize(trigger);
  const descTokens = tokenize(description);

  if (triggerTokens.size === 0 && descTokens.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const token of triggerTokens) {
    if (descTokens.has(token)) {
      intersectionSize++;
    }
  }

  const unionSize = new Set([...triggerTokens, ...descTokens]).size;

  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

// ─── Score Procedure ─────────────────────────────────────────────────────────

/**
 * Compute composite relevance score for a procedure against a planning context.
 *
 * Scoring formula:
 *   score = (tag_overlap * 0.4) + (trigger_similarity * 0.4) + (success_rate * 0.2)
 *
 * @param entry - Procedure entry to score
 * @param context - Planning context with phase description and tags
 * @returns Composite relevance score (0.0 - 1.0)
 *
 * @example
 * ```typescript
 * const score = scoreProcedure(entry, {
 *   phase_description: "Add new REST API endpoints",
 *   phase_tags: ["api", "coding"],
 * });
 * ```
 */
export function scoreProcedure(
  entry: ProcedureEntry,
  context: { phase_description: string; phase_tags: string[] },
): number {
  const tagScore = computeTagOverlap(entry.tags, context.phase_tags);
  const triggerScore = computeTriggerSimilarity(
    entry.trigger,
    context.phase_description,
  );
  return tagScore * 0.4 + triggerScore * 0.4 + entry.success_rate * 0.2;
}

// ─── Recall Procedures ───────────────────────────────────────────────────────

/**
 * Recall relevant procedures for a planning context.
 *
 * Filters to active procedures only, scores each using the composite
 * relevance formula, sorts by descending score, and returns the top N.
 *
 * Scoring formula:
 *   score = (tag_overlap * 0.4) + (trigger_similarity * 0.4) + (success_rate * 0.2)
 *
 * @param procedures - All available procedure entries
 * @param context - Planning context with phase description and tags
 * @param limit - Maximum number of procedures to return (default: 5)
 * @returns Top N active procedures sorted by relevance score (descending)
 *
 * @example
 * ```typescript
 * const relevant = recallProcedures(allProcedures, {
 *   phase_description: "Implement authentication system",
 *   phase_tags: ["security", "api"],
 * }, 3);
 * ```
 */
export function recallProcedures(
  procedures: ProcedureEntry[],
  context: { phase_description: string; phase_tags: string[] },
  limit: number = 5,
): ProcedureEntry[] {
  // Validate context at function boundary
  const parseResult = recallContextSchema.safeParse(context);
  const validContext = parseResult.success
    ? parseResult.data
    : { phase_description: "", phase_tags: [] as string[] };

  // 1. Filter to active procedures only
  const active = procedures.filter((p) => p.status === "active");

  // 2. Score each procedure
  const scored = active.map((entry) => ({
    entry,
    score: scoreProcedure(entry, validContext),
  }));

  // 3. Sort by descending score
  scored.sort((a, b) => b.score - a.score);

  // 4. Return top N (limit)
  return scored.slice(0, limit).map((s) => s.entry);
}
