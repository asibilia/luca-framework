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
    expect(body).toContain("event_type = 'START'");
  });

  test("builds SQL with since filter", async () => {
    mockSpacetimeDB([]);

    await readLedger({ since: "2026-03-01T00:00:00.000Z" });

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("timestamp >= '2026-03-01T00:00:00.000Z'");
  });

  test("builds SQL with LIMIT", async () => {
    mockSpacetimeDB([]);

    await readLedger({ limit: 5 });

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("LIMIT 5");
  });

  test("includes ORDER BY sequence_number ASC", async () => {
    mockSpacetimeDB([]);

    await readLedger({});

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("ORDER BY sequence_number ASC");
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

  test("escapes single quotes in filter values", async () => {
    mockSpacetimeDB([]);

    await readLedger({ session_id: "it's a test" });

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    // v2.0: body is raw SQL string, not JSON
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("it''s a test");
  });

  test("falls back to JSONL when SpacetimeDB unavailable", async () => {
    // Default mock throws — should fall through to file
    const entries = await readLedger({}, "/tmp/nonexistent-ledger-file.jsonl");
    expect(entries).toEqual([]);
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
        // Return max sequence number (v2.0 format)
        const v2 = [
          {
            schema: { elements: [{ name: { some: "max_seq" } }] },
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

  test("uses SpacetimeDB MAX query for sequence number seeding", async () => {
    mockSpacetimeDB([{ max_seq: 10 }]);

    const entry = await appendLedgerEntry(makeRecord());

    // Should use sequence 11 (MAX + 1)
    expect(entry.sequence_number).toBe(11);
    expect(entry.parent_id).toBe(10);
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
  test("queries MAX(sequence_number) from SpacetimeDB", async () => {
    mockSpacetimeDB([{ max_seq: 42 }]);

    const entry = await appendLedgerEntry(makeRecord());

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCall).toBeDefined();

    // v2.0: body is raw SQL string, not JSON
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("MAX(sequence_number)");
    expect(body).toContain("ledger_entries");

    expect(entry.sequence_number).toBe(43);
  });

  test("caches sequence number after first query", async () => {
    mockSpacetimeDB([{ max_seq: 10 }]);

    const entry1 = await appendLedgerEntry(makeRecord());
    const entry2 = await appendLedgerEntry(makeRecord());

    expect(entry1.sequence_number).toBe(11);
    expect(entry2.sequence_number).toBe(12);

    // Only one SQL query should have been made (for the first entry)
    const sqlCalls = fetchCalls.filter((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCalls).toHaveLength(1);
  });
});
