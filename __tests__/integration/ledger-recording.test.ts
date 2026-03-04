/**
 * Integration test: Ledger recording verification.
 *
 * Tests verifying that events written to the session ledger are correctly
 * structured and retrievable. Uses temp directories for isolation.
 *
 * Exercises the append -> read -> validate lifecycle of the ledger module.
 *
 * @module __tests__/integration/ledger-recording
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  appendLedgerEntry,
  readLedger,
  _resetSequenceCounter,
  ledgerEntrySchema,
} from "../../packages/luca-framework/src/state/ledger";

import {
  SESSION_START_LEDGER,
  STATE_TRANSITION_LEDGER,
  TYPECHECK_PASS_LEDGER,
  TYPECHECK_FAIL_LEDGER,
  PRE_COMMIT_PASS_LEDGER,
  FIXTURE_SESSION_ID,
  FIXTURE_TIMESTAMPS,
} from "./fixtures/hook-event-fixtures";

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tempDir: string;
let ledgerPath: string;

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `luca-ledger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tempDir, { recursive: true });
  ledgerPath = join(tempDir, "session-ledger.jsonl");
  _resetSequenceCounter();
});

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Cleanup best-effort
  }
  _resetSequenceCounter();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Ledger Recording", () => {
  describe("Single event append", () => {
    test("writes one event, reads it back, validates schema", async () => {
      const entry = await appendLedgerEntry(SESSION_START_LEDGER, ledgerPath);

      // Verify returned entry
      expect(entry.sequence_number).toBe(0);
      expect(entry.parent_id).toBeNull();
      expect(entry.event_type).toBe("START");
      expect(entry.previous_state).toBe("idle");
      expect(entry.current_state).toBe("preflight");
      expect(entry.session_id).toBe(FIXTURE_SESSION_ID);

      // Read it back
      const entries = await readLedger({}, ledgerPath);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.sequence_number).toBe(0);
      expect(entries[0]!.event_type).toBe("START");

      // Validate against schema
      const parseResult = ledgerEntrySchema.safeParse(entries[0]);
      expect(parseResult.success).toBe(true);
    });
  });

  describe("Multiple event append", () => {
    test("writes 5 events, reads all, verifies count and order", async () => {
      const records = [
        SESSION_START_LEDGER,
        STATE_TRANSITION_LEDGER,
        TYPECHECK_PASS_LEDGER,
        TYPECHECK_FAIL_LEDGER,
        PRE_COMMIT_PASS_LEDGER,
      ];

      for (const record of records) {
        await appendLedgerEntry(record, ledgerPath);
      }

      const entries = await readLedger({}, ledgerPath);
      expect(entries).toHaveLength(5);

      // Verify sequence numbers are monotonically increasing
      for (let i = 0; i < entries.length; i++) {
        expect(entries[i]!.sequence_number).toBe(i);
      }

      // Verify parent_id chain
      expect(entries[0]!.parent_id).toBeNull(); // First entry has no parent
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i]!.parent_id).toBe(i - 1);
      }

      // Verify event types in order
      expect(entries[0]!.event_type).toBe("START");
      expect(entries[1]!.event_type).toBe("PHASE_START");
      expect(entries[2]!.event_type).toBe("HARNESS_COMPLETE");
      expect(entries[3]!.event_type).toBe("HARNESS_COMPLETE");
      expect(entries[4]!.event_type).toBe("COMMIT_COMPLETE");
    });

    test("writes 10 events in rapid succession, all preserved", async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          appendLedgerEntry(
            {
              ...SESSION_START_LEDGER,
              event_type: `EVENT_${i}`,
              timestamp: `2026-03-04T10:00:${String(i).padStart(2, "0")}.000Z`,
            },
            ledgerPath,
          ),
        );
      }

      // Wait for all appends to complete
      await Promise.all(promises);

      const entries = await readLedger({}, ledgerPath);
      expect(entries).toHaveLength(10);
    });
  });

  describe("Schema validation", () => {
    test("all required fields present in appended entries", async () => {
      await appendLedgerEntry(SESSION_START_LEDGER, ledgerPath);
      const entries = await readLedger({}, ledgerPath);

      const entry = entries[0]!;

      // All required fields from ledgerEntrySchema
      expect(entry).toHaveProperty("previous_state");
      expect(entry).toHaveProperty("current_state");
      expect(entry).toHaveProperty("event_type");
      expect(entry).toHaveProperty("event_data");
      expect(entry).toHaveProperty("actions_executed");
      expect(entry).toHaveProperty("context");
      expect(entry).toHaveProperty("timestamp");
      expect(entry).toHaveProperty("session_id");
      expect(entry).toHaveProperty("sequence_number");
      expect(entry).toHaveProperty("parent_id");
    });

    test("every entry in a batch validates against LedgerEntrySchema", async () => {
      const records = [
        SESSION_START_LEDGER,
        STATE_TRANSITION_LEDGER,
        TYPECHECK_PASS_LEDGER,
        TYPECHECK_FAIL_LEDGER,
        PRE_COMMIT_PASS_LEDGER,
      ];

      for (const record of records) {
        await appendLedgerEntry(record, ledgerPath);
      }

      const entries = await readLedger({}, ledgerPath);

      for (const entry of entries) {
        const parseResult = ledgerEntrySchema.safeParse(entry);
        expect(parseResult.success).toBe(true);
      }
    });
  });

  describe("Malformed entry handling", () => {
    test("reader skips invalid JSON lines gracefully", async () => {
      // Write one valid entry
      await appendLedgerEntry(SESSION_START_LEDGER, ledgerPath);

      // Manually append an invalid line
      const { appendFile } = await import("node:fs/promises");
      await appendFile(ledgerPath, "this is not valid JSON\n", "utf-8");

      // Write another valid entry
      _resetSequenceCounter(); // Reset so it re-reads from file
      await appendLedgerEntry(TYPECHECK_PASS_LEDGER, ledgerPath);

      const entries = await readLedger({}, ledgerPath);

      // Should have 2 valid entries (the malformed line is skipped)
      expect(entries).toHaveLength(2);
      expect(entries[0]!.event_type).toBe("START");
    });

    test("reader skips entries that fail schema validation", async () => {
      // Write a valid entry
      await appendLedgerEntry(SESSION_START_LEDGER, ledgerPath);

      // Write a line that is valid JSON but does not match schema
      const { appendFile } = await import("node:fs/promises");
      await appendFile(
        ledgerPath,
        JSON.stringify({ invalid: "not a ledger entry" }) + "\n",
        "utf-8",
      );

      const entries = await readLedger({}, ledgerPath);

      // Should only have 1 valid entry
      expect(entries).toHaveLength(1);
    });
  });

  describe("Empty ledger", () => {
    test("read from non-existent file returns empty array", async () => {
      const nonExistentPath = join(tempDir, "does-not-exist.jsonl");
      const entries = await readLedger({}, nonExistentPath);
      expect(entries).toEqual([]);
    });

    test("read from empty file returns empty array", async () => {
      writeFileSync(ledgerPath, "");
      const entries = await readLedger({}, ledgerPath);
      expect(entries).toEqual([]);
    });
  });

  describe("Filtering", () => {
    test("filters by session_id", async () => {
      await appendLedgerEntry(SESSION_START_LEDGER, ledgerPath);
      await appendLedgerEntry(
        { ...TYPECHECK_PASS_LEDGER, session_id: "other-session" },
        ledgerPath,
      );

      const filtered = await readLedger(
        { session_id: FIXTURE_SESSION_ID },
        ledgerPath,
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.session_id).toBe(FIXTURE_SESSION_ID);
    });

    test("filters by event_type", async () => {
      await appendLedgerEntry(SESSION_START_LEDGER, ledgerPath);
      await appendLedgerEntry(TYPECHECK_PASS_LEDGER, ledgerPath);
      await appendLedgerEntry(PRE_COMMIT_PASS_LEDGER, ledgerPath);

      const filtered = await readLedger(
        { event_type: "HARNESS_COMPLETE" },
        ledgerPath,
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.event_type).toBe("HARNESS_COMPLETE");
    });

    test("limits results count", async () => {
      for (let i = 0; i < 5; i++) {
        await appendLedgerEntry(
          { ...SESSION_START_LEDGER, event_type: `EVENT_${i}` },
          ledgerPath,
        );
      }

      const limited = await readLedger({ limit: 3 }, ledgerPath);
      expect(limited).toHaveLength(3);
    });

    test("tail reads only last N entries", async () => {
      for (let i = 0; i < 5; i++) {
        await appendLedgerEntry(
          { ...SESSION_START_LEDGER, event_type: `EVENT_${i}` },
          ledgerPath,
        );
      }

      _resetSequenceCounter();
      const tailed = await readLedger({ tail: 2 }, ledgerPath);
      expect(tailed).toHaveLength(2);
      expect(tailed[0]!.event_type).toBe("EVENT_3");
      expect(tailed[1]!.event_type).toBe("EVENT_4");
    });
  });
});
