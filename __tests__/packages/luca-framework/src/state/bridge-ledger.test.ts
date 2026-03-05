/**
 * Integration tests for bridge-ledger wiring.
 *
 * Validates that the bridge CLI's read-ledger subcommand works with filters,
 * and that transition/field_set operations produce correct ledger entries.
 *
 * Uses isolated temp ledger files to avoid interference with real state.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  appendLedgerEntry,
  readLedger,
  _resetSequenceCounter,
} from "../../../../../packages/luca-framework/src/state/ledger";
import type {
  LedgerEntry,
  LedgerFilters,
} from "../../../../../packages/luca-framework/src/state/ledger";
import type { TransitionRecord } from "../../../../../packages/luca-framework/src/state/types";

// --- Helpers -----------------------------------------------------------------

const TEST_LEDGER_BASE = "/tmp/luca-bridge-ledger-test";
let testLedgerPath: string;
let testCounter = 0;

/**
 * Build a minimal valid TransitionRecord for testing.
 */
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
    session_id: "bridge-test-session",
    ...overrides,
  };
}

/**
 * Clean up test ledger file if it exists.
 */
function cleanupTestFile(path: string): void {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // Ignore cleanup errors
  }
}

// --- Setup / Teardown --------------------------------------------------------

beforeEach(() => {
  testCounter++;
  testLedgerPath = `${TEST_LEDGER_BASE}-${testCounter}-${Date.now()}.jsonl`;
  _resetSequenceCounter();
  cleanupTestFile(testLedgerPath);
});

afterEach(() => {
  _resetSequenceCounter();
  cleanupTestFile(testLedgerPath);
});

// --- Tests -------------------------------------------------------------------

describe("read-ledger default tail behavior", () => {
  test("returns last 20 entries when 30 are written and no filters are given", async () => {
    // Seed 30 entries
    for (let i = 0; i < 30; i++) {
      await appendLedgerEntry(
        makeRecord({
          event_type: `EVENT_${i}`,
          timestamp: `2026-03-01T${String(i).padStart(2, "0")}:00:00.000Z`,
        }),
        testLedgerPath,
      );
    }

    _resetSequenceCounter();

    // Default tail=20 behavior (simulating handleReadLedger logic)
    const filters: LedgerFilters = { tail: 20 };
    const entries = await readLedger(filters, testLedgerPath);

    expect(entries.length).toBe(20);
    // Should be the last 20 entries (seq 10-29)
    expect(entries[0]!.sequence_number).toBe(10);
    expect(entries[19]!.sequence_number).toBe(29);
  });
});

describe("read-ledger with session filter", () => {
  test("filters entries by session_id", async () => {
    await appendLedgerEntry(
      makeRecord({ session_id: "session-A" }),
      testLedgerPath,
    );
    await appendLedgerEntry(
      makeRecord({ session_id: "session-B" }),
      testLedgerPath,
    );
    await appendLedgerEntry(
      makeRecord({ session_id: "session-A" }),
      testLedgerPath,
    );

    const entries = await readLedger(
      { session_id: "session-A" },
      testLedgerPath,
    );
    expect(entries.length).toBe(2);
    for (const e of entries) {
      expect(e.session_id).toBe("session-A");
    }
  });
});

describe("read-ledger with event type filter", () => {
  test("filters entries by event_type", async () => {
    await appendLedgerEntry(
      makeRecord({ event_type: "START" }),
      testLedgerPath,
    );
    await appendLedgerEntry(
      makeRecord({ event_type: "ROUTE_COMPLETE" }),
      testLedgerPath,
    );
    await appendLedgerEntry(
      makeRecord({ event_type: "START" }),
      testLedgerPath,
    );
    await appendLedgerEntry(
      makeRecord({ event_type: "field_set" }),
      testLedgerPath,
    );

    const entries = await readLedger(
      { event_type: "field_set" },
      testLedgerPath,
    );
    expect(entries.length).toBe(1);
    expect(entries[0]!.event_type).toBe("field_set");
  });
});

