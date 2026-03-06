/**
 * Tests for spacetimedb-client.ts -- HTTP query client for SpacetimeDB.
 *
 * Validates SSRF protection, query construction, response parsing,
 * timeout behavior, and error handling.
 *
 * Updated for SpacetimeDB HTTP API v2.0:
 * - SQL endpoint: /v1/database/{db}/sql
 * - Content-Type: text/plain (raw SQL body)
 * - Response format: [{ schema: { elements: [...] }, rows: [[...]] }]
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

import {
  queryTable,
  queryOne,
  _resetCircuitBreaker,
} from "../../../../../../packages/luca-framework/src/state/__helpers/spacetimedb-client";

// --- Test State ----------------------------------------------------------------

interface CapturedCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: CapturedCall[] = [];
const originalFetch = globalThis.fetch;
let envBackup: Record<string, string | undefined> = {};

// --- Helpers -------------------------------------------------------------------

/**
 * Build a SpacetimeDB v2.0 SQL response with schema + positional rows.
 *
 * @param fields - Array of field names for the schema
 * @param rows - Array of positional row arrays
 * @returns The v2.0 response format: [{ schema: { elements: [...] }, rows: [[...]] }]
 */
function makeV2Response(
  fields: string[],
  rows: unknown[][],
): [
  {
    schema: { elements: Array<{ name: { some: string } }> };
    rows: unknown[][];
  },
] {
  return [
    {
      schema: {
        elements: fields.map((f) => ({ name: { some: f } })),
      },
      rows,
    },
  ];
}

// --- Setup / Teardown ----------------------------------------------------------

