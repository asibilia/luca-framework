import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createActor } from "xstate";
import { unlinkSync, mkdirSync } from "node:fs";
import { workflowMachine } from "../../../packages/luca-framework/src/state/machine";
import { DEFAULT_COMPLEXITY_MATRIX } from "../../../packages/luca-framework/src/state/defaults";
import {
  persistActor,
  loadPersistedActor,
  createFreshActor,
  clearPersistedState,
  stateExists,
  STATE_FILE_PATH,
} from "../../../packages/luca-framework/src/state/persistence";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const TEST_STATE_PATH = ".planning/state.json";

/**
 * Clean up the state file between tests.
 */
function cleanupStateFile() {
  try {
    unlinkSync(TEST_STATE_PATH);
  } catch {
    // File may not exist -- ignore
  }
}

/**
 * Ensure the .planning directory exists for tests.
 */
function ensurePlanningDir() {
  try {
    mkdirSync(".planning", { recursive: true });
  } catch {
    // Directory may already exist -- ignore
  }
}

beforeEach(() => {
  ensurePlanningDir();
  cleanupStateFile();
});

afterEach(() => {
  cleanupStateFile();
});

// ─── persistActor ───────────────────────────────────────────────────────────

describe("persistActor", () => {
  test("creates state file and returns success", async () => {
    const actor = createActor(workflowMachine, {
      input: { complexity_matrix: DEFAULT_COMPLEXITY_MATRIX },
    });
    actor.start();

    const result = await persistActor(actor);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(STATE_FILE_PATH);
    }
  });

  test("writes valid JSON to state file", async () => {
    const actor = createActor(workflowMachine, {
      input: { complexity_matrix: DEFAULT_COMPLEXITY_MATRIX },
    });
    actor.start();

    await persistActor(actor);

    const file = Bun.file(TEST_STATE_PATH);
    const text = await file.text();
    const parsed = JSON.parse(text);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe("object");
  });

  test("persisted snapshot contains state value", async () => {
    const actor = createActor(workflowMachine, {
      input: { complexity_matrix: DEFAULT_COMPLEXITY_MATRIX },
    });
    actor.start();
    actor.send({ type: "START", ticket_id: "TEST-1" });

    await persistActor(actor);

    const file = Bun.file(TEST_STATE_PATH);
    const snapshot = await file.json();
    expect(snapshot.value).toBe("preflight");
  });
});

// ─── loadPersistedActor ─────────────────────────────────────────────────────

describe("loadPersistedActor", () => {
  test("returns error when no state file exists", async () => {
    const result = await loadPersistedActor();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  test("returns error when state file is empty", async () => {
    await Bun.write(TEST_STATE_PATH, "");

    const result = await loadPersistedActor();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("empty");
    }
  });

  test("returns error when state file has invalid JSON", async () => {
    await Bun.write(TEST_STATE_PATH, "not valid json {{{");

    const result = await loadPersistedActor();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("invalid JSON");
    }
  });

  test("loads actor from valid state file", async () => {
    // Create and persist an actor first
    const original = createActor(workflowMachine, {
      input: { complexity_matrix: DEFAULT_COMPLEXITY_MATRIX },
    });
    original.start();
    original.send({ type: "START", ticket_id: "PERSIST-1" });
    await persistActor(original);

    // Load from file
    const result = await loadPersistedActor();
    expect(result.success).toBe(true);
    if (result.success) {
      const snapshot = result.data.getSnapshot();
      expect(snapshot.value).toBe("preflight");
    }
  });
});

// ─── Persistence Round-Trip ─────────────────────────────────────────────────

