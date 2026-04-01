/**
 * Routing history module for adaptive complexity adjustment.
 *
 * Provides append and read operations for the routing history
 * JSONL file at `.planning/routing-history.jsonl`. Each line
 * records the outcome of a complexity classification for a phase.
 *
 * Uses Bun.file() for reads and appendFileSync from node:fs for
 * atomic JSONL appends (Bun has no native append API).
 *
 * @example
 * ```typescript
 * // Append a routing entry
 * await appendRoutingEntry({
 *   timestamp: new Date().toISOString(),
 *   phase: 42,
 *   initial_complexity: "MODERATE",
 *   final_complexity: "COMPLEX",
 *   succeeded: true,
 *   stalled: false,
 *   iteration_counts: { harness_fix: 1, verify_fix: 0 },
 *   task_count: 5,
 *   file_count: 8,
 *   keywords: ["refactor", "multi-package"],
 * });
 *
 * // Read last 20 entries
 * const history = await readRoutingHistory({ tail: 20 });
 * ```
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { routingHistoryEntrySchema } from "../__schemas/classify.schemas";

import type { RoutingHistoryEntry } from "../__schemas/classify.schemas";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Path to the routing history JSONL file */
const HISTORY_PATH = resolve(process.cwd(), ".planning/routing-history.jsonl");

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Append a routing history entry to the JSONL file.
 *
 * Creates the file if it does not exist. Each entry is written
 * as a single JSON line terminated by a newline.
 *
 * Uses appendFileSync from node:fs for atomic line appends.
 *
 * @param entry - Validated routing history entry to append
 */
export async function appendRoutingEntry(
  entry: RoutingHistoryEntry,
): Promise<void> {
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(HISTORY_PATH, line, "utf-8");
}

/**
 * Read routing history entries from the JSONL file.
 *
 * Parses each line independently so a single corrupt line does
 * not break the entire history. Invalid lines are silently skipped.
 *
 * @param options - Optional configuration
 * @param options.tail - Return only the last N entries (default: all)
 * @returns Array of valid routing history entries
 */
export async function readRoutingHistory(options?: {
  tail?: number;
}): Promise<RoutingHistoryEntry[]> {
  const file = Bun.file(HISTORY_PATH);
  const exists = await file.exists();

  if (!exists) {
    return [];
  }

  const text = await file.text();
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  const entries: RoutingHistoryEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const result = routingHistoryEntrySchema.safeParse(parsed);
      if (result.success) {
        entries.push(result.data);
      }
    } catch {
      // Skip corrupt lines silently
    }
  }

  if (options?.tail !== undefined && options.tail > 0) {
    return entries.slice(-options.tail);
  }

  return entries;
}
