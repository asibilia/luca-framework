---
id: "97-04"
title: "Session ledger schema and implementation"
phase: 97
wave: 2
complexity: MODERATE
depends_on: ["97-03"]
tasks:
  - id: "97-04-1"
    title: "Define ledger entry schema extending TransitionRecord"
    goal: "Create Zod schema with sequence_number and parent_id fields"
    verify: "Schema compiles and extends transitionRecordSchema correctly; bunx --bun tsc --noEmit passes"
  - id: "97-04-2"
    title: "Implement appendLedgerEntry function"
    goal: "Create append-only JSONL writer with lazy sequence number tracking"
    verify: "Function creates valid JSONL entries with incrementing sequence numbers"
  - id: "97-04-3"
    title: "Implement readLedger function with filters"
    goal: "Create ledger reader supporting session, event, since, limit, and tail filters"
    verify: "Function reads and filters JSONL entries correctly"
  - id: "97-04-4"
    title: "Export ledger from state barrel"
    goal: "Add ledger exports to packages/luca-framework/src/state/index.ts"
    verify: "Ledger functions and types are importable from the state barrel"
  - id: "97-04-5"
    title: "Write tests for ledger functions"
    goal: "Create test file covering append, read, filter, sequence tracking, and edge cases"
    verify: "bun test __tests__/packages/luca-framework/src/state/ledger.test.ts passes"
---

# 97-04: Session Ledger Schema & Implementation

## Goal

Implement the append-only session ledger (`ledger.ts`) in the state domain. The ledger records every state machine transition as a JSONL entry with sequence numbers and parent IDs, enabling session replay, debugging, and richer learning extraction. This implements todo #6 (Append-Only Session Ledger).

## Context

@packages/luca-framework/src/state/types.ts -- `transitionRecordSchema` (lines 428-438) -- base schema to extend
@packages/luca-framework/src/state/events.ts -- `buildTransitionRecord()` (lines 103-123) -- constructs transition records
@packages/luca-framework/src/state/persistence.ts -- File I/O patterns using `Bun.file()` and `Bun.write()`
@packages/luca-framework/src/state/index.ts -- State barrel for re-exports
@.planning/todos/pending/06-append-only-session-ledger.md -- Full specification

**Design decisions:**

- JSONL format (one JSON object per line, newline-delimited)
- `sequence_number` + `parent_id` for DAG semantics (parent_id = previous sequence_number)
- Lazy sequence number tracking: seed from last ledger line on first append, cache in module variable
- Use `node:fs/promises` `appendFile` for atomic append-only writes (Bun.write does not support append mode)
- Use `Bun.file().text()` for reads (fast, Bun-native)
- `safeParse()` when reading external JSONL lines (could be corrupted), `.parse()` for internal construction
- Ledger path: `.planning/session-ledger.jsonl`

**Domain classification:**

- State domain, Archetype B (Core), Tier T1
- Imports only from within state domain (`./types`) and T0 (`zod`)
- No classes (functional patterns only)

## Tasks

### Task 97-04-1: Define ledger entry schema

Create the `ledgerEntrySchema` by extending the existing `transitionRecordSchema` with `sequence_number` and `parent_id` fields.

**File:** `packages/luca-framework/src/state/ledger.ts`

**Schema definition:**

````typescript
import { z } from "zod";

