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

import type { RecallCacheEntry } from "../__schemas/recall-cache.schemas";

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
