import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  createSuspendCheckpoint,
  loadSuspendCheckpoint,
  clearSuspendCheckpoint,
  suspendCheckpointExists,
  suspendCheckpointSchema,
} from "../suspend-checkpoint.ts";

// ─── Test Setup ──────────────────────────────────────────────────────────────

let originalCwd: string;
let tempDir: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "suspend-checkpoint-test-"));
  process.chdir(tempDir);
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

afterEach(async () => {
  // Clean up any checkpoint files between tests
  try {
    const checkpointsDir = join(tempDir, ".planning", "checkpoints");
    const { readdirSync, unlinkSync } = await import("node:fs");
    const files = readdirSync(checkpointsDir).filter((f) =>
      f.startsWith("suspend-"),
    );
    for (const f of files) {
      unlinkSync(join(checkpointsDir, f));
    }
  } catch {
    // Directory doesn't exist yet — that's fine
  }
});

// ─── Valid Checkpoint Data ──────────────────────────────────────────────────

const VALID_CHECKPOINT = {
  phase_id: 42,
  wave_index: 1,
  completed_task_ids: ["42-01-T1", "42-01-T2"],
  working_memory_snapshot: "# Working Memory\n\n## Session Info\n\nActive.",
  suspended_at: new Date().toISOString(),
  reason: "context_exhaustion",
  session_id: "test-session-abc",
};

// ─── Schema Validation ──────────────────────────────────────────────────────

describe("suspendCheckpointSchema", () => {
  test("validates correct checkpoint data", () => {
    const result = suspendCheckpointSchema.safeParse(VALID_CHECKPOINT);
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional arrays", () => {
    const minimal = {
      phase_id: 1,
      wave_index: 0,
      suspended_at: new Date().toISOString(),
      session_id: "session-1",
    };
    const result = suspendCheckpointSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completed_task_ids).toEqual([]);
      expect(result.data.working_memory_snapshot).toBe("");
    }
  });

  test("rejects missing required fields", () => {
    const result = suspendCheckpointSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects negative wave_index", () => {
    const result = suspendCheckpointSchema.safeParse({
      ...VALID_CHECKPOINT,
      wave_index: -1,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Create Checkpoint ──────────────────────────────────────────────────────

describe("createSuspendCheckpoint", () => {
  test("creates checkpoint file and returns path", async () => {
    const result = await createSuspendCheckpoint(VALID_CHECKPOINT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toContain("suspend-42.json");
      const file = Bun.file(result.data);
      expect(await file.exists()).toBe(true);
    }
  });

  test("creates checkpoints directory if missing", async () => {
    const result = await createSuspendCheckpoint(VALID_CHECKPOINT);
    expect(result.success).toBe(true);
  });

  test("persists correct JSON content", async () => {
    const result = await createSuspendCheckpoint(VALID_CHECKPOINT);
    expect(result.success).toBe(true);
    if (result.success) {
      const content = await Bun.file(result.data).json();
      expect(content.phase_id).toBe(42);
      expect(content.wave_index).toBe(1);
      expect(content.completed_task_ids).toEqual(["42-01-T1", "42-01-T2"]);
      expect(content.session_id).toBe("test-session-abc");
      expect(content.reason).toBe("context_exhaustion");
    }
  });

  test("rejects invalid checkpoint data", async () => {
    const result = await createSuspendCheckpoint({} as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid checkpoint data");
    }
  });
});

// ─── Load Checkpoint ────────────────────────────────────────────────────────

describe("loadSuspendCheckpoint", () => {
  test("loads existing checkpoint", async () => {
    await createSuspendCheckpoint(VALID_CHECKPOINT);
    const result = await loadSuspendCheckpoint(42);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phase_id).toBe(42);
      expect(result.data.wave_index).toBe(1);
      expect(result.data.completed_task_ids).toEqual(["42-01-T1", "42-01-T2"]);
    }
  });

  test("returns error for non-existent phase", async () => {
    const result = await loadSuspendCheckpoint(999);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("No checkpoint found");
    }
  });
});

// ─── Clear Checkpoint ───────────────────────────────────────────────────────

describe("clearSuspendCheckpoint", () => {
  test("deletes existing checkpoint", async () => {
    await createSuspendCheckpoint(VALID_CHECKPOINT);
    expect(await suspendCheckpointExists(42)).toBe(true);

    const result = await clearSuspendCheckpoint(42);
    expect(result.success).toBe(true);
    expect(await suspendCheckpointExists(42)).toBe(false);
  });

  test("succeeds even if checkpoint does not exist", async () => {
    const result = await clearSuspendCheckpoint(999);
    expect(result.success).toBe(true);
  });
});

// ─── Exists Check ───────────────────────────────────────────────────────────

describe("suspendCheckpointExists", () => {
  test("returns true for existing checkpoint", async () => {
    await createSuspendCheckpoint(VALID_CHECKPOINT);
    expect(await suspendCheckpointExists(42)).toBe(true);
  });

  test("returns false for non-existent checkpoint", async () => {
    expect(await suspendCheckpointExists(999)).toBe(false);
  });
});

// ─── Round-Trip ─────────────────────────────────────────────────────────────

describe("round-trip", () => {
  test("create then load preserves all data", async () => {
    const input = {
      ...VALID_CHECKPOINT,
      wave_index: 3,
      completed_task_ids: ["42-01-T1", "42-01-T2", "42-01-T3"],
    };

    await createSuspendCheckpoint(input);
    const loaded = await loadSuspendCheckpoint(42);

    expect(loaded.success).toBe(true);
    if (loaded.success) {
      expect(loaded.data.wave_index).toBe(3);
      expect(loaded.data.completed_task_ids).toEqual([
        "42-01-T1",
        "42-01-T2",
        "42-01-T3",
      ]);
      expect(loaded.data.working_memory_snapshot).toBe(
        input.working_memory_snapshot,
      );
      expect(loaded.data.reason).toBe("context_exhaustion");
    }
  });

  test("create, clear, load returns error", async () => {
    await createSuspendCheckpoint(VALID_CHECKPOINT);
    await clearSuspendCheckpoint(42);
    const result = await loadSuspendCheckpoint(42);
    expect(result.success).toBe(false);
  });
});
