/**
 * Context pruning engine for working memory.
 *
 * Implements R8 requirements:
 * - R8.1: Stale ResultEnvelope auto-digestion at degrading zone
 * - R8.2: Section-level pruning with configurable retention policies
 * - R8.3: Pruning preserves critical context (active task, current plan)
 * - R8.4: Pruning events logged to WORKING.md
 *
 * All functions are pure (no side effects, no disk I/O). The caller
 * is responsible for reading/writing WORKING.md.
 */

import type {
  WorkingMemory,
  WorkingMemorySection,
  PruningConfig,
  PruningEvent,
  PruningResult,
  RetentionPolicy,
} from "../__schemas/memory.schemas";
import {
  pruningConfigSchema,
  pruningResultSchema,
  WORKING_MEMORY_SECTIONS,
} from "../__schemas/memory.schemas";
import { estimateTokens } from "./token-estimator.ts";
import { addSection } from "./working-memory.ts";

/** Section names that are treated as critical by default. */
const DEFAULT_CRITICAL_SECTIONS = ["session_info", "planning_notes"] as const;

/** Regex pattern to detect embedded ResultEnvelope JSON blocks in content. */
const ENVELOPE_JSON_PATTERN =
  /```json\s*\n\s*\{[\s\S]*?"status"\s*:\s*"(?:success|partial|failed|timeout)"[\s\S]*?\}\s*\n\s*```/g;

/** Regex pattern to detect inline result summaries from agents. */
const ENVELOPE_SUMMARY_PATTERN =
  /\*\*Result(?:Envelope)?\*\*:?\s*(?:status|summary)\s*[:=]/gi;

/**
 * Detect and digest stale ResultEnvelopes in working memory sections.
 *
 * Scans all non-critical sections for embedded ResultEnvelope JSON blocks
 * or inline result summaries. Replaces verbose envelopes with a one-line
 * digest: `[Digested: {agent_name} — {status}]`.
 *
 * This reduces token usage from detailed agent output while preserving
 * the key signal (which agent ran and whether it succeeded).
 *
 * @param wm - Current working memory (not mutated)
 * @param config - Pruning configuration
 * @returns Object with updated working memory and array of pruning events
 *
 * @example
 * ```typescript
 * const { workingMemory, events } = digestStaleEnvelopes(wm, config);
 * // events: [{ section: "findings", action: "digest", tokens_freed: 150, ... }]
 * ```
 */
export function digestStaleEnvelopes(
  wm: WorkingMemory,
  config?: Partial<PruningConfig>,
): { workingMemory: WorkingMemory; events: PruningEvent[] } {
  const cfg = pruningConfigSchema.parse(config ?? {});
  const events: PruningEvent[] = [];
  let updatedWm = { ...wm, sections: wm.sections.map((s) => ({ ...s })) };

  for (const section of updatedWm.sections) {
    // Skip critical sections
    if (
      cfg.critical_sections.includes(
        section.name as (typeof WORKING_MEMORY_SECTIONS)[number],
      )
    ) {
      continue;
    }

    const originalTokens = section.token_estimate;
    let digestedContent = section.content;

    // Replace JSON envelope blocks with one-line digests
    const jsonMatches = digestedContent.match(ENVELOPE_JSON_PATTERN);
    if (jsonMatches) {
      for (const match of jsonMatches) {
        const digest = extractEnvelopeDigest(match);
        digestedContent = digestedContent.replace(match, digest);
      }
    }

    // Replace verbose inline result summaries with compact form
    const summaryMatches = digestedContent.match(ENVELOPE_SUMMARY_PATTERN);
    if (summaryMatches) {
      for (const match of summaryMatches) {
        // Find the full line containing the match and truncate to one line
        const lineRegex = new RegExp(`^.*${escapeRegex(match)}.*$`, "gm");
        const fullLines = digestedContent.match(lineRegex);
        if (fullLines) {
          for (const line of fullLines) {
            if (line.length > 200) {
              const truncated = line.slice(0, 100) + " [truncated]";
              digestedContent = digestedContent.replace(line, truncated);
            }
          }
        }
      }
    }

    // Update section if content changed
    if (digestedContent !== section.content) {
      const newTokens = estimateTokens(digestedContent);
      const tokensSaved = Math.max(0, originalTokens - newTokens);

      section.content = digestedContent;
      section.token_estimate = newTokens;
      section.last_updated_at = new Date().toISOString();

      if (tokensSaved > 0) {
        events.push({
          timestamp: new Date().toISOString(),
          section: section.name,
          action: "digest",
          tokens_freed: tokensSaved,
          reason: `Digested ${jsonMatches?.length ?? 0} stale ResultEnvelope(s) in ${section.name}`,
        });
      }
    }
  }

  // Recalculate total tokens
  updatedWm.total_tokens = updatedWm.sections.reduce(
    (sum, s) => sum + s.token_estimate,
    0,
  );

  return { workingMemory: updatedWm, events };
}

