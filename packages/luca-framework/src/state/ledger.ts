/**
 * Append-only session ledger for the Luca workflow state machine.
 *
 * SpacetimeDB-primary: reads query SpacetimeDB first, falls back to
 * JSONL file. Writes call the SpacetimeDB reducer.
 *
 * Uses snake_case for all schema fields per API conventions.
 *
 * @module luca-state/ledger
 */
import { z } from "zod";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { transitionRecordSchema } from "./types";
import type { TransitionRecord } from "./types";
import { queryTable, queryOne } from "./__helpers/spacetimedb-client";
import { callReducer } from "./__helpers/observer-emitter";

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
export type LedgerFilters = {
  session_id?: string;
  event_type?: string;
  since?: string;
  limit?: number;
  tail?: number;
};

// ─── Sequence Tracking ──────────────────────────────────────────────────────

/** Cached next sequence number. null = not yet seeded from file. */
let _nextSeq: number | null = null;

/**
 * Get the next sequence number for the ledger.
 *
 * SpacetimeDB-primary: queries MAX(sequence_number). Falls back to
 * reading the last line of the JSONL file.
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

  // Primary: try SpacetimeDB
  try {
    const row = await queryOne<{ max_seq: number }>(
      "SELECT MAX(sequence_number) as max_seq FROM ledger_entries",
    );
    if (row && typeof row.max_seq === "number") {
      _nextSeq = row.max_seq + 2;
      return row.max_seq + 1;
    }
  } catch {
    // SpacetimeDB unavailable — fall through
  }

  // Fallback: read from JSONL file
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
 * SpacetimeDB-primary: calls the `append_ledger_entry` reducer.
 * Also appends to the local JSONL file as fallback/backup.
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

  // Primary: write to SpacetimeDB via reducer
  callReducer("append_ledger_entry", {
    sessionId: entry.session_id ?? "",
    phase: "",
    plan: "",
    action: entry.event_type,
    result: entry.current_state,
    timestamp: Date.now(),
    detailsJson: JSON.stringify(entry),
  });

  // Backup: append to local JSONL file
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, JSON.stringify(entry) + "\n", "utf-8");

  return entry;
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Read and filter ledger entries from the session ledger.
 *
 * SpacetimeDB-primary: queries SpacetimeDB with SQL WHERE clauses.
 * Falls back to reading the JSONL file.
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
  // Primary: try SpacetimeDB
  try {
    const whereClauses: string[] = [];
    if (filters.session_id) {
      whereClauses.push(
        `session_id = '${filters.session_id.replace(/'/g, "''")}'`,
      );
    }
    if (filters.event_type) {
      whereClauses.push(
        `event_type = '${filters.event_type.replace(/'/g, "''")}'`,
      );
    }
    if (filters.since) {
      whereClauses.push(`timestamp >= '${filters.since.replace(/'/g, "''")}'`);
    }

    let sql = "SELECT * FROM ledger_entries";
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }
    sql += " ORDER BY sequence_number ASC";
    if (filters.limit) {
      sql += ` LIMIT ${filters.limit}`;
    }

    const rows = await queryTable<LedgerEntry>(sql);
    if (rows.length > 0) {
      // Apply tail filter after query (SpacetimeDB may not support OFFSET well)
      if (filters.tail !== undefined && filters.tail > 0) {
        return rows.slice(-filters.tail);
      }
      return rows;
    }
  } catch {
    // SpacetimeDB unavailable — fall through
  }

  // Fallback: read from JSONL file
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
