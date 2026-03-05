/**
 * Tests for ledger.ts -- SpacetimeDB-primary read/write paths.
 *
 * Validates that ledger operations query SpacetimeDB first,
 * call reducers for writes, and fall back to JSONL files.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import {
  appendLedgerEntry,
  readLedger,
  _resetSequenceCounter,
} from "../../../../../packages/luca-framework/src/state/ledger";
import type { TransitionRecord } from "../../../../../packages/luca-framework/src/state/types";

// --- Test State ----------------------------------------------------------------

interface CapturedCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: CapturedCall[] = [];
const originalFetch = globalThis.fetch;
let envBackup: Record<string, string | undefined> = {};

// --- Setup / Teardown ----------------------------------------------------------

beforeEach(() => {
  fetchCalls = [];
  _resetSequenceCounter();
  envBackup = {
    LUCA_SPACETIMEDB_URL: process.env.LUCA_SPACETIMEDB_URL,
    LUCA_OBSERVER_URL: process.env.LUCA_OBSERVER_URL,
  };

  process.env.LUCA_SPACETIMEDB_URL = "http://localhost:3000";

  // Default mock: SpacetimeDB unavailable
  globalThis.fetch = (async (url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    throw new Error("Connection refused");
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  _resetSequenceCounter();
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// --- Helpers -------------------------------------------------------------------

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
 * Build a SpacetimeDB v2.0 SQL response from an array of row objects.
 */
function toV2Response(rowObjects: Record<string, unknown>[]) {
  if (rowObjects.length === 0) {
    return [{ schema: { elements: [] }, rows: [] }];
  }
  const fields = Object.keys(rowObjects[0]!);
  return [
    {
      schema: {
        elements: fields.map((f) => ({ name: { some: f } })),
      },
      rows: rowObjects.map((obj) => fields.map((f) => obj[f])),
    },
  ];
}

function mockSpacetimeDB(rowObjects: Record<string, unknown>[]) {
  globalThis.fetch = (async (url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    const urlStr = String(url);

    if (urlStr.includes("/v1/database/luca-observer/sql")) {
      return new Response(JSON.stringify(toV2Response(rowObjects)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.includes("/v1/database/luca-observer/call/")) {
      return new Response("ok", { status: 200 });
    }

    throw new Error(`Unexpected URL: ${urlStr}`);
  }) as unknown as typeof fetch;
}

// --- Tests: readLedger SpacetimeDB path ----------------------------------------

describe("readLedger (SpacetimeDB path)", () => {
  test("queries ledger_entries from SpacetimeDB", async () => {
    const rows = [
      {
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
      },
    ];
    mockSpacetimeDB(rows);

    const entries = await readLedger({});
    expect(entries.length).toBe(1);
    expect(entries[0]!.session_id).toBe("abc-123");
  });

  test("builds SQL with session_id filter", async () => {
    mockSpacetimeDB([]);

    await readLedger({ session_id: "test-session" });

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCall).toBeDefined();

    // v2.0: body is raw SQL string, not JSON
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("session_id = 'test-session'");
  });

  test("builds SQL with event_type filter", async () => {
    mockSpacetimeDB([]);

    await readLedger({ event_type: "START" });

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("action = 'START'");
  });

  test("builds SQL with since filter", async () => {
    mockSpacetimeDB([]);

    await readLedger({ since: "2026-03-01T00:00:00.000Z" });

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    const body = sqlCall!.init?.body as string;
    // SpacetimeDB stores timestamps as U64 milliseconds, not ISO strings
    const expectedMs = new Date("2026-03-01T00:00:00.000Z").getTime();
    expect(body).toContain(`timestamp >= ${expectedMs}`);
  });

  test("does not include LIMIT in SQL (applied client-side)", async () => {
    mockSpacetimeDB([]);

    await readLedger({ limit: 5 });

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    const body = sqlCall!.init?.body as string;
    expect(body).not.toContain("LIMIT");
  });

  test("does not include ORDER BY in SQL (unsupported in SpacetimeDB v2)", async () => {
    mockSpacetimeDB([]);

    await readLedger({});

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    const body = sqlCall!.init?.body as string;
    expect(body).not.toContain("ORDER BY");
  });

  test("applies limit client-side after sorting", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: `2026-03-03T${String(i + 10).padStart(2, "0")}:00:00.000Z`,
      session_id: "abc",
      sequence_number: i,
      parent_id: i === 0 ? null : i - 1,
    }));
    mockSpacetimeDB(rows);

    const entries = await readLedger({ limit: 3 });
    expect(entries.length).toBe(3);
    expect(entries[0]!.sequence_number).toBe(0);
    expect(entries[2]!.sequence_number).toBe(2);
  });

  test("sorts results client-side by sequence_number", async () => {
    // Return rows in reverse order to verify client-side sorting
    const rows = [2, 0, 4, 1, 3].map((i) => ({
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: `2026-03-03T${String(i + 10).padStart(2, "0")}:00:00.000Z`,
      session_id: "abc",
      sequence_number: i,
      parent_id: i === 0 ? null : i - 1,
    }));
    mockSpacetimeDB(rows);

    const entries = await readLedger({});
    expect(entries.length).toBe(5);
    expect(entries.map((e) => e.sequence_number)).toEqual([0, 1, 2, 3, 4]);
  });

  test("applies tail filter on SpacetimeDB results", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: {},
      actions_executed: [],
      context: {},
      timestamp: `2026-03-03T${String(i + 10).padStart(2, "0")}:00:00.000Z`,
      session_id: "abc",
      sequence_number: i,
      parent_id: i === 0 ? null : i - 1,
    }));
    mockSpacetimeDB(rows);

    const entries = await readLedger({ tail: 2 });
    expect(entries.length).toBe(2);
    expect(entries[0]!.sequence_number).toBe(3);
    expect(entries[1]!.sequence_number).toBe(4);
  });

  test("rejects session_id containing single quotes (SQL injection prevention)", async () => {
    // The implementation uses validate-and-reject (not escape) for session_id.
    // SAFE_SESSION_ID_RE only allows alphanumeric, hyphens, and underscores.
    // Values with apostrophes are rejected before any SQL is constructed.
    await expect(readLedger({ session_id: "it's a test" })).rejects.toThrow(
      "Invalid session_id format",
    );
  });

  test("falls back to JSONL when SpacetimeDB unavailable", async () => {
    // Default mock throws — should fall through to file
    const entries = await readLedger({}, "/tmp/nonexistent-ledger-file.jsonl");
    expect(entries).toEqual([]);
  });
});