/**
 * Apply section-level retention policies to working memory.
 *
 * For each section with a retention policy, checks whether the section
 * exceeds its max_tokens limit. If so, truncates from the beginning
 * (keeping the most recent content) to fit within the limit.
 *
 * Sections listed in critical_sections are always skipped.
 *
 * @param wm - Current working memory (not mutated)
 * @param config - Pruning configuration with retention policies
 * @returns Object with updated working memory and array of pruning events
 *
 * @example
 * ```typescript
 * const config = {
 *   retention_policies: [
 *     { section: "findings", max_tokens: 1000, max_age_ms: 3600000, priority: 3 },
 *   ],
 *   critical_sections: ["session_info"],
 * };
 * const { workingMemory, events } = applySectionRetention(wm, config);
 * ```
 */
export function applySectionRetention(
  wm: WorkingMemory,
  config?: Partial<PruningConfig>,
): { workingMemory: WorkingMemory; events: PruningEvent[] } {
  const cfg = pruningConfigSchema.parse(config ?? {});
  const events: PruningEvent[] = [];
  let updatedWm = { ...wm, sections: wm.sections.map((s) => ({ ...s })) };

  // Build a policy map for quick lookup
  const policyMap = new Map<string, RetentionPolicy>();
  for (const policy of cfg.retention_policies) {
    policyMap.set(policy.section, policy);
  }

  for (const section of updatedWm.sections) {
    // Skip critical sections
    if (
      cfg.critical_sections.includes(
        section.name as (typeof WORKING_MEMORY_SECTIONS)[number],
      )
    ) {
      continue;
    }

    const policy = policyMap.get(section.name);
    if (!policy) continue;

    const originalTokens = section.token_estimate;

    // Check max_tokens threshold
    if (originalTokens > policy.max_tokens) {
      const truncated = truncateToTokenBudget(
        section.content,
        policy.max_tokens,
      );
      const newTokens = estimateTokens(truncated);
      const tokensSaved = Math.max(0, originalTokens - newTokens);

      section.content = truncated;
      section.token_estimate = newTokens;
      section.last_updated_at = new Date().toISOString();

      if (tokensSaved > 0) {
        events.push({
          timestamp: new Date().toISOString(),
          section: section.name,
          action: "truncate",
          tokens_freed: tokensSaved,
          reason: `Section "${section.name}" exceeded ${policy.max_tokens} token limit (was ${originalTokens})`,
        });
      }
    }
  }

  // Recalculate total tokens
  updatedWm.total_tokens = updatedWm.sections.reduce(
    (sum, s) => sum + s.token_estimate,
    0,
  );

  return { workingMemory: updatedWm, events };
}

/**
 * Identify which sections are critical and must be preserved.
 *
 * Returns a set of section names that should never be pruned,
 * based on the pruning configuration and default critical sections.
 *
 * @param config - Pruning configuration
 * @returns Set of section names that are critical
 *
 * @example
 * ```typescript
 * const critical = preserveCriticalContext(config);
 * // Set { "session_info", "planning_notes" }
 * ```
 */
export function preserveCriticalContext(
  config?: Partial<PruningConfig>,
): Set<string> {
  const cfg = pruningConfigSchema.parse(config ?? {});
  return new Set(cfg.critical_sections);
}

/**
 * Log pruning events to the session_info section of working memory.
 *
 * Appends a formatted log entry for each pruning event to the
 * session_info section. This provides an audit trail of all
 * pruning actions taken during the session.
 *
 * @param wm - Current working memory (not mutated)
 * @param events - Array of pruning events to log
 * @returns New working memory with events appended to session_info
 *
 * @example
 * ```typescript
 * const updated = logPruningEvents(wm, events);
 * // session_info now contains:
 * // **Pruning:** 2 events, 350 tokens freed
 * // - [digest] findings: Digested 1 stale ResultEnvelope(s) (150 tokens)
 * // - [truncate] hypotheses: Exceeded 1000 token limit (200 tokens)
 * ```
 */
export function logPruningEvents(
  wm: WorkingMemory,
  events: PruningEvent[],
): WorkingMemory {
  if (events.length === 0) return wm;

  const totalFreed = events.reduce((sum, e) => sum + e.tokens_freed, 0);
  const lines = [
    `**Pruning:** ${events.length} event(s), ${totalFreed} tokens freed`,
  ];

  for (const event of events) {
    lines.push(
      `- [${event.action}] ${event.section}: ${event.reason} (${event.tokens_freed} tokens)`,
    );
  }

  return addSection(wm, "session_info", lines.join("\n"));
}

