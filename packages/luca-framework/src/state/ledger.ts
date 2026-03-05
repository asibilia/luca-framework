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
// node:fs/promises retained: Bun.write() does not support append mode.
// appendFile is the correct API for the append-only ledger pattern.
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
 * SpacetimeDB-primary: queries COUNT(*) to derive the next sequence
 * number (append-only ledger with contiguous 0-based sequence numbers).
 * Falls back to reading the last line of the JSONL file.
 *
 * Note: SpacetimeDB v2 SQL only supports COUNT(*) as an aggregate —
 * MAX/MIN/SUM/AVG are not supported.
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
  // COUNT(*) is the only aggregate supported in SpacetimeDB v2 SQL.
  // For an append-only ledger with contiguous 0-based sequence numbers:
  //   count = 0 → next_seq = 0 (first entry)
  //   count = N → next_seq = N (since max_seq = N - 1)
  try {
    const row = await queryOne<{ n: number | bigint }>(
      "SELECT COUNT(*) as n FROM ledger_entries",
    );
    if (row && row.n != null) {
      const count = Number(row.n);
      if (count === 0) {
        _nextSeq = 1;
        return 0;
      }
      _nextSeq = count + 1;
      return count;
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
    sequenceNumber: entry.sequence_number,
  });

  // Backup: append to local JSONL file
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, JSON.stringify(entry) + "\n", "utf-8");

  return entry;
}

// ─── Filter Validation ───────────────────────────────────────────────────

/**
 * Regex for safe session IDs: alphanumeric, hyphens, and underscores only.
 * Rejects any characters that could be used for SQL injection (quotes, semicolons, etc.).
 */
const SAFE_SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** Regex for ISO 8601 date/datetime strings. */
const ISO8601_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Valid event types that can appear in ledger entries.
 *
 * Used as an allowlist to prevent SQL injection via event_type filter.
 */
const VALID_EVENT_TYPES = [
  "phase_started",
  "phase_completed",
  "transition",
  "error",
  "checkpoint",
  "metric",
  "decision",
  "field_set",
  "START",
  "PLAN_LOADED",
  "PHASE_STARTED",
  "PHASE_COMPLETED",
  "VERIFY_START",
  "VERIFY_PASS",
  "VERIFY_FAIL",
  "FIX_APPLIED",
  "COMPLETE",
  "SUSPEND",
  "RESUME_PHASE",
  "RESET",
] as const;

/**
 * Validate ledger filter values to prevent SQL injection.
 *
 * Checks that filter values match expected formats before they are
 * interpolated into SQL queries. Throws on invalid input.
 *
 * @param filters - Raw filter values from CLI or API
 * @returns Validated filter values safe for query interpolation
 * @throws Error if any filter value has an invalid format
 *
 * @example
 * ```typescript
 * const safe = validateLedgerFilters({
 *   session_id: "session-abc-123",
 *   event_type: "transition",
 *   since: "2024-01-15T00:00:00Z",
 *   limit: 50,
 * });
 * ```
 */
export function validateLedgerFilters(filters: LedgerFilters): LedgerFilters {
  const validated: LedgerFilters = {};

  if (filters.session_id) {
    if (
      filters.session_id.length > 256 ||
      !SAFE_SESSION_ID_RE.test(filters.session_id)
    ) {
      throw new Error(`Invalid session_id format: ${filters.session_id}`);
    }
    validated.session_id = filters.session_id;
  }

  if (filters.event_type) {
    if (
      !(VALID_EVENT_TYPES as readonly string[]).includes(filters.event_type)
    ) {
      throw new Error(`Invalid event_type: ${filters.event_type}`);
    }
    validated.event_type = filters.event_type;
  }

  if (filters.since) {
    if (!ISO8601_RE.test(filters.since)) {
      throw new Error(`Invalid since format: ${filters.since}`);
    }
    validated.since = filters.since;
  }

  if (filters.limit != null) {
    const n = Number(filters.limit);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      throw new Error(`Invalid limit: ${filters.limit}`);
    }
    validated.limit = n;
  }

  if (filters.tail != null) {
    const n = Number(filters.tail);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      throw new Error(`Invalid tail: ${filters.tail}`);
    }
    validated.tail = n;
  }

  return validated;
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
  // Validate filter values before building SQL to prevent injection
  const validatedFilters = validateLedgerFilters(filters);

  // Primary: try SpacetimeDB
  try {
    const whereClauses: string[] = [];
    if (validatedFilters.session_id) {
      // Defense-in-depth: primary validation is validateLedgerFilters() above.
      // The .replace() here is a secondary safety layer; validated values
      // already match /^[a-zA-Z0-9_-]+$/ and cannot contain single quotes.
      whereClauses.push(
        `session_id = '${validatedFilters.session_id.replace(/'/g, "''")}'`,
      );
    }
    if (validatedFilters.event_type) {
      // Defense-in-depth: primary validation is validateLedgerFilters() above.
      // event_type is allowlist-validated; .replace() is belt-and-suspenders.
      whereClauses.push(
        `event_type = '${validatedFilters.event_type.replace(/'/g, "''")}'`,
      );
    }
    if (validatedFilters.since) {
      // Defense-in-depth: primary validation is validateLedgerFilters() above.
      // since is ISO8601 regex-validated; .replace() is belt-and-suspenders.
      whereClauses.push(
        `timestamp >= '${validatedFilters.since.replace(/'/g, "''")}'`,
      );
    }

    // SpacetimeDB v2 SQL does not support ORDER BY or aggregate functions
    // beyond COUNT(*). LIMIT is supported but meaningless without ordering
    // for our use case. Fetch all matching rows, sort and limit client-side.
    let sql = "SELECT * FROM ledger_entries";
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    const rows = await queryTable<LedgerEntry>(sql);
    if (rows.length > 0) {
      // Sort client-side (ORDER BY not supported in SpacetimeDB v2 SQL)
      rows.sort(
        (a, b) => Number(a.sequence_number) - Number(b.sequence_number),
      );
      let result = rows;
      // Apply tail filter (last N entries)
      if (validatedFilters.tail !== undefined && validatedFilters.tail > 0) {
        result = result.slice(-validatedFilters.tail);
      }
      // Apply limit filter (first N entries of result)
      if (validatedFilters.limit) {
        result = result.slice(0, validatedFilters.limit);
      }
      return result;
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

  if (validatedFilters.tail !== undefined && validatedFilters.tail > 0) {
    lines = lines.slice(-validatedFilters.tail);
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

  if (validatedFilters.session_id) {
    filtered = filtered.filter(
      (e) => e.session_id === validatedFilters.session_id,
    );
  }
  if (validatedFilters.event_type) {
    filtered = filtered.filter(
      (e) => e.event_type === validatedFilters.event_type,
    );
  }
  if (validatedFilters.since) {
    const sinceVal = validatedFilters.since;
    filtered = filtered.filter((e) => e.timestamp >= sinceVal);
  }
  if (validatedFilters.limit !== undefined && validatedFilters.limit > 0) {
    filtered = filtered.slice(0, validatedFilters.limit);
  }

  return filtered;
}
