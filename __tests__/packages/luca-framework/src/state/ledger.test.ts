/**
 * Tests for ledger.ts -- append-only session ledger.
 *
 * Validates schema definitions, append semantics, read/filter behavior,
 * lazy sequence tracking, and edge cases (corrupted files, missing dirs).
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  ledgerEntrySchema,
  appendLedgerEntry,
  readLedger,
  _resetSequenceCounter,
  LEDGER_PATH,
} from "../../../../../packages/luca-framework/src/state/ledger";
import type {
  LedgerEntry,
  LedgerFilters,
} from "../../../../../packages/luca-framework/src/state/ledger";
import type { TransitionRecord } from "../../../../../packages/luca-framework/src/state/types";

// --- Helpers -----------------------------------------------------------------

const TEST_LEDGER_BASE = "/tmp/luca-test-ledger";
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
    session_id: "test-session-001",
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

describe("ledgerEntrySchema", () => {
  test("accepts valid entry with all fields", () => {
    const entry = {
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00.000Z",
      session_id: "abc-123",
      sequence_number: 0,
      parent_id: null,
    };

    const result = ledgerEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sequence_number).toBe(0);
      expect(result.data.parent_id).toBeNull();
    }
  });

  test("rejects negative sequence_number", () => {
    const entry = {
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00.000Z",
      session_id: "abc-123",
      sequence_number: -1,
      parent_id: null,
    };

    const result = ledgerEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  test("defaults parent_id to null when omitted", () => {
    const entry = {
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00.000Z",
      session_id: "abc-123",
      sequence_number: 0,
      // parent_id omitted
    };

    const result = ledgerEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parent_id).toBeNull();
    }
  });

  test("accepts valid parent_id as a number", () => {
    const entry = {
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00.000Z",
      session_id: "abc-123",
      sequence_number: 5,
      parent_id: 4,
    };

    const result = ledgerEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parent_id).toBe(4);
    }
  });

  test("rejects negative parent_id", () => {
    const entry = {
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00.000Z",
      session_id: "abc-123",
      sequence_number: 5,
      parent_id: -1,
    };

    const result = ledgerEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });
});

describe("appendLedgerEntry", () => {
  test("creates file and writes first entry with sequence 0 and null parent", async () => {
    expect(existsSync(testLedgerPath)).toBe(false);

    const entry = await appendLedgerEntry(makeRecord(), testLedgerPath);

    expect(existsSync(testLedgerPath)).toBe(true);
    expect(entry.sequence_number).toBe(0);
    expect(entry.parent_id).toBeNull();
  });

  test("second entry has sequence 1 and parent 0", async () => {
    await appendLedgerEntry(makeRecord(), testLedgerPath);
    const second = await appendLedgerEntry(makeRecord(), testLedgerPath);

    expect(second.sequence_number).toBe(1);
    expect(second.parent_id).toBe(0);
  });

  test("writes valid JSONL (one JSON object per line)", async () => {
    await appendLedgerEntry(makeRecord(), testLedgerPath);
    await appendLedgerEntry(
      makeRecord({ event_type: "ROUTE_COMPLETE" }),
      testLedgerPath,
    );

    const text = await Bun.file(testLedgerPath).text();
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(2);

    // Each line should be valid JSON
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(typeof parsed.sequence_number).toBe("number");
    }
  });

  test("preserves all TransitionRecord fields", async () => {
    const record = makeRecord({
      previous_state: "routing",
      current_state: "discussing",
      event_type: "DISCUSS_COMPLETE",
      event_data: { summary: "test" },
      actions_executed: ["logTransition"],
      context: { complexity: "COMPLEX" },
      timestamp: "2026-03-03T12:00:00.000Z",
      session_id: "sess-preserve",
    });

    const entry = await appendLedgerEntry(record, testLedgerPath);

    expect(entry.previous_state).toBe("routing");
    expect(entry.current_state).toBe("discussing");
    expect(entry.event_type).toBe("DISCUSS_COMPLETE");
    expect(entry.event_data).toEqual({ summary: "test" });
    expect(entry.actions_executed).toEqual(["logTransition"]);
    expect(entry.context).toEqual({ complexity: "COMPLEX" });
    expect(entry.session_id).toBe("sess-preserve");
  });

  test("creates parent directory if it does not exist", async () => {
    const nestedPath = `/tmp/luca-test-nested-${Date.now()}/sub/ledger.jsonl`;
    try {
      const entry = await appendLedgerEntry(makeRecord(), nestedPath);
      expect(entry.sequence_number).toBe(0);
      expect(existsSync(nestedPath)).toBe(true);
    } finally {
      // Cleanup nested directory
      cleanupTestFile(nestedPath);
      try {
        const { rmSync } = await import("node:fs");
        rmSync(dirname(dirname(nestedPath)), { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  });

  test("monotonically increments sequence numbers across multiple appends", async () => {
    const entries: LedgerEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(await appendLedgerEntry(makeRecord(), testLedgerPath));
    }

    for (let i = 0; i < entries.length; i++) {
      expect(entries[i]!.sequence_number).toBe(i);
      if (i === 0) {
        expect(entries[i]!.parent_id).toBeNull();
      } else {
        expect(entries[i]!.parent_id).toBe(i - 1);
      }
    }
  });
});

describe("readLedger", () => {
  test("returns empty array for nonexistent file", async () => {
    const entries = await readLedger({}, "/tmp/nonexistent-ledger-file.jsonl");
    expect(entries).toEqual([]);
  });

  test("reads all entries from file", async () => {
    await appendLedgerEntry(makeRecord(), testLedgerPath);
    await appendLedgerEntry(
      makeRecord({ event_type: "ROUTE_COMPLETE" }),
      testLedgerPath,
    );
    await appendLedgerEntry(
      makeRecord({ event_type: "PLAN_COMPLETE" }),
      testLedgerPath,
    );

    const entries = await readLedger({}, testLedgerPath);
    expect(entries.length).toBe(3);
    expect(entries[0]!.sequence_number).toBe(0);
    expect(entries[1]!.sequence_number).toBe(1);
    expect(entries[2]!.sequence_number).toBe(2);
  });

  test("skips corrupted/malformed lines", async () => {
    // Write a mix of valid and corrupted entries
    const dir = dirname(testLedgerPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const validEntry = JSON.stringify({
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00.000Z",
      session_id: "test-session",
      sequence_number: 0,
      parent_id: null,
    });
    const corrupted = "this is not valid JSON";
    const invalidSchema = JSON.stringify({ garbage: true });

    writeFileSync(
      testLedgerPath,
      [validEntry, corrupted, invalidSchema].join("\n") + "\n",
      "utf-8",
    );

    const entries = await readLedger({}, testLedgerPath);
    expect(entries.length).toBe(1);
    expect(entries[0]!.sequence_number).toBe(0);
  });

  describe("filters", () => {
    async function seedEntries(): Promise<void> {
      _resetSequenceCounter();
      const timestamps = [
        "2026-03-01T10:00:00.000Z",
        "2026-03-01T11:00:00.000Z",
        "2026-03-01T12:00:00.000Z",
        "2026-03-02T10:00:00.000Z",
        "2026-03-02T11:00:00.000Z",
      ];

      for (let i = 0; i < 5; i++) {
        await appendLedgerEntry(
          makeRecord({
            event_type: i % 2 === 0 ? "START" : "ROUTE_COMPLETE",
            session_id: i < 3 ? "session-A" : "session-B",
            timestamp: timestamps[i]!,
          }),
          testLedgerPath,
        );
      }
    }

    test("tail returns last N entries", async () => {
      await seedEntries();
      const entries = await readLedger({ tail: 2 }, testLedgerPath);
      expect(entries.length).toBe(2);
      expect(entries[0]!.sequence_number).toBe(3);
      expect(entries[1]!.sequence_number).toBe(4);
    });

    test("session_id filters by exact match", async () => {
      await seedEntries();
      const entries = await readLedger(
        { session_id: "session-A" },
        testLedgerPath,
      );
      expect(entries.length).toBe(3);
      for (const e of entries) {
        expect(e.session_id).toBe("session-A");
      }
    });

    test("event_type filters by exact match", async () => {
      await seedEntries();
      const entries = await readLedger({ event_type: "START" }, testLedgerPath);
      expect(entries.length).toBe(3); // indices 0, 2, 4
      for (const e of entries) {
        expect(e.event_type).toBe("START");
      }
    });

    test("since filters by timestamp >=", async () => {
      await seedEntries();
      const entries = await readLedger(
        { since: "2026-03-02T00:00:00.000Z" },
        testLedgerPath,
      );
      expect(entries.length).toBe(2);
      for (const e of entries) {
        expect(e.timestamp >= "2026-03-02T00:00:00.000Z").toBe(true);
      }
    });

    test("limit caps result count", async () => {
      await seedEntries();
      const entries = await readLedger({ limit: 2 }, testLedgerPath);
      expect(entries.length).toBe(2);
      expect(entries[0]!.sequence_number).toBe(0);
      expect(entries[1]!.sequence_number).toBe(1);
    });

    test("combined filters work together", async () => {
      await seedEntries();
      const entries = await readLedger(
        {
          session_id: "session-A",
          event_type: "START",
          limit: 1,
        },
        testLedgerPath,
      );
      expect(entries.length).toBe(1);
      expect(entries[0]!.session_id).toBe("session-A");
      expect(entries[0]!.event_type).toBe("START");
    });

    test("tail combined with other filters", async () => {
      await seedEntries();
      // tail=3 gets entries 2,3,4; then filter session_id=session-B gets entries 3,4
      const entries = await readLedger(
        { tail: 3, session_id: "session-B" },
        testLedgerPath,
      );
      expect(entries.length).toBe(2);
      for (const e of entries) {
        expect(e.session_id).toBe("session-B");
      }
    });
  });
});

describe("sequence tracking", () => {
  test("resumes sequence from existing file after reset", async () => {
    // Append 3 entries
    await appendLedgerEntry(makeRecord(), testLedgerPath);
    await appendLedgerEntry(makeRecord(), testLedgerPath);
    await appendLedgerEntry(makeRecord(), testLedgerPath);

    // Reset the in-memory counter (simulates new session/process)
    _resetSequenceCounter();

    // Next append should resume from sequence 3
    const entry = await appendLedgerEntry(makeRecord(), testLedgerPath);
    expect(entry.sequence_number).toBe(3);
    expect(entry.parent_id).toBe(2);
  });

  test("handles corrupted last line gracefully", async () => {
    // Write a valid entry then a corrupted line
    const dir = dirname(testLedgerPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const validEntry = JSON.stringify({
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: "2026-03-03T12:00:00.000Z",
      session_id: "test",
      sequence_number: 0,
      parent_id: null,
    });
    writeFileSync(
      testLedgerPath,
      validEntry + "\n" + "corrupted line\n",
      "utf-8",
    );

    _resetSequenceCounter();

    // Should fall back to line count (2 lines)
    const entry = await appendLedgerEntry(makeRecord(), testLedgerPath);
    expect(entry.sequence_number).toBe(2);
  });

  test("handles empty file gracefully", async () => {
    const dir = dirname(testLedgerPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(testLedgerPath, "", "utf-8");

    _resetSequenceCounter();

    const entry = await appendLedgerEntry(makeRecord(), testLedgerPath);
    expect(entry.sequence_number).toBe(0);
    expect(entry.parent_id).toBeNull();
  });
});

describe("LEDGER_PATH constant", () => {
  test("defaults to .planning/session-ledger.jsonl", () => {
    expect(LEDGER_PATH).toBe(".planning/session-ledger.jsonl");
  });
});