describe("read-ledger with since filter", () => {
  test("filters entries by timestamp >= since", async () => {
    await appendLedgerEntry(
      makeRecord({ timestamp: "2026-03-01T10:00:00.000Z" }),
      testLedgerPath,
    );
    await appendLedgerEntry(
      makeRecord({ timestamp: "2026-03-01T12:00:00.000Z" }),
      testLedgerPath,
    );
    await appendLedgerEntry(
      makeRecord({ timestamp: "2026-03-02T08:00:00.000Z" }),
      testLedgerPath,
    );

    const entries = await readLedger(
      { since: "2026-03-01T11:00:00.000Z" },
      testLedgerPath,
    );
    expect(entries.length).toBe(2);
    for (const e of entries) {
      expect(e.timestamp >= "2026-03-01T11:00:00.000Z").toBe(true);
    }
  });
});

describe("read-ledger with combined filters", () => {
  test("combines session, event, since, and limit", async () => {
    const timestamps = [
      "2026-03-01T08:00:00.000Z",
      "2026-03-01T10:00:00.000Z",
      "2026-03-01T12:00:00.000Z",
      "2026-03-02T08:00:00.000Z",
      "2026-03-02T10:00:00.000Z",
    ];

    for (let i = 0; i < 5; i++) {
      await appendLedgerEntry(
        makeRecord({
          session_id: i < 3 ? "session-X" : "session-Y",
          event_type: i % 2 === 0 ? "START" : "COMPLETE",
          timestamp: timestamps[i]!,
        }),
        testLedgerPath,
      );
    }

    // session-X + START + since March 1 10am + limit 1
    const entries = await readLedger(
      {
        session_id: "session-X",
        event_type: "START",
        since: "2026-03-01T09:00:00.000Z",
        limit: 1,
      },
      testLedgerPath,
    );

    expect(entries.length).toBe(1);
    expect(entries[0]!.session_id).toBe("session-X");
    expect(entries[0]!.event_type).toBe("START");
    expect(entries[0]!.timestamp >= "2026-03-01T09:00:00.000Z").toBe(true);
  });
});

describe("transition produces ledger entry", () => {
  test("appended entry has correct sequence_number and parent_id", async () => {
    // Simulate a transition producing a ledger entry
    const record1 = makeRecord({
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      session_id: "transition-test",
    });
    const entry1 = await appendLedgerEntry(record1, testLedgerPath);
    expect(entry1.sequence_number).toBe(0);
    expect(entry1.parent_id).toBeNull();

    const record2 = makeRecord({
      previous_state: "preflight",
      current_state: "routing",
      event_type: "PREFLIGHT_COMPLETE",
      session_id: "transition-test",
    });
    const entry2 = await appendLedgerEntry(record2, testLedgerPath);
    expect(entry2.sequence_number).toBe(1);
    expect(entry2.parent_id).toBe(0);

    // Verify they are persisted correctly
    const allEntries = await readLedger({}, testLedgerPath);
    expect(allEntries.length).toBe(2);
    expect(allEntries[0]!.event_type).toBe("START");
    expect(allEntries[1]!.event_type).toBe("PREFLIGHT_COMPLETE");
    expect(allEntries[1]!.previous_state).toBe("preflight");
    expect(allEntries[1]!.current_state).toBe("routing");
  });
});

describe("field_set produces ledger entry", () => {
  test("field_set entry has correct event_data with field details", async () => {
    // Simulate what handleSetField does: build a field_set record
    const fieldRecord: TransitionRecord = {
      previous_state: "executing",
      current_state: "executing", // State doesn't change on field set
      event_type: "field_set",
      event_data: { field: "complexity", value: "COMPLEX" },
      actions_executed: [],
      context: {},
      timestamp: new Date().toISOString(),
      session_id: "field-test-session",
    };

    const entry = await appendLedgerEntry(fieldRecord, testLedgerPath);

    expect(entry.event_type).toBe("field_set");
    expect(entry.event_data).toEqual({
      field: "complexity",
      value: "COMPLEX",
    });
    expect(entry.previous_state).toBe("executing");
    expect(entry.current_state).toBe("executing");
    expect(entry.session_id).toBe("field-test-session");
    expect(entry.sequence_number).toBe(0);
    expect(entry.parent_id).toBeNull();

    // Verify it can be read back and filtered by event_type
    const entries = await readLedger(
      { event_type: "field_set" },
      testLedgerPath,
    );
    expect(entries.length).toBe(1);
    expect(entries[0]!.event_data).toEqual({
      field: "complexity",
      value: "COMPLEX",
    });
  });
});
