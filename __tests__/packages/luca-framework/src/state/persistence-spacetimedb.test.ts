/**
 * Tests for persistence.ts -- SpacetimeDB-primary read/write paths.
 *
 * Validates that persistence functions query SpacetimeDB first,
 * fall back to JSON files, and call reducers for writes.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import {
  persistActor,
  loadPersistedActor,
  stateExists,
  createFreshActor,
} from "../../../../../packages/luca-framework/src/state/persistence";

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
  envBackup = {
    LUCA_SPACETIMEDB_URL: process.env.LUCA_SPACETIMEDB_URL,
    LUCA_OBSERVER_URL: process.env.LUCA_OBSERVER_URL,
    LUCA_EXPORT_MD: process.env.LUCA_EXPORT_MD,
  };

  // Point to localhost so SSRF check passes
  process.env.LUCA_SPACETIMEDB_URL = "http://localhost:3000";

  // Default mock: SpacetimeDB unavailable (connection refused)
  globalThis.fetch = (async (url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    throw new Error("Connection refused");
  }) as typeof fetch;
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

// --- Helpers -------------------------------------------------------------------

/**
 * Build a SpacetimeDB v2.0 SQL response from an array of row objects.
 *
 * Converts [{field: val, ...}, ...] into the v2.0 positional format:
 * [{ schema: { elements: [{ name: { some: "field" } }] }, rows: [[val, ...]] }]
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

/** Create a mock fetch that returns a SpacetimeDB SQL response (v2.0 format). */
function mockSpacetimeDBQuery(rowObjects: Record<string, unknown>[]) {
  globalThis.fetch = (async (url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    const urlStr = String(url);

    // SQL query endpoint (v2.0 path)
    if (urlStr.includes("/v1/database/luca-observer/sql")) {
      return new Response(JSON.stringify(toV2Response(rowObjects)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Reducer call endpoint (v2.0 path)
    if (urlStr.includes("/v1/database/luca-observer/call/")) {
      return new Response("ok", { status: 200 });
    }

    throw new Error(`Unexpected URL: ${urlStr}`);
  }) as typeof fetch;
}

// --- Tests: stateExists --------------------------------------------------------

describe("stateExists", () => {
  test("returns true when SpacetimeDB has workflow_state rows", async () => {
    mockSpacetimeDBQuery([{ cnt: 1 }]);

    const exists = await stateExists("/tmp/nonexistent-state.json");
    expect(exists).toBe(true);
  });

  test("returns false when SpacetimeDB has zero rows", async () => {
    mockSpacetimeDBQuery([{ cnt: 0 }]);

    const exists = await stateExists("/tmp/nonexistent-state.json");
    expect(exists).toBe(false);
  });

  test("falls back to JSON file when SpacetimeDB fails", async () => {
    // Default mock throws "Connection refused"
    const exists = await stateExists("/tmp/nonexistent-state.json");
    expect(exists).toBe(false);
  });

  test("SpacetimeDB query uses correct SQL", async () => {
    mockSpacetimeDBQuery([{ cnt: 0 }]);

    await stateExists();

    // Find the SQL query call
    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCall).toBeDefined();

    // v2.0: body is raw SQL string, not JSON
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("COUNT(*)");
    expect(body).toContain("workflow_state");
  });
});

// --- Tests: persistActor -------------------------------------------------------

describe("persistActor", () => {
  test("calls update_workflow_state reducer", async () => {
    // Mock: accept reducer calls
    globalThis.fetch = (async (url: any, init?: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const mockActor = {
      getPersistedSnapshot: () => ({ value: "executing", context: {} }),
      getSnapshot: () => ({
        value: "executing",
        context: {
          current_phase: "phase-1",
          complexity: "MODERATE",
          oversight: "milestone",
          session_id: "test-123",
          ticket_id: "PROJ-1",
        },
      }),
    };

    const result = await persistActor(mockActor);
    expect(result.success).toBe(true);

    // Verify reducer was called
    const reducerCall = fetchCalls.find((c) =>
      c.url.includes("/call/update_workflow_state"),
    );
    expect(reducerCall).toBeDefined();

    const body = JSON.parse(reducerCall!.init?.body as string);
    expect(body.workflowState).toBe("executing");
    expect(body.currentPhase).toBe("phase-1");
    expect(body.complexity).toBe("MODERATE");
    expect(body.sessionId).toBe("test-123");
  });

  test("returns success even when reducer call fails (fire-and-forget)", async () => {
    // Default mock throws — but persistActor uses callReducer which swallows errors
    const mockActor = {
      getPersistedSnapshot: () => ({ value: "idle", context: {} }),
      getSnapshot: () => ({
        value: "idle",
        context: {},
      }),
    };

    const result = await persistActor(mockActor);
    expect(result.success).toBe(true);
  });
});

// --- Tests: loadPersistedActor -------------------------------------------------

describe("loadPersistedActor", () => {
  test("falls back to JSON file when SpacetimeDB unavailable", async () => {
    // Default mock throws "Connection refused"
    const result = await loadPersistedActor("/tmp/nonexistent-state.json");

    // Should fail because neither SpacetimeDB nor JSON file exists
    expect(result.success).toBe(false);
    expect(result.error).toContain("State file not found");
  });

  test("queries workflow_state table from SpacetimeDB", async () => {
    // Mock SpacetimeDB response (but with invalid context so actor creation fails gracefully)
    mockSpacetimeDBQuery([]);

    await loadPersistedActor("/tmp/nonexistent-state.json");

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCall).toBeDefined();

    // v2.0: body is raw SQL string, not JSON
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("workflow_state");
    expect(body).toContain("id = 1");
  });
});

// --- Tests: createFreshActor ---------------------------------------------------

describe("createFreshActor", () => {
  test("falls back to local config.json when SpacetimeDB unavailable", async () => {
    // Default mock throws — should try SpacetimeDB then fall back
    const result = await createFreshActor("/tmp/nonexistent-config.json");

    // Should succeed with default config (empty config is ok)
    expect(result.success).toBe(true);
  });

  test("queries workflow_config table from SpacetimeDB", async () => {
    mockSpacetimeDBQuery([]);

    await createFreshActor("/tmp/nonexistent-config.json");

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCall).toBeDefined();

    // v2.0: body is raw SQL string, not JSON
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("workflow_config");
  });
});
