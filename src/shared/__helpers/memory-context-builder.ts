/**
 * Memory context builder for sub-agent prompt injection.
 *
 * Builds compact memory context blocks from accumulated session context
 * (recalled patterns, decisions, pitfalls) for injection into Task() prompts.
 * Uses input-hash caching to avoid redundant formatting across multiple
 * sub-agent spawns within the same orchestrator session.
 *
 * Source: src/shared/__helpers/memory-context-builder.ts
 */

import { z } from "zod";
import { getCachedRecall } from "./recall-cache";

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Configuration schema for buildMemoryContextBlock.
 *
 * Uses camelCase since this is an internal schema, not an API payload.
 */
export const MemoryContextConfigSchema = z.object({
  agentName: z.string().min(1),
  sessionFindings: z.array(z.string()).default([]),
  recalledPatterns: z.array(z.string()).default([]),
  recalledPitfalls: z.array(z.string()).default([]),
  recalledDecisions: z.array(z.string()).default([]),
  maxTokens: z.number().int().positive().default(500),
});

export type MemoryContextConfig = z.infer<typeof MemoryContextConfigSchema>;

// ─── Cache ───────────────────────────────────────────────────────────────────

/**
 * Simple in-memory cache keyed by a hash of inputs.
 * Not persistent -- lives only for the orchestrator session.
 */
const formatCache = new Map<string, string>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Rough token estimate: ~4 characters per token (conservative).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Produce a deterministic cache key from the config inputs.
 */
function cacheKey(config: MemoryContextConfig): string {
  return JSON.stringify([
    config.agentName,
    config.sessionFindings,
    config.recalledPatterns,
    config.recalledPitfalls,
    config.recalledDecisions,
    config.maxTokens,
  ]);
}

/**
 * Format a section with a heading and bullet items.
 * Returns empty string if items is empty.
 */
function formatSection(heading: string, items: readonly string[]): string {
  if (items.length === 0) return "";
  const bullets = items.map((item) => `- ${item}`).join("\n");
  return `## ${heading}\n${bullets}`;
}

/**
 * Truncate sections to fit within a token budget.
 *
 * Priority order (highest to lowest):
 *   pitfalls > patterns > decisions > findings
 *
 * Sections are dropped from lowest priority first. Within a section,
 * items are trimmed from the end.
 */
