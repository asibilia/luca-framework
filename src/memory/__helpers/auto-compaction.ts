/**
 * WORKING.md auto-compaction engine.
 *
 * Implements R9 requirements:
 * - R9.1: Auto-compaction triggers at degrading quality zone
 * - R9.2: Sections compacted by age/relevance scoring
 * - R9.3: Compacted content summarized, not deleted
 * - R9.4: Session continues after compaction (no hard stop)
 *
 * All functions are pure (no side effects, no disk I/O). The caller
 * is responsible for reading/writing WORKING.md.
 */

import type {
  WorkingMemory,
  CompactionConfig,
  CompactionResult,
  SectionScore,
} from "../__schemas/memory.schemas";
import {
  compactionConfigSchema,
  compactionResultSchema,
  WORKING_MEMORY_SECTIONS,
} from "../__schemas/memory.schemas";
import type { QualityZone } from "~/planner/__schemas/planner.schemas";
import { QUALITY_ZONES } from "~/planner/__schemas/planner.schemas";
import { estimateTokens } from "./token-estimator.ts";

/**
 * Determine whether compaction should trigger based on current quality zone.
 *
 * Compaction triggers when the current zone is at or past the configured
 * trigger_zone in severity (peak < good < degrading < stop).
 *
 * @param currentZone - The current quality zone from context monitor
 * @param config - Optional compaction configuration overrides
 * @returns true if compaction should trigger
 *
 * @example
 * ```typescript
 * shouldTriggerCompaction("degrading"); // true (default trigger is "degrading")
 * shouldTriggerCompaction("good");      // false
 * shouldTriggerCompaction("stop");      // true
 * ```
 */
export function shouldTriggerCompaction(
  currentZone: QualityZone,
  config?: Partial<CompactionConfig>,
): boolean {
  const cfg = compactionConfigSchema.parse(config ?? {});
  const zoneIndex = QUALITY_ZONES.indexOf(currentZone);
  const triggerIndex = QUALITY_ZONES.indexOf(cfg.trigger_zone);
  // Higher index = worse zone. Trigger when current >= trigger.
  return zoneIndex >= triggerIndex;
}

/**
 * Score each section in working memory by age, relevance, and size.
 *
 * Produces a composite score (0-1) for each section where higher
 * scores indicate sections more eligible for compaction (older,
 * less relevant, larger). Exempt sections receive a score of 0.
 *
 * Scoring weights:
 * - age_score (40%): Based on time since last update relative to session start
 * - relevance_score (30%): Heuristic based on section type
 * - size_score (30%): Token count relative to total working memory
 *
 * @param wm - Current working memory
 * @param config - Optional compaction configuration overrides
 * @returns Array of section scores sorted by composite score (descending)
 *
 * @example
 * ```typescript
 * const scores = scoreSections(wm);
 * // scores[0] is the most compaction-eligible section
 * ```
 */
export function scoreSections(
  wm: WorkingMemory,
  config?: Partial<CompactionConfig>,
): SectionScore[] {
  const cfg = compactionConfigSchema.parse(config ?? {});
  const now = Date.now();
  const sessionStart = wm.session_started_at
    ? new Date(wm.session_started_at).getTime()
    : now - 3600000; // fallback: 1 hour ago
  const sessionDuration = Math.max(1, now - sessionStart);
  const totalTokens = Math.max(1, wm.total_tokens);

  // Relevance weights by section type (lower = more relevant = less compactable)
  const relevanceWeights: Record<string, number> = {
    session_info: 0.1, // Very relevant, rarely compact
    planning_notes: 0.2, // Important for current work
    findings: 0.6, // Findings accumulate, often compactable
    hypotheses: 0.7, // Hypotheses are transient
    memory_recall: 0.5, // Recalled context, moderately compactable
    candidate_learnings: 0.4, // Keep until extraction
  };

  const scores: SectionScore[] = [];

  for (const section of wm.sections) {
    // Exempt sections get score 0
    if (
      cfg.exempt_sections.includes(
        section.name as (typeof WORKING_MEMORY_SECTIONS)[number],
      )
    ) {
      scores.push({
        section: section.name as (typeof WORKING_MEMORY_SECTIONS)[number],
        age_score: 0,
        relevance_score: 0,
        size_score: 0,
        composite_score: 0,
        token_count: section.token_estimate,
      });
      continue;
    }

    // Skip empty sections
    if (section.token_estimate === 0) {
      scores.push({
        section: section.name as (typeof WORKING_MEMORY_SECTIONS)[number],
        age_score: 0,
        relevance_score: 0,
        size_score: 0,
        composite_score: 0,
        token_count: 0,
      });
      continue;
    }

    // Age score: how old is this section relative to session duration
    const sectionAge = section.last_updated_at
      ? now - new Date(section.last_updated_at).getTime()
      : sessionDuration; // no timestamp = assume oldest
    const ageScore = Math.min(1, sectionAge / sessionDuration);

    // Relevance score: heuristic by section type
    const relevanceScore = relevanceWeights[section.name] ?? 0.5;

    // Size score: proportion of total tokens
    const sizeScore = Math.min(1, section.token_estimate / totalTokens);

    // Composite: weighted combination
    const compositeScore =
      ageScore * 0.4 + relevanceScore * 0.3 + sizeScore * 0.3;

    scores.push({
      section: section.name as (typeof WORKING_MEMORY_SECTIONS)[number],
      age_score: Math.round(ageScore * 1000) / 1000,
      relevance_score: Math.round(relevanceScore * 1000) / 1000,
      size_score: Math.round(sizeScore * 1000) / 1000,
      composite_score: Math.round(compositeScore * 1000) / 1000,
      token_count: section.token_estimate,
    });
  }

  // Sort by composite score descending (most compactable first)
  return scores.sort((a, b) => b.composite_score - a.composite_score);
}