beforeEach(() => {
  fetchCalls = [];
  _resetCircuitBreaker();
  envBackup = {
    LUCA_SPACETIMEDB_URL: process.env.LUCA_SPACETIMEDB_URL,
  };

  // Default: point to localhost so SSRF check passes
  process.env.LUCA_SPACETIMEDB_URL = "http://localhost:3000";

  // Default mock: capture calls and resolve with empty v2.0 result set
  globalThis.fetch = (async (url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(
      JSON.stringify([{ schema: { elements: [] }, rows: [] }]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// --- Tests: queryTable ---------------------------------------------------------

describe("queryTable", () => {
  describe("request construction", () => {
    test("sends POST to /v1/database/luca-observer/sql", async () => {
      await queryTable("SELECT * FROM test_table");

      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0]!;
      expect(call.url).toBe(
        "http://localhost:3000/v1/database/luca-observer/sql",
      );
      expect(call.init?.method).toBe("POST");
    });

    test("sends raw SQL string as body (not JSON)", async () => {
      await queryTable("SELECT * FROM ledger_entries WHERE session_id = 'abc'");

      expect(fetchCalls).toHaveLength(1);
      const body = fetchCalls[0]!.init?.body as string;
      expect(body).toBe(
        "SELECT * FROM ledger_entries WHERE session_id = 'abc'",
      );
    });

    test("sets Content-Type to text/plain", async () => {
      await queryTable("SELECT 1");

      const headers = fetchCalls[0]!.init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("text/plain");
    });

    test("includes AbortSignal for timeout", async () => {
      await queryTable("SELECT 1");

      const signal = fetchCalls[0]!.init?.signal;
      expect(signal).toBeDefined();
      expect(signal).toBeInstanceOf(AbortSignal);
    });

    test("strips trailing slashes from URL", async () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://localhost:3000///";
      await queryTable("SELECT 1");

      expect(fetchCalls[0]!.url).toBe(
        "http://localhost:3000/v1/database/luca-observer/sql",
      );
    });
  });

  describe("URL resolution", () => {
    test("uses LUCA_SPACETIMEDB_URL when set", async () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://localhost:4000";

      await queryTable("SELECT 1");

      expect(fetchCalls[0]!.url).toStartWith("http://localhost:4000/");
    });

    test("does NOT fall back to LUCA_OBSERVER_URL (different service)", async () => {
      delete process.env.LUCA_SPACETIMEDB_URL;
      process.env.LUCA_OBSERVER_URL = "http://localhost:5000";

      await queryTable("SELECT 1");

      // Should use default localhost:3000, NOT the observer URL
      expect(fetchCalls[0]!.url).toStartWith("http://localhost:3000/");

      // Clean up
      delete process.env.LUCA_OBSERVER_URL;
    });

    test("falls back to default localhost:3000 when no env vars set", async () => {
      delete process.env.LUCA_SPACETIMEDB_URL;

      await queryTable("SELECT 1");

      expect(fetchCalls[0]!.url).toStartWith("http://localhost:3000/");
    });
  });

  describe("circuit breaker", () => {
    test("returns empty array when circuit is open (recent failure)", async () => {
      // First call fails with 404 — trips circuit breaker
      globalThis.fetch = (async () =>
        new Response("Not found", { status: 404 })) as unknown as typeof fetch;

      await expect(queryTable("SELECT 1")).rejects.toThrow();

      // Reset fetch mock to succeed
      fetchCalls = [];
      globalThis.fetch = (async (url: any, init?: any) => {
        fetchCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify([{ schema: { elements: [] }, rows: [] }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as unknown as typeof fetch;

      // Second call should be skipped (circuit open)
      const result = await queryTable("SELECT 1");
      expect(result).toEqual([]);
      expect(fetchCalls).toHaveLength(0);
    });

    test("resets circuit breaker on success", async () => {
      _resetCircuitBreaker();

      await queryTable("SELECT 1");
      expect(fetchCalls).toHaveLength(1);
    });

    test("resets circuit breaker after connection error", async () => {
      // Trip the circuit
      globalThis.fetch = (async () => {
        throw new Error("Connection refused");
      }) as unknown as typeof fetch;

      await expect(queryTable("SELECT 1")).rejects.toThrow();

      // Manually reset (simulating cooldown expiry)
      _resetCircuitBreaker();

      // Should attempt again
      fetchCalls = [];
      globalThis.fetch = (async (url: any, init?: any) => {
        fetchCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify([{ schema: { elements: [] }, rows: [] }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as unknown as typeof fetch;

      const result = await queryTable("SELECT 1");
      expect(result).toEqual([]);
      expect(fetchCalls).toHaveLength(1);
    });
  });

  describe("response parsing", () => {
    test("converts v2.0 positional rows to named objects", async () => {
      const v2Response = makeV2Response(
        ["id", "name"],
        [
          [1, "test"],
          [2, "test2"],
        ],
      );
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(v2Response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as unknown as typeof fetch;

      const result = await queryTable<{ id: number; name: string }>(
        "SELECT * FROM test",
      );
      expect(result).toEqual([
        { id: 1, name: "test" },
        { id: 2, name: "test2" },
      ]);
    });

    test("returns empty array for v2.0 result set with no rows", async () => {
      const v2Response = makeV2Response(["id", "name"], []);
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(v2Response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as unknown as typeof fetch;

      const result = await queryTable<{ id: number }>("SELECT * FROM test");
      expect(result).toEqual([]);
    });

    test("returns empty array for empty top-level array", async () => {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as unknown as typeof fetch;

      const result = await queryTable("SELECT * FROM test");
      expect(result).toEqual([]);
    });

    test("returns empty array for null response body", async () => {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as unknown as typeof fetch;

      const result = await queryTable("SELECT * FROM test");
      expect(result).toEqual([]);
    });
  });

  describe("error handling", () => {
    test("throws on non-OK HTTP response", async () => {
      globalThis.fetch = (async () =>
        new Response("Table not found", {
          status: 404,
        })) as unknown as typeof fetch;

      await expect(queryTable("SELECT * FROM missing")).rejects.toThrow(
        "[spacetimedb-client] Query failed (404)",
      );
    });

    test("throws on 500 server error", async () => {
      globalThis.fetch = (async () =>
        new Response("Internal error", {
          status: 500,
        })) as unknown as typeof fetch;

      await expect(queryTable("SELECT * FROM test")).rejects.toThrow(
        "[spacetimedb-client] Query failed (500)",
      );
    });

    test("throws on fetch rejection (network error)", async () => {
      globalThis.fetch = (async () => {
        throw new Error("Connection refused");
      }) as unknown as typeof fetch;

      await expect(queryTable("SELECT 1")).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("SSRF protection", () => {
    test("refuses non-localhost URL", async () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://evil.com:3000";

      await expect(queryTable("SELECT 1")).rejects.toThrow(
        "URL must point to localhost",
      );
      expect(fetchCalls).toHaveLength(0);
    });

    test("refuses remote IP address", async () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://203.0.113.1:3000";

      await expect(queryTable("SELECT 1")).rejects.toThrow(
        "URL must point to localhost",
      );
      expect(fetchCalls).toHaveLength(0);
    });

    test("allows localhost", async () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://localhost:3000";
      await queryTable("SELECT 1");
      expect(fetchCalls).toHaveLength(1);
    });

    test("allows 127.0.0.1", async () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://127.0.0.1:3000";
      await queryTable("SELECT 1");
      expect(fetchCalls).toHaveLength(1);
    });

    test("allows [::1]", async () => {
      process.env.LUCA_SPACETIMEDB_URL = "http://[::1]:3000";
      await queryTable("SELECT 1");
      expect(fetchCalls).toHaveLength(1);
    });

    test("refuses malformed URL", async () => {
      process.env.LUCA_SPACETIMEDB_URL = "not-a-url";

      await expect(queryTable("SELECT 1")).rejects.toThrow(
        "URL must point to localhost",
      );
      expect(fetchCalls).toHaveLength(0);
    });
  });
});

// --- Tests: queryOne -----------------------------------------------------------

describe("queryOne", () => {
  test("returns first row when rows exist", async () => {
    const v2Response = makeV2Response(
      ["id", "name"],
      [
        [1, "first"],
        [2, "second"],
      ],
    );
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(v2Response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    const result = await queryOne<{ id: number; name: string }>(
      "SELECT * FROM test",
    );
    expect(result).toEqual({ id: 1, name: "first" });
  });

  test("returns null when no rows match", async () => {
    const v2Response = makeV2Response(["id", "name"], []);
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(v2Response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    const result = await queryOne("SELECT * FROM test WHERE id = 999");
    expect(result).toBeNull();
  });

  test("propagates errors from queryTable", async () => {
    process.env.LUCA_SPACETIMEDB_URL = "http://evil.com:3000";

    await expect(queryOne("SELECT 1")).rejects.toThrow(
      "URL must point to localhost",
    );
  });
});