function truncateToFit(
  sections: { heading: string; items: string[]; priority: number }[],
  maxTokens: number,
): string[] {
  // Sort by priority descending (highest priority kept first)
  const sorted = [...sections]
    .filter((s) => s.items.length > 0)
    .sort((a, b) => b.priority - a.priority);

  const result: string[] = [];
  let remaining = maxTokens;

  for (const section of sorted) {
    const formatted = formatSection(section.heading, section.items);
    const tokens = estimateTokens(formatted);

    if (tokens <= remaining) {
      result.push(formatted);
      remaining -= tokens;
    } else {
      // Try to fit a partial section
      const trimmed: string[] = [];
      for (const item of section.items) {
        const candidate = formatSection(section.heading, [...trimmed, item]);
        if (estimateTokens(candidate) <= remaining) {
          trimmed.push(item);
        } else {
          break;
        }
      }
      if (trimmed.length > 0) {
        const partial = formatSection(section.heading, trimmed);
        result.push(partial);
        remaining -= estimateTokens(partial);
      }
    }
  }

  return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a memory context block for sub-agent prompt injection.
 *
 * Reads accumulated session context (recalled patterns, decisions, pitfalls)
 * and formats it into a compact markdown block wrapped in `<memory_context>`
 * XML tags, suitable for injection into Task() prompts.
 *
 * Uses caching to avoid redundant formatting across multiple sub-agent spawns.
 *
 * @param rawConfig - Configuration for the memory context block
 * @returns Formatted `<memory_context>` string, or empty string if no content
 *
 * @example
 * ```typescript
 * const memoryBlock = buildMemoryContextBlock({
 *   agentName: "lu-executor",
 *   sessionFindings: ["Pattern: always run tsc before commit"],
 *   recalledPatterns: ["Use Bun APIs over node:fs"],
 *   recalledPitfalls: ["build:all crashes Claude Code"],
 *   recalledDecisions: ["Functional patterns only, no classes"],
 *   maxTokens: 500,
 * });
 * // Returns: "<memory_context>\n## Recalled Pitfalls\n- build:all crashes..."
 * ```
 */
export function buildMemoryContextBlock(
  rawConfig: Partial<MemoryContextConfig> & { agentName: string },
): string {
  const config = MemoryContextConfigSchema.parse(rawConfig);

  // Return empty if no content at all
  const hasContent =
    config.recalledPatterns.length > 0 ||
    config.recalledPitfalls.length > 0 ||
    config.recalledDecisions.length > 0 ||
    config.sessionFindings.length > 0;

  if (!hasContent) return "";

  // Check cache
  const key = cacheKey(config);
  const cached = formatCache.get(key);
  if (cached !== undefined) return cached;

  // Build sections with priority: pitfalls(4) > patterns(3) > decisions(2) > findings(1)
  const sections = [
    {
      heading: "Recalled Pitfalls",
      items: config.recalledPitfalls,
      priority: 4,
    },
    {
      heading: "Recalled Patterns",
      items: config.recalledPatterns,
      priority: 3,
    },
    {
      heading: "Recalled Decisions",
      items: config.recalledDecisions,
      priority: 2,
    },
    {
      heading: "Session Findings",
      items: config.sessionFindings,
      priority: 1,
    },
  ];

  // Reserve tokens for wrapper tags (~20 tokens for open/close tags + agent line)
  const wrapperOverhead = 20;
  const contentBudget = config.maxTokens - wrapperOverhead;

  if (contentBudget <= 0) {
    formatCache.set(key, "");
    return "";
  }

  const fitted = truncateToFit(sections, contentBudget);

  if (fitted.length === 0) {
    formatCache.set(key, "");
    return "";
  }

  const body = fitted.join("\n\n");
  const block = `<memory_context agent="${config.agentName}">\n${body}\n</memory_context>`;

  formatCache.set(key, block);
  return block;
}

/**
 * Clear the format cache. Useful between phases or for testing.
 */
export function clearMemoryContextCache(): void {
  formatCache.clear();
}

// ─── Deferred Recall API ────────────────────────────────────────────────────

/**
 * Configuration for requesting memory context via the deferred recall pattern.
 *
 * The calling skill orchestrates the MuninnDB MCP call and stores results
 * via `setCachedRecall()` before calling `requestMemoryContext()`. This
 * function then reads the cache and formats the results.
 */
export interface RequestMemoryContextConfig {
  /** Name of the agent that will receive the memory context block */
  agentName: string;
  /** Session identifier used as the cache key for recall results */
  sessionId: string;
  /** Agent's memory_tags for potential future per-agent filtering */
  memoryTags: string[];
  /** Maximum token budget for the formatted block (default: 500) */
  maxTokens?: number;
}

/**
 * Request memory context for a sub-agent using the deferred recall pattern.
 *
 * Reads cached MuninnDB recall results (stored by the orchestrating skill
 * via `setCachedRecall()`) and formats them into a `<memory_context>` block
 * suitable for injection into Task() prompts.
 *
 * This function does NOT call MuninnDB itself -- MCP calls are made by the
 * LLM at the skill level. It only formats cached results. When no cache
 * exists (recall hasn't been performed yet), it logs a warning and returns
 * an empty string, consistent with `buildMemoryContextBlock()` behavior.
 *
 * @param config - Agent name, session ID, memory tags, and optional token budget
 * @returns Formatted `<memory_context>` string, or empty string if no cache
 *
 * @example
 * ```typescript
 * // After the skill has called MuninnDB and stored results:
 * // setCachedRecall(sessionId, { sessionId, patterns, decisions, pitfalls, findings, recalledAt });
 *
 * const memoryBlock = requestMemoryContext({
 *   agentName: "lu-executor",
 *   sessionId: "session-abc-123",
 *   memoryTags: ["execution", "debugging"],
 *   maxTokens: 500,
 * });
 * // Returns formatted <memory_context> block or empty string
 * ```
 */
export function requestMemoryContext(
  config: RequestMemoryContextConfig,
): string {
  const cached = getCachedRecall(config.sessionId);

  if (!cached) {
    console.warn(
      `[MEMORY] No cached recall for session ${config.sessionId}. ` +
        `Proceeding without memory context.`,
    );
    return "";
  }

  return buildMemoryContextBlock({
    agentName: config.agentName,
    sessionFindings: cached.findings,
    recalledPatterns: cached.patterns,
    recalledPitfalls: cached.pitfalls,
    recalledDecisions: cached.decisions,
    maxTokens: config.maxTokens ?? 500,
  });
}