describe("persistence round-trip", () => {
  test("preserves state and context through persist/load cycle", async () => {
    const original = createActor(workflowMachine, {
      input: {
        complexity_matrix: DEFAULT_COMPLEXITY_MATRIX,
        ticket_id: "ROUND-1",
      },
    });
    original.start();
    original.send({ type: "START", ticket_id: "ROUND-1" });
    original.send({
      type: "PREFLIGHT_COMPLETE",
      intuition_flags: ["RISK"],
    });

    const originalSnapshot = original.getSnapshot();
    expect(originalSnapshot.value).toBe("routing");

    // Persist
    await persistActor(original);

    // Load
    const loadResult = await loadPersistedActor();
    expect(loadResult.success).toBe(true);
    if (loadResult.success) {
      const restored = loadResult.data.getSnapshot();
      expect(restored.value).toBe("routing");
      expect(restored.context.ticket_id).toBe("ROUND-1");
      expect(restored.context.intuition_flags).toEqual(["RISK"]);
      expect(restored.context.session_id).toBe(
        originalSnapshot.context.session_id,
      );
    }
  });

  test("restored actor accepts new events", async () => {
    const original = createActor(workflowMachine, {
      input: { complexity_matrix: DEFAULT_COMPLEXITY_MATRIX },
    });
    original.start();
    original.send({ type: "START" });
    await persistActor(original);

    const loadResult = await loadPersistedActor();
    expect(loadResult.success).toBe(true);
    if (loadResult.success) {
      const actor = loadResult.data;
      // Actor should be in preflight, send PREFLIGHT_COMPLETE
      actor.send({ type: "PREFLIGHT_COMPLETE", intuition_flags: [] });
      expect(actor.getSnapshot().value).toBe("routing");
    }
  });
});

// ─── createFreshActor ───────────────────────────────────────────────────────

describe("createFreshActor", () => {
  test("creates actor in idle state", async () => {
    const result = await createFreshActor();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.getSnapshot().value).toBe("idle");
    }
  });

  test("loads config.json when available", async () => {
    const result = await createFreshActor(".planning/config.json");
    expect(result.success).toBe(true);
    if (result.success) {
      const ctx = result.data.getSnapshot().context;
      // config.json has gates.confirm_plan: true
      expect(ctx.gates.confirm_plan).toBe(true);
    }
  });

  test("falls back to defaults when config is missing", async () => {
    const result = await createFreshActor("/nonexistent/config.json");
    expect(result.success).toBe(true);
    if (result.success) {
      const ctx = result.data.getSnapshot().context;
      expect(ctx.complexity).toBe("TRIVIAL");
      expect(ctx.oversight).toBe("milestone");
    }
  });

  test("applies context overrides", async () => {
    const result = await createFreshActor(".planning/config.json", {
      ticket_id: "FRESH-1",
      complexity: "COMPLEX",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const ctx = result.data.getSnapshot().context;
      expect(ctx.ticket_id).toBe("FRESH-1");
      expect(ctx.complexity).toBe("COMPLEX");
    }
  });
});

// ─── clearPersistedState ────────────────────────────────────────────────────

describe("clearPersistedState", () => {
  test("removes existing state file", async () => {
    await Bun.write(TEST_STATE_PATH, '{"test": true}');
    expect(await Bun.file(TEST_STATE_PATH).exists()).toBe(true);

    const result = await clearPersistedState();
    expect(result.success).toBe(true);

    expect(await Bun.file(TEST_STATE_PATH).exists()).toBe(false);
  });

  test("succeeds when file does not exist (idempotent)", async () => {
    const result = await clearPersistedState();
    expect(result.success).toBe(true);
  });
});

// ─── stateExists ────────────────────────────────────────────────────────────

describe("stateExists", () => {
  test("returns false when no file exists", async () => {
    expect(await stateExists()).toBe(false);
  });

  test("returns false when file is empty", async () => {
    await Bun.write(TEST_STATE_PATH, "");
    expect(await stateExists()).toBe(false);
  });

  test("returns false when file has only whitespace", async () => {
    await Bun.write(TEST_STATE_PATH, "   \n  ");
    expect(await stateExists()).toBe(false);
  });

  test("returns true when file has content", async () => {
    await Bun.write(TEST_STATE_PATH, '{"state": "idle"}');
    expect(await stateExists()).toBe(true);
  });
});
