/**
 * Tests for suspend-checkpoint.ts -- SpacetimeDB-primary checkpoint persistence.
 *
 * Validates that checkpoint operations query SpacetimeDB first,
 * fall back to local files, and call reducers for writes.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, rmSync } from "node:fs";

import {
  createSuspendCheckpoint,
  loadSuspendCheckpoint,
  clearSuspendCheckpoint,
  suspendCheckpointSchema,
} from "../../../../../packages/luca-framework/src/state/suspend-checkpoint";
import type { SuspendCheckpoint } from "../../../../../packages/luca-framework/src/state/suspend-checkpoint";

// --- Test State ----------------------------------------------------------------

interface CapturedCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: CapturedCall[] = [];
const originalFetch = globalThis.fetch;
let envBackup: Record<string, string | undefined> = {};

const TEST_CHECKPOINT_DIR = "/tmp/luca-test-checkpoints";

// --- Setup / Teardown ----------------------------------------------------------

beforeEach(() => {
  fetchCalls = [];
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
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// --- Helpers -------------------------------------------------------------------

function makeCheckpoint(
  overrides: Partial<SuspendCheckpoint> = {},
): SuspendCheckpoint {
  return {
    phase_id: 107,
    wave_index: 2,
    completed_task_ids: ["task-1", "task-2"],
    working_memory_snapshot: "## Current Focus\nMigrating SpacetimeDB",
    suspended_at: new Date().toISOString(),
    reason: "context_exhaustion",
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

function mockSpacetimeDBQuery(rowObjects: Record<string, unknown>[]) {
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

// --- Tests: suspendCheckpointSchema -------------------------------------------

describe("suspendCheckpointSchema", () => {
  test("accepts valid checkpoint", () => {
    const result = suspendCheckpointSchema.safeParse(makeCheckpoint());
    expect(result.success).toBe(true);
  });

  test("defaults completed_task_ids to empty array", () => {
    const cp = makeCheckpoint();
    delete (cp as any).completed_task_ids;
    const result = suspendCheckpointSchema.safeParse(cp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completed_task_ids).toEqual([]);
    }
  });

  test("defaults working_memory_snapshot to empty string", () => {
    const cp = makeCheckpoint();
    delete (cp as any).working_memory_snapshot;
    const result = suspendCheckpointSchema.safeParse(cp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.working_memory_snapshot).toBe("");
    }
  });

  test("requires phase_id as integer", () => {
    const result = suspendCheckpointSchema.safeParse({
      ...makeCheckpoint(),
      phase_id: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

// --- Tests: createSuspendCheckpoint -------------------------------------------

describe("createSuspendCheckpoint", () => {
  test("calls save_checkpoint reducer", async () => {
    // Mock: accept reducer calls
    globalThis.fetch = (async (url: any, init?: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const cp = makeCheckpoint({ phase_id: 42 });
    await createSuspendCheckpoint(cp);

    const reducerCall = fetchCalls.find((c) =>
      c.url.includes("/call/save_checkpoint"),
    );
    expect(reducerCall).toBeDefined();

    const body = JSON.parse(reducerCall!.init?.body as string);
    expect(body.phaseId).toBe(42);
    expect(body.checkpointJson).toBeDefined();

    // Verify the checkpoint JSON is parseable
    const parsed = JSON.parse(body.checkpointJson);
    expect(parsed.phase_id).toBe(42);
    expect(parsed.wave_index).toBe(2);
  });

  test("writes backup file to .planning/checkpoints/", async () => {
    globalThis.fetch = (async (url: any, init?: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const cp = makeCheckpoint({ phase_id: 999 });
    const filePath = await createSuspendCheckpoint(cp);

    expect(filePath).toContain("suspend-999.json");
    expect(existsSync(filePath)).toBe(true);

    // Cleanup
    try {
      unlinkSync(filePath);
    } catch {
      // Ignore
    }
  });
});

// --- Tests: loadSuspendCheckpoint ---------------------------------------------

describe("loadSuspendCheckpoint", () => {
  test("loads from SpacetimeDB when available", async () => {
    const cp = makeCheckpoint({ phase_id: 50 });
    mockSpacetimeDBQuery([{ checkpointJson: JSON.stringify(cp) }]);

    const loaded = await loadSuspendCheckpoint(50);
    expect(loaded.phase_id).toBe(50);
    expect(loaded.wave_index).toBe(2);
    expect(loaded.session_id).toBe("test-session-001");
  });

  test("queries suspend_checkpoints table with correct phaseId", async () => {
    mockSpacetimeDBQuery([]);

    try {
      await loadSuspendCheckpoint(77);
    } catch {
      // Expected: no checkpoint found
    }

    const sqlCall = fetchCalls.find((c) =>
      c.url.includes("/v1/database/luca-observer/sql"),
    );
    expect(sqlCall).toBeDefined();

    // v2.0: body is raw SQL string, not JSON
    const body = sqlCall!.init?.body as string;
    expect(body).toContain("suspend_checkpoints");
    expect(body).toContain("77");
  });

  test("falls back to file when SpacetimeDB unavailable", async () => {
    // Default mock throws "Connection refused"
    // No file exists either
    await expect(loadSuspendCheckpoint(999)).rejects.toThrow(
      "No suspend checkpoint found for phase 999",
    );
  });

  test("falls back to file when SpacetimeDB returns empty", async () => {
    mockSpacetimeDBQuery([]);

    await expect(loadSuspendCheckpoint(888)).rejects.toThrow(
      "No suspend checkpoint found for phase 888",
    );
  });
});

// --- Tests: clearSuspendCheckpoint --------------------------------------------

describe("clearSuspendCheckpoint", () => {
  test("calls delete_checkpoint reducer", async () => {
    globalThis.fetch = (async (url: any, init?: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    await clearSuspendCheckpoint(42);

    const reducerCall = fetchCalls.find((c) =>
      c.url.includes("/call/delete_checkpoint"),
    );
    expect(reducerCall).toBeDefined();

    const body = JSON.parse(reducerCall!.init?.body as string);
    expect(body.phaseId).toBe(42);
  });

  test("does not throw when file does not exist", async () => {
    globalThis.fetch = (async (url: any, init?: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    // Should not throw even though no file exists
    await expect(clearSuspendCheckpoint(99999)).resolves.toBeUndefined();
  });
});