/**
 * Compact a single section by summarizing its content.
 *
 * Preserves the key information from the section by keeping the most
 * recent lines that fit within the summary token budget and prepending
 * a compaction marker. The original content is summarized, not deleted.
 *
 * @param content - The section's full content
 * @param maxTokens - Maximum tokens for the compacted summary
 * @returns Object with the compacted content and before/after token counts
 *
 * @example
 * ```typescript
 * const result = compactSection("Long section content...", 200);
 * // result.summary starts with "[Compacted: ...]"
 * ```
 */
export function compactSection(
  content: string,
  maxTokens: number,
): { summary: string; tokens_before: number; tokens_after: number } {
  const tokensBefore = estimateTokens(content);

  // If already within budget, no compaction needed
  if (tokensBefore <= maxTokens) {
    return {
      summary: content,
      tokens_before: tokensBefore,
      tokens_after: tokensBefore,
    };
  }

  const lines = content.split("\n");
  const markerText = `[Compacted: original ~${tokensBefore} tokens]`;
  const markerTokens = estimateTokens(markerText);
  const availableTokens = Math.max(1, maxTokens - markerTokens - 1);

  const keptLines: string[] = [];
  let keptTokens = 0;

  // Keep lines from the end (most recent content first)
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineTokens = estimateTokens(lines[i]!);
    if (keptTokens + lineTokens > availableTokens && keptLines.length > 0) {
      break;
    }
    keptLines.unshift(lines[i]!);
    keptTokens += lineTokens;
  }

  const summary = `${markerText}\n\n${keptLines.join("\n")}`;
  const tokensAfter = estimateTokens(summary);

  return { summary, tokens_before: tokensBefore, tokens_after: tokensAfter };
}

/**
 * Orchestrate a full compaction pass over working memory.
 *
 * Executes all compaction steps in order:
 * 1. Score sections by age, relevance, and size (R9.2)
 * 2. Compact sections above the score threshold (R9.3)
 * 3. Return result with session_continued: true (R9.4)
 *
 * The caller should check shouldTriggerCompaction() first to determine
 * if the quality zone warrants compaction (R9.1).
 *
 * @param wm - Current working memory (not mutated)
 * @param config - Optional compaction configuration overrides
 * @returns Object with compaction result and updated working memory
 *
 * @example
 * ```typescript
 * if (shouldTriggerCompaction(currentZone)) {
 *   const { result, workingMemory } = compactWorkingMemory(wm);
 *   console.log(`Compacted ${result.sections_compacted.length} sections`);
 *   console.log(`Tokens: ${result.tokens_before} -> ${result.tokens_after}`);
 * }
 * ```
 */
export function compactWorkingMemory(
  wm: WorkingMemory,
  config?: Partial<CompactionConfig>,
): { result: CompactionResult; workingMemory: WorkingMemory } {
  const cfg = compactionConfigSchema.parse(config ?? {});
  const tokensBefore = wm.total_tokens;

  // Step 1: Score sections (R9.2)
  const scores = scoreSections(wm, cfg);

  // Step 2: Compact eligible sections above threshold (R9.3)
  const sectionsCompacted: string[] = [];
  const summaries: Array<{
    section: string;
    summary: string;
    tokens_before: number;
    tokens_after: number;
  }> = [];

  let updatedWm = { ...wm, sections: wm.sections.map((s) => ({ ...s })) };

  for (const score of scores) {
    // Skip sections below threshold
    if (score.composite_score < cfg.score_threshold) continue;
    // Skip exempt sections (already scored 0, but double-check)
    if (
      cfg.exempt_sections.includes(
        score.section as (typeof WORKING_MEMORY_SECTIONS)[number],
      )
    ) {
      continue;
    }
    // Skip empty sections
    if (score.token_count === 0) continue;

    // Find the section in the working memory
    const sectionIndex = updatedWm.sections.findIndex(
      (s) => s.name === score.section,
    );
    if (sectionIndex < 0) continue;

    const section = updatedWm.sections[sectionIndex]!;

    // Check minimum age requirement
    if (section.last_updated_at) {
      const age = Date.now() - new Date(section.last_updated_at).getTime();
      if (age < cfg.min_section_age_ms) continue;
    }

    // Only compact sections that are actually over the summary budget
    if (section.token_estimate <= cfg.summary_max_tokens) continue;

    // Compact the section
    const compacted = compactSection(section.content, cfg.summary_max_tokens);

    updatedWm.sections[sectionIndex] = {
      ...section,
      content: compacted.summary,
      token_estimate: compacted.tokens_after,
      last_updated_at: new Date().toISOString(),
    };

    sectionsCompacted.push(score.section);
    summaries.push({
      section: score.section,
      summary: compacted.summary,
      tokens_before: compacted.tokens_before,
      tokens_after: compacted.tokens_after,
    });
  }

  // Recalculate total tokens
  updatedWm.total_tokens = updatedWm.sections.reduce(
    (sum, s) => sum + s.token_estimate,
    0,
  );

  const tokensAfter = updatedWm.total_tokens;

  // Step 3: Build result with session_continued: true (R9.4)
  const result = compactionResultSchema.parse({
    sections_compacted: sectionsCompacted,
    tokens_before: tokensBefore,
    tokens_after: tokensAfter,
    summaries,
    session_continued: true,
    scores,
  });

  return { result, workingMemory: updatedWm };
}
