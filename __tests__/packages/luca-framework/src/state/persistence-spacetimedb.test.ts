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
  }) as unknown as typeof fetch;
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
    }) as unknown as typeof fetch;

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
  test("fails when state JSON file does not exist", async () => {
    const result = await loadPersistedActor("/tmp/nonexistent-state.json");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("State file not found");
    }
  });

  test("reads actor snapshot from local JSON file", async () => {
    const testPath = "/tmp/test-load-actor.json";
    const testSnapshot = {
      value: "idle",
      context: {
        current_phase: 1,
        complexity: "MODERATE",
        oversight: "milestone",
        session_id: "test-123",
        ticket_id: "PROJ-1",
      },
      status: "active",
      children: {},
      historyValue: {},
    };

    await Bun.write(testPath, JSON.stringify(testSnapshot));

    try {
      const result = await loadPersistedActor(testPath);
      if (!result.success) {
        console.error("Test debug - loadPersistedActor error:", result.error);
      }
      expect(result.success).toBe(true);
    } finally {
      try {
        // Clean up by writing empty file
        await Bun.write(testPath, "");
      } catch {
        // Ignore cleanup errors
      }
    }
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