// --- Tests: readLedger SQL injection prevention (integration) -----------------

describe("readLedger SQL injection prevention (integration)", () => {
  test("throws before any fetch call for malicious session_id", async () => {
    await expect(
      readLedger({ session_id: "'; DROP TABLE ledger_entries; --" }),
    ).rejects.toThrow("Invalid session_id format");

    // fetch should NOT have been called — validation throws before SQL construction
    const sqlCalls = fetchCalls.filter((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCalls).toHaveLength(0);
  });

  test("throws before any fetch call for unknown event_type", async () => {
    await expect(readLedger({ event_type: "malicious_event" })).rejects.toThrow(
      "Invalid event_type",
    );

    const sqlCalls = fetchCalls.filter((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCalls).toHaveLength(0);
  });

  test("throws before any fetch call for session_id with null byte", async () => {
    await expect(readLedger({ session_id: "abc\x00def" })).rejects.toThrow(
      "Invalid session_id format",
    );

    const sqlCalls = fetchCalls.filter((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCalls).toHaveLength(0);
  });

  test("throws before any fetch call for session_id over 256 chars", async () => {
    await expect(readLedger({ session_id: "a".repeat(257) })).rejects.toThrow(
      "Invalid session_id format",
    );

    const sqlCalls = fetchCalls.filter((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCalls).toHaveLength(0);
  });
});

// --- Tests: appendLedgerEntry SpacetimeDB path --------------------------------

describe("appendLedgerEntry (SpacetimeDB path)", () => {
  test("calls append_ledger_entry reducer", async () => {
    // Mock SpacetimeDB for both sequence query + reducer call
    let callCount = 0;
    globalThis.fetch = (async (url: any, init?: any) => {
      fetchCalls.push({ url: String(url), init });
      const urlStr = String(url);
      callCount++;

      if (urlStr.includes("/v1/database/luca-observer/sql")) {
        // Return COUNT(*) = 5 (v2.0 format)
        const v2 = [
          {
            schema: { elements: [{ name: { some: "n" } }] },
            rows: [[5]],
          },
        ];
        return new Response(JSON.stringify(v2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (urlStr.includes("/v1/database/luca-observer/call/")) {
        return new Response("ok", { status: 200 });
      }

      throw new Error(`Unexpected URL: ${urlStr}`);
    }) as unknown as typeof fetch;

    const entry = await appendLedgerEntry(makeRecord());

    // Verify the reducer was called
    const reducerCall = fetchCalls.find((c) =>
      c.url.includes("/call/append_ledger_entry"),
    );
    expect(reducerCall).toBeDefined();

    const body = JSON.parse(reducerCall!.init?.body as string);
    expect(body.action).toBe("START");
    expect(body.result).toBe("preflight");
    expect(body.sessionId).toBe("test-session-001");
  });

  test("uses SpacetimeDB COUNT query for sequence number seeding", async () => {
    mockSpacetimeDB([{ n: 10 }]);

    const entry = await appendLedgerEntry(makeRecord());

    // COUNT=10 means max_seq=9, so next_seq=10
    expect(entry.sequence_number).toBe(10);
    expect(entry.parent_id).toBe(9);
  });

  test("returns entry with correct sequence when SpacetimeDB unavailable", async () => {
    // Default mock throws — falls back to file-based sequence
    // No file exists, so starts at 0
    const entry = await appendLedgerEntry(
      makeRecord(),
      "/tmp/luca-test-ledger-stdb-fallback.jsonl",
    );

    expect(entry.sequence_number).toBe(0);
    expect(entry.parent_id).toBeNull();

    // Cleanup
    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync("/tmp/luca-test-ledger-stdb-fallback.jsonl");
    } catch {
      // Ignore
    }
  });
});

// --- Tests: getNextSequenceNumber SpacetimeDB path ----------------------------

describe("sequence number from SpacetimeDB", () => {
  test("queries COUNT(*) from SpacetimeDB (MAX not supported)", async () => {
    mockSpacetimeDB([{ n: 42 }]);

    const entry = await appendLedgerEntry(makeRecord());

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCall).toBeDefined();

    // v2.0: body is raw SQL string, not JSON
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("COUNT(*)");
    expect(body).toContain("ledger_entries");
    expect(body).not.toContain("MAX");

    // COUNT=42 → next_seq=42
    expect(entry.sequence_number).toBe(42);
  });

  test("caches sequence number after first query", async () => {
    mockSpacetimeDB([{ n: 10 }]);

    const entry1 = await appendLedgerEntry(makeRecord());
    const entry2 = await appendLedgerEntry(makeRecord());

    // COUNT=10 → first gets 10, second gets 11
    expect(entry1.sequence_number).toBe(10);
    expect(entry2.sequence_number).toBe(11);

    // Only one SQL query should have been made (for the first entry)
    const sqlCalls = fetchCalls.filter((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCalls).toHaveLength(1);
  });
});