import { transitionRecordSchema } from "./types";
import type { TransitionRecord } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for the session ledger file */
export const LEDGER_PATH = ".planning/session-ledger.jsonl";

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * Ledger entry schema — extends TransitionRecord with DAG fields.
 *
 * Each entry in the session ledger is a transition record augmented with:
 * - `sequence_number`: Monotonically increasing integer (0-indexed)
 * - `parent_id`: Sequence number of the preceding entry (null for first entry)
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const entry: LedgerEntry = {
 *   sequence_number: 1,
 *   parent_id: 0,
 *   previous_state: "preflight",
 *   current_state: "routing",
 *   event_type: "PREFLIGHT_COMPLETE",
 *   event_data: {},
 *   actions_executed: [],
 *   context: {},
 *   timestamp: "2026-03-03T12:00:00.000Z",
 *   session_id: "abc-123",
 * };
 * ```
 */
export const ledgerEntrySchema = transitionRecordSchema.extend({
  sequence_number: z.number().int().nonnegative(),
  parent_id: z.number().int().nonnegative().nullable().default(null),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
````

**Verify:**

- [ ] `ledgerEntrySchema` extends `transitionRecordSchema` correctly
- [ ] Has `sequence_number` (non-negative integer) and `parent_id` (nullable non-negative integer)
- [ ] `LedgerEntry` type is exported
- [ ] `LEDGER_PATH` is exported
- [ ] All properties use snake_case
- [ ] `bunx --bun tsc --noEmit` passes

### Task 97-04-2: Implement appendLedgerEntry function

Add the append function with lazy sequence number tracking.

**Add to:** `packages/luca-framework/src/state/ledger.ts`

**Implementation:**

````typescript
import { appendFile } from "node:fs/promises";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// ─── Sequence Tracking ──────────────────────────────────────────────────────

/** In-memory sequence counter, lazily initialized from ledger file */
let _nextSeq: number | null = null;

/**
 * Get the next sequence number, lazily seeding from the ledger file.
 *
 * On first call, reads the last line of the ledger to determine the
 * current sequence. Subsequent calls increment from the cached value.
 * Resets on process restart (re-seeded from file).
 *
 * @param ledgerPath - Path to the ledger file (default: LEDGER_PATH)
 * @returns The next sequence number to use
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
    // Corrupted last line — start fresh from line count
    _nextSeq = lines.length + 1;
    return lines.length;
  }
}

/**
 * Reset the sequence counter (for testing only).
 * @internal
 */
export function _resetSequenceCounter(): void {
  _nextSeq = null;
}

// ─── Append ─────────────────────────────────────────────────────────────────

/**
 * Append a transition record to the session ledger as a JSONL entry.
 *
 * Extends the record with a `sequence_number` and `parent_id` (pointing
 * to the previous sequence number). Uses `node:fs appendFile` for atomic
 * append-only semantics.
 *
 * Ensures the ledger directory exists before writing.
 *
 * @param record - The transition record to append
 * @param ledgerPath - Path to the ledger file (default: LEDGER_PATH)
 * @returns The complete ledger entry that was written
 *
 * @example
 * ```typescript
 * const record: TransitionRecord = buildTransitionRecord(
 *   "idle", "preflight", "START", {}, context,
 * );
 * const entry = await appendLedgerEntry(record);
 * // entry.sequence_number === 0, entry.parent_id === null
 * ```
 */
export async function appendLedgerEntry(
  record: TransitionRecord,
  ledgerPath: string = LEDGER_PATH,
): Promise<LedgerEntry> {
  const seq = await getNextSequenceNumber(ledgerPath);
  const parentId = seq === 0 ? null : seq - 1;

  // Internal construction — data is computed, not external input
  const entry = ledgerEntrySchema.parse({
    ...record,
    sequence_number: seq,
    parent_id: parentId,
  });

  // Ensure directory exists
  const dir = dirname(ledgerPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(entry) + "\n";
  await appendFile(ledgerPath, line, "utf-8");

  return entry;
}
````

**Notes:**

- Uses `node:fs/promises` `appendFile` for append-only semantics (Bun.write does not support append mode)
- The `_resetSequenceCounter` function is exported for test use only (marked `@internal`)
- `parent_id` is null for the first entry (sequence 0), otherwise points to sequence - 1
- `ledgerEntrySchema.parse()` used for internal construction (data is computed, not user input)

**Verify:**

- [ ] `appendLedgerEntry` exported and accepts `TransitionRecord`
- [ ] Returns a `LedgerEntry` with `sequence_number` and `parent_id`
- [ ] Creates directory if it does not exist
- [ ] Appends JSONL (one line per entry, newline-terminated)
- [ ] Lazy sequence tracking works (first call seeds from file, subsequent calls increment)
- [ ] `_resetSequenceCounter` exported for test use
- [ ] `bunx --bun tsc --noEmit` passes

### Task 97-04-3: Implement readLedger function with filters

Add the read function with filtering capabilities.

**Add to:** `packages/luca-framework/src/state/ledger.ts`

**Implementation:**

````typescript
// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Filter options for reading ledger entries.
 *
 * All filters are optional and can be combined.
 * Uses snake_case for consistency with schema properties.
 */
export interface LedgerFilters {
  /** Filter by session ID */
  session_id?: string;
  /** Filter by event type */
  event_type?: string;
  /** Only entries after this ISO timestamp */
  since?: string;
  /** Maximum number of entries to return */
  limit?: number;
  /** Read only the last N entries (applied before other filters) */
  tail?: number;
}

/**
 * Read ledger entries from the session ledger with optional filters.
 *
 * Reads the JSONL file, parses each line with safeParse (skipping
 * corrupted lines), and applies filters in order:
 * 1. tail (take last N lines)
 * 2. session_id filter
 * 3. event_type filter
 * 4. since filter (timestamp comparison)
 * 5. limit (take first N of filtered results)
 *
 * @param filters - Optional filter criteria
 * @param ledgerPath - Path to the ledger file (default: LEDGER_PATH)
 * @returns Array of validated ledger entries matching the filters
 *
 * @example
 * ```typescript
 * // Read last 10 entries
 * const entries = await readLedger({ tail: 10 });
 *
 * // Read entries for a specific session
 * const sessionEntries = await readLedger({ session_id: "abc-123" });
 *
 * // Read state transitions since a timestamp
 * const recent = await readLedger({
 *   event_type: "START",
 *   since: "2026-03-03T00:00:00Z",
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

  // Apply tail first (take last N raw lines)
  if (filters.tail !== undefined && filters.tail > 0) {
    lines = lines.slice(-filters.tail);
  }

  // Parse lines, skipping corrupted entries
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

  // Apply filters
  let filtered = entries;

  if (filters.session_id) {
    filtered = filtered.filter((e) => e.session_id === filters.session_id);
  }

  if (filters.event_type) {
    filtered = filtered.filter((e) => e.event_type === filters.event_type);
  }

  if (filters.since) {
    filtered = filtered.filter((e) => e.timestamp >= filters.since!);
  }

  if (filters.limit !== undefined && filters.limit > 0) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}
````

**Verify:**

- [ ] `readLedger` exported and accepts optional `LedgerFilters`
- [ ] Returns empty array for nonexistent file
- [ ] Parses JSONL with `safeParse` (skips corrupted lines)
- [ ] Filters: `session_id`, `event_type`, `since`, `limit`, `tail` all work
- [ ] `tail` applied before filters, `limit` applied after
- [ ] `LedgerFilters` interface exported
- [ ] `bunx --bun tsc --noEmit` passes

### Task 97-04-4: Export ledger from state barrel

Add ledger exports to the state domain barrel.

**File:** `packages/luca-framework/src/state/index.ts`

**Add the following section** after the existing "Suspend Checkpoint" section:

```typescript
// ─── Ledger ─────────────────────────────────────────────────────────────────

export {
  appendLedgerEntry,
  readLedger,
  ledgerEntrySchema,
  LEDGER_PATH,
} from "./ledger";
export type { LedgerEntry, LedgerFilters } from "./ledger";
```

**Verify:**

- [ ] Barrel contains only re-export statements (no logic)
- [ ] `appendLedgerEntry`, `readLedger`, `ledgerEntrySchema`, `LEDGER_PATH` exported
- [ ] `LedgerEntry` and `LedgerFilters` types exported
- [ ] `bunx --bun tsc --noEmit` passes

### Task 97-04-5: Write tests for ledger functions

Create comprehensive tests for the ledger module.

**File:** `__tests__/packages/luca-framework/src/state/ledger.test.ts`

**Test cases:**

1. **Schema validation:**
   - `ledgerEntrySchema` accepts valid entries with all fields
   - `ledgerEntrySchema` rejects entries with negative `sequence_number`
   - `parent_id` defaults to `null` when omitted

2. **appendLedgerEntry:**
   - Creates ledger file if it does not exist
   - First entry has `sequence_number: 0` and `parent_id: null`
   - Second entry has `sequence_number: 1` and `parent_id: 0`
   - Appends valid JSONL lines (parseable JSON, one per line)
   - Creates parent directory if missing

3. **readLedger:**
   - Returns empty array when file does not exist
   - Reads all entries from valid JSONL file
   - Skips corrupted JSON lines without crashing
   - `tail` filter returns last N entries
   - `session_id` filter works correctly
   - `event_type` filter works correctly
   - `since` filter works correctly
   - `limit` filter caps results
   - Filters can be combined

4. **Sequence tracking:**
   - Resumes sequence from existing ledger on process restart
   - Handles corrupted last line gracefully (falls back to line count)

**Test setup pattern:**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";

import {
  appendLedgerEntry,
  readLedger,
  ledgerEntrySchema,
  _resetSequenceCounter,
} from "../../../../../packages/luca-framework/src/state/ledger";

import type { TransitionRecord } from "../../../../../packages/luca-framework/src/state/types";

const TEST_LEDGER_PATH = "/tmp/luca-test-ledger.jsonl";

/** Create a minimal valid TransitionRecord for testing */
function makeRecord(
  overrides: Partial<TransitionRecord> = {},
): TransitionRecord {
  return {
    previous_state: "idle",
    current_state: "preflight",
    event_type: "START",
    event_data: {},
    actions_executed: [],
    context: {},
    timestamp: new Date().toISOString(),
    session_id: "test-session",
    ...overrides,
  };
}

beforeEach(() => {
  // Clean up test ledger
  if (existsSync(TEST_LEDGER_PATH)) {
    rmSync(TEST_LEDGER_PATH);
  }
  _resetSequenceCounter();
});

afterEach(() => {
  if (existsSync(TEST_LEDGER_PATH)) {
    rmSync(TEST_LEDGER_PATH);
  }
  _resetSequenceCounter();
});
```

All append/read calls should pass `TEST_LEDGER_PATH` as the second argument to avoid writing to the real `.planning/session-ledger.jsonl`.

**Verify:**

- [ ] Test file created at `__tests__/packages/luca-framework/src/state/ledger.test.ts`
- [ ] All test cases pass: `bun test __tests__/packages/luca-framework/src/state/ledger.test.ts`
- [ ] Tests use `/tmp/` paths (not real `.planning/` directory)
- [ ] Tests clean up after themselves (no leftover temp files)
- [ ] `_resetSequenceCounter()` called in setup to ensure isolation

## Success Criteria

- [ ] `ledger.ts` created at `packages/luca-framework/src/state/ledger.ts`
- [ ] `ledgerEntrySchema` extends `transitionRecordSchema` with `sequence_number` + `parent_id`
- [ ] `appendLedgerEntry()` appends JSONL with incrementing sequences
- [ ] `readLedger()` reads and filters JSONL entries
- [ ] Lazy sequence tracking seeds from file, caches in memory
- [ ] Barrel exports added to `state/index.ts`
- [ ] Comprehensive test suite passes
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes (no regressions)