/**
 * Orchestrate a full pruning pass over working memory.
 *
 * Executes all pruning steps in order:
 * 1. Digest stale ResultEnvelopes (R8.1)
 * 2. Apply section retention policies (R8.2)
 * 3. Preserve critical sections (R8.3)
 * 4. Log pruning events to WORKING.md (R8.4)
 *
 * Returns a PruningResult with all events and the updated working memory.
 *
 * @param wm - Current working memory (not mutated)
 * @param config - Optional pruning configuration overrides
 * @returns Object with pruning result and updated working memory
 *
 * @example
 * ```typescript
 * const { result, workingMemory } = pruneWorkingMemory(wm, {
 *   retention_policies: [
 *     { section: "findings", max_tokens: 1000, max_age_ms: 3600000, priority: 3 },
 *   ],
 * });
 * console.log(`Freed ${result.total_tokens_freed} tokens from ${result.sections_pruned.length} sections`);
 * ```
 */
export function pruneWorkingMemory(
  wm: WorkingMemory,
  config?: Partial<PruningConfig>,
): { result: PruningResult; workingMemory: WorkingMemory } {
  const cfg = pruningConfigSchema.parse(config ?? {});
  const allEvents: PruningEvent[] = [];

  // Step 1: Digest stale ResultEnvelopes (R8.1)
  const digestResult = digestStaleEnvelopes(wm, cfg);
  let currentWm = digestResult.workingMemory;
  allEvents.push(...digestResult.events);

  // Step 2: Apply section retention policies (R8.2)
  const retentionResult = applySectionRetention(currentWm, cfg);
  currentWm = retentionResult.workingMemory;
  allEvents.push(...retentionResult.events);

  // Step 3: Identify preserved sections (R8.3)
  const criticalSet = preserveCriticalContext(cfg);
  const preservedSections = currentWm.sections
    .filter((s) => criticalSet.has(s.name))
    .map((s) => s.name);

  // Log skip events for critical sections that had content
  for (const section of currentWm.sections) {
    if (criticalSet.has(section.name) && section.content.trim().length > 0) {
      allEvents.push({
        timestamp: new Date().toISOString(),
        section: section.name as (typeof WORKING_MEMORY_SECTIONS)[number],
        action: "skip",
        tokens_freed: 0,
        reason: `Critical section "${section.name}" preserved`,
      });
    }
  }

  // Step 4: Log pruning events to WORKING.md (R8.4)
  // Only log non-skip events to avoid noise
  const actionEvents = allEvents.filter((e) => e.action !== "skip");
  if (actionEvents.length > 0) {
    currentWm = logPruningEvents(currentWm, actionEvents);
  }

  // Collect section names that were actually pruned
  const sectionsPruned = [
    ...new Set(
      allEvents
        .filter((e) => e.action !== "skip" && e.tokens_freed > 0)
        .map((e) => e.section),
    ),
  ];

  const totalTokensFreed = allEvents.reduce(
    (sum, e) => sum + e.tokens_freed,
    0,
  );

  // Internal construction — .parse() validates shape
  const result = pruningResultSchema.parse({
    events: allEvents,
    total_tokens_freed: totalTokensFreed,
    sections_pruned: sectionsPruned,
    preserved_sections: preservedSections,
  });

  return { result, workingMemory: currentWm };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Extract a compact digest line from a JSON ResultEnvelope block.
 *
 * @param jsonBlock - The raw ```json ... ``` block containing an envelope
 * @returns A one-line digest string
 */
function extractEnvelopeDigest(jsonBlock: string): string {
  try {
    // Extract JSON content between the backtick fences
    const jsonContent = jsonBlock
      .replace(/^```json\s*\n?/, "")
      .replace(/\n?\s*```$/, "")
      .trim();
    const parsed = JSON.parse(jsonContent);
    const agentName = parsed?.metadata?.agent_name ?? "unknown-agent";
    const status = parsed?.status ?? "unknown";
    const summary = parsed?.summary ? `: ${parsed.summary.slice(0, 80)}` : "";
    return `[Digested: ${agentName} -- ${status}${summary}]`;
  } catch {
    return "[Digested: unknown envelope]";
  }
}

/**
 * Truncate content to fit within a token budget, keeping the most recent lines.
 *
 * @param content - The full section content
 * @param maxTokens - Maximum allowed tokens
 * @returns Truncated content with a [Pruned] marker prepended
 */
function truncateToTokenBudget(content: string, maxTokens: number): string {
  const currentTokens = estimateTokens(content);
  if (currentTokens <= maxTokens) return content;

  const lines = content.split("\n");
  const markerText = "[Pruned: content truncated to fit retention policy]";
  const markerTokens = estimateTokens(markerText);
  const availableTokens = Math.max(1, maxTokens - markerTokens - 1);

  const keptLines: string[] = [];
  let keptTokens = 0;

  // Keep lines from the end (most recent first)
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineTokens = estimateTokens(lines[i]!);
    if (keptTokens + lineTokens > availableTokens && keptLines.length > 0) {
      break;
    }
    keptLines.unshift(lines[i]!);
    keptTokens += lineTokens;
  }

  return `${markerText}\n\n${keptLines.join("\n")}`;
}

/**
 * Escape special regex characters in a string.
 *
 * @param str - String to escape
 * @returns Regex-safe string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
