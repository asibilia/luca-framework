/**
 * Append-only session ledger for the Luca workflow state machine.
 *
 * Records every state machine transition as a JSONL entry with sequence
 * numbers and parent IDs, enabling session replay, debugging, and richer
 * learning extraction.
 *
 * Uses snake_case for all schema fields per API conventions.
 *
 * @module luca-state/ledger
 */
import { z } from "zod";
import { appendFile } from "node:fs/promises";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import { transitionRecordSchema } from "./types";
import type { TransitionRecord } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for the session ledger file */
export const LEDGER_PATH = ".planning/session-ledger.jsonl";

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * Schema for a single ledger entry.
 *
 * Extends TransitionRecord with DAG semantics:
 * - `sequence_number`: monotonically increasing counter per ledger file
 * - `parent_id`: sequence_number of the previous entry (null for first entry)
 *
 * Uses snake_case for all properties per API conventions.
 */
export const ledgerEntrySchema = transitionRecordSchema.extend({
  sequence_number: z.number().int().nonnegative(),
  parent_id: z.number().int().nonnegative().nullable().default(null),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

// ─── Filter Interface ───────────────────────────────────────────────────────

/**
 * Filters for reading ledger entries.
 *
 * All filters are optional and combined with AND logic.
 * `tail` is applied before other filters (reads last N lines from file).
 * `limit` is applied after all other filters (caps result count).
 */
export interface LedgerFilters {
  session_id?: string;
  event_type?: string;
  since?: string;
  limit?: number;
  tail?: number;
}

// ─── Sequence Tracking ──────────────────────────────────────────────────────

/** Cached next sequence number. null = not yet seeded from file. */
let _nextSeq: number | null = null;

/**
 * Get the next sequence number for the ledger.
 *
 * On first call, seeds from the last line of the existing ledger file.
 * Subsequent calls return cached incrementing values for performance.
 *
 * @param ledgerPath - Path to the ledger file
 * @returns The next available sequence number
 */
async function getNextSequenceNumber(
  ledgerPath: string = LEDGER_PATH,
): Promise<number> {
  if (_nextSeq !== null) {
    const seq = _nextSeq;
    _nextSeq = seq + 1;
    return seq;
  }

  const file = Bun.file(ledgerPath);
  if (!(await file.exists())) {
    _nextSeq = 1;
    return 0;
  }

  const text = await file.text();
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    _nextSeq = 1;
    return 0;
  }

  try {
    const lastLine = lines[lines.length - 1]!;
    const lastEntry = JSON.parse(lastLine);
    const lastSeq =
      typeof lastEntry.sequence_number === "number"
        ? lastEntry.sequence_number
        : 0;
    _nextSeq = lastSeq + 2;
    return lastSeq + 1;
  } catch {
    // Corrupted last line: fall back to line count
    _nextSeq = lines.length + 1;
    return lines.length;
  }
}

/**
 * Reset the cached sequence counter.
 *
 * Exposed for testing only. Forces re-seeding from file on next append.
 */
export function _resetSequenceCounter(): void {
  _nextSeq = null;
}

// ─── Append ─────────────────────────────────────────────────────────────────

/**
 * Append a transition record to the session ledger.
 *
 * Assigns monotonically increasing sequence numbers and parent IDs.
 * Creates the ledger file and parent directories if they do not exist.
 * Uses `node:fs/promises.appendFile` for atomic append-only writes.
 *
 * @param record - The transition record to append
 * @param ledgerPath - Path to the ledger file (defaults to LEDGER_PATH)
 * @returns The constructed LedgerEntry with sequence_number and parent_id
 *
 * @example
 * ```typescript
 * const entry = await appendLedgerEntry({
 *   previous_state: "idle",
 *   current_state: "preflight",
 *   event_type: "START",
 *   event_data: {},
 *   actions_executed: [],
 *   context: {},
 *   timestamp: new Date().toISOString(),
 *   session_id: "abc-123",
 * });
 * // entry.sequence_number === 0 (first entry)
 * // entry.parent_id === null (no parent)
 * ```
 */
export async function appendLedgerEntry(
  record: TransitionRecord,
  ledgerPath: string = LEDGER_PATH,
): Promise<LedgerEntry> {
  const seq = await getNextSequenceNumber(ledgerPath);
  const parentId = seq === 0 ? null : seq - 1;

  // Internal construction — .parse() validates shape, data is computed (not external input).
  const entry = ledgerEntrySchema.parse({
    ...record,
    sequence_number: seq,
    parent_id: parentId,
  });

  const dir = dirname(ledgerPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(entry) + "\n";
  await appendFile(ledgerPath, line, "utf-8");

  return entry;
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Read and filter ledger entries from the session ledger file.
 *
 * Reads all lines from the JSONL file, parses each with safeParse
 * (skipping corrupted entries), and applies filters.
 *
 * Filter application order:
 * 1. `tail` — take last N raw lines before parsing
 * 2. Parse all lines with safeParse (skip invalid)
 * 3. `session_id` — match exact session ID
 * 4. `event_type` — match exact event type
 * 5. `since` — entries with timestamp >= since
 * 6. `limit` — cap result count
 *
 * @param filters - Optional filters to apply
 * @param ledgerPath - Path to the ledger file (defaults to LEDGER_PATH)
 * @returns Array of validated LedgerEntry objects
 *
 * @example
 * ```typescript
 * // Read all entries
 * const all = await readLedger();
 *
 * // Read last 10 entries for a specific session
 * const recent = await readLedger({
 *   tail: 10,
 *   session_id: "abc-123",
 * });
 * ```
 */
export async function readLedger(
  filters: LedgerFilters = {},
  ledgerPath: string = LEDGER_PATH,
): Promise<LedgerEntry[]> {
  const file = Bun.file(ledgerPath);
  if (!(await file.exists())) {
    return [];
  }

  const text = await file.text();
  let lines = text.trim().split("\n").filter(Boolean);

  if (filters.tail !== undefined && filters.tail > 0) {
    lines = lines.slice(-filters.tail);
  }

  const entries: LedgerEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = ledgerEntrySchema.safeParse(JSON.parse(line));
      if (parsed.success) {
        entries.push(parsed.data);
      } else {
        console.error(
          "[ledger] Skipping corrupted entry:",
          parsed.error.message,
        );
      }
    } catch {
      console.error("[ledger] Skipping malformed JSON line");
    }
  }

  let filtered = entries;

  if (filters.session_id) {
    filtered = filtered.filter((e) => e.session_id === filters.session_id);
  }
  if (filters.event_type) {
    filtered = filtered.filter((e) => e.event_type === filters.event_type);
  }
  if (filters.since) {
    const sinceVal = filters.since;
    filtered = filtered.filter((e) => e.timestamp >= sinceVal);
  }
  if (filters.limit !== undefined && filters.limit > 0) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}
