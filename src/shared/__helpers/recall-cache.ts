/**
 * Session-scoped recall cache for deferred MuninnDB recall results.
 *
 * Stores raw MuninnDB recall output (patterns, decisions, pitfalls, findings)
 * keyed by session ID. Designed for the deferred recall pattern where memory
 * is loaded on first demand rather than eagerly at session start.
 *
 * Follows the existing `formatCache` pattern in memory-context-builder.ts:
 * module-scoped Map with explicit clear() for session boundary cleanup.
 *
 * Source: src/shared/__helpers/recall-cache.ts
 */

import { z } from "zod";

// ─── Recalled Engram Schema ──────────────────────────────────────────────────

/**
 * A single recalled engram with its MuninnDB metadata.
 *
 * Tracks the engram ID alongside its content, enabling feedback loops
 * (via `muninn_feedback`) that connect verification outcomes back to
 * specific recalled engrams. Uses camelCase since this is an internal
 * schema, not an API payload.
 *
 * @example
 * ```typescript
 * const engram: RecalledEngram = {
 *   engramId: "01JEXAMPLE123",
 *   content: "Use Bun APIs over node:fs for file operations",
 *   concept: "pattern:bun-file-api",
 *   confidence: "high",
 * };
 * ```
 */
export const RecalledEngramSchema = z.object({
  /** MuninnDB engram ID (ULID format) */
  engramId: z.string().min(1),
  /** The engram content text */
  content: z.string(),
  /** The engram concept label (e.g. "pattern:bun-file-api") */
  concept: z.string().optional(),
  /** Extracted confidence level from the engram */
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

export type RecalledEngram = z.infer<typeof RecalledEngramSchema>;

// ─── Recall Cache Entry Schema ──────────────────────────────────────────────

/**
 * Schema for a cached recall result from MuninnDB.
 *
 * Contains the unfiltered recall output that gets filtered per-agent
 * by `requestMemoryContext()`. Uses camelCase since this is an internal
 * schema, not an API payload.
 *
 * The `recalledEngrams` field provides structured engram tracking with IDs,
 * enabling the feedback loop. The existing string arrays (`patterns`,
 * `decisions`, `pitfalls`, `findings`) remain for `buildMemoryContextBlock()`
 * consumption. Both representations coexist for backward compatibility.
 *
 * @example
 * ```typescript
 * const entry: RecallCacheEntry = {
 *   sessionId: "session-abc-123",
 *   patterns: ["Use Bun APIs over node:fs"],
 *   decisions: ["Functional patterns only, no classes"],
 *   pitfalls: ["build:all crashes Claude Code"],
 *   findings: ["Pattern: always run tsc before commit"],
 *   recalledAt: "2026-03-09T19:55:00Z",
 *   recalledEngrams: [
 *     {
 *       engramId: "01JEXAMPLE123",
 *       content: "Use Bun APIs over node:fs",
 *       concept: "pattern:bun-file-api",
 *       confidence: "high",
 *     },
 *   ],
 * };
 * ```
 */
export const RecallCacheEntrySchema = z.object({
  /** Session ID this recall result belongs to */
  sessionId: z.string().min(1),
  /** Recalled pattern engrams from MuninnDB */
  patterns: z.array(z.string()).default([]),
  /** Recalled decision engrams from MuninnDB */
  decisions: z.array(z.string()).default([]),
  /** Recalled pitfall engrams from MuninnDB */
  pitfalls: z.array(z.string()).default([]),
  /** Recalled session findings from MuninnDB */
  findings: z.array(z.string()).default([]),
  /** ISO 8601 timestamp when the recall was performed */
  recalledAt: z.string(),
  /** Structured engram tracking with IDs for feedback loop (backward compatible default) */
  recalledEngrams: z.array(RecalledEngramSchema).default([]),
});

export type RecallCacheEntry = z.infer<typeof RecallCacheEntrySchema>;

// ─── Cache ───────────────────────────────────────────────────────────────────

/**
 * Module-scoped session recall cache.
 *
 * Keyed by session ID. Stores raw MuninnDB recall results.
 * Not persistent -- lives only for the orchestrator session.
 * Cleared explicitly at session boundaries via `clearRecallCache()`.
 */
const MAX_RECALL_ENTRIES = 100;

/**
 * Evict the oldest entry from a Map if it has reached the maximum size.
 * Maps iterate in insertion order, so the first key is the oldest.
 */
function evictOldestIfNeeded<K, V>(map: Map<K, V>, max: number): void {
  if (map.size >= max) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
}

const recallCache = new Map<string, RecallCacheEntry>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get cached recall result for a session, if available.
 *
 * Returns undefined when no recall has been performed for this session,
 * signaling that the calling skill should orchestrate a MuninnDB recall.
 *
 * @param sessionId - The session identifier to look up
 * @returns The cached recall entry, or undefined if not yet recalled
 *
 * @example
 * ```typescript
 * const cached = getCachedRecall("session-abc-123");
 * if (cached) {
 *   // Use cached.patterns, cached.decisions, etc.
 * }
 * ```
 */
export function getCachedRecall(
  sessionId: string,
): RecallCacheEntry | undefined {
  return recallCache.get(sessionId);
}

/**
 * Store recall result in the session cache.
 *
 * Called by the orchestrating skill after performing a MuninnDB MCP recall.
 * Subsequent calls to `getCachedRecall()` with the same session ID will
 * return this entry, avoiding redundant MCP calls.
 *
 * @param sessionId - The session identifier to cache under
 * @param entry - The recall result to cache (validated against RecallCacheEntrySchema)
 *
 * @example
 * ```typescript
 * setCachedRecall("session-abc-123", {
 *   sessionId: "session-abc-123",
 *   patterns: ["Use Bun APIs over node:fs"],
 *   decisions: [],
 *   pitfalls: ["build:all crashes Claude Code"],
 *   findings: [],
 *   recalledAt: new Date().toISOString(),
 * });
 * ```
 */
export function setCachedRecall(
  sessionId: string,
  entry: RecallCacheEntry,
): void {
  evictOldestIfNeeded(recallCache, MAX_RECALL_ENTRIES);
  recallCache.set(sessionId, entry);
}

/**
 * Check if a session has cached recall results.
 *
 * Use this for a lightweight existence check before deciding whether
 * to orchestrate a MuninnDB recall.
 *
 * @param sessionId - The session identifier to check
 * @returns True if recall results are cached for this session
 *
 * @example
 * ```typescript
 * if (!hasRecallCache("session-abc-123")) {
 *   // Orchestrate MuninnDB recall, then setCachedRecall()
 * }
 * ```
 */
export function hasRecallCache(sessionId: string): boolean {
  return recallCache.has(sessionId);
}

/**
 * Clear the entire recall cache. Called at session boundaries.
 *
 * Should be invoked when the session ends or when a new phase starts
 * that should not carry over stale recall context.
 *
 * @example
 * ```typescript
 * // At session boundary
 * clearRecallCache();
 * ```
 */
export function clearRecallCache(): void {
  recallCache.clear();
}
