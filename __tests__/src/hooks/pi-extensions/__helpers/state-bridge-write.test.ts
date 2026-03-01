/**
 * Unit tests for writeField and writeComplexity in the state-bridge helper.
 *
 * Tests validation logic (field allowlisting, field-specific validators)
 * and async write path (state.json mutation, previous value capture).
 *
 * The write functions depend on `stateExists()` from luca-framework/state
 * which checks `.planning/state.json` relative to cwd. We mock the
 * framework module so that `stateExists` returns true for write-path
 * tests, allowing us to exercise the full code path with temp dirs.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── Mock Setup ──────────────────────────────────────────────────────────────
// We need to mock `@alecsibilia/luca-framework/state` BEFORE importing the
// module under test. The mock provides a controllable `stateExists` along
// with stub implementations of `loadPersistedActor` and `generateSnapshot`.

let mockStateExistsReturn = true;

mock.module("@alecsibilia/luca-framework/state", () => ({
  COMPLEXITY_LEVELS: ["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"],
  SETTABLE_FIELDS: [
    "current_milestone",
    "current_phase",
    "github_issue",
    "branch",
    "base_branch",
    "ticket_id",
    "oversight",
    "complexity",
    "memory_tags",
    "intuition_flags",
  ],
  STATE_FILE_PATH: ".planning/state.json",
  stateExists: async () => mockStateExistsReturn,
  loadPersistedActor: async () => ({
    success: true,
    data: {
      getSnapshot: () => ({
        value: "executing",
        context: { complexity: "MODERATE" },
      }),
    },
  }),
  generateSnapshot: () => "# STATE\n**Status:** executing\n",
  getAllowedEvents: () => [],
}));

// Import AFTER mock.module so the mock is active
import {
  writeField,
  writeComplexity,
} from "~/hooks/pi-extensions/__helpers/state-bridge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a temp dir with a valid .planning/state.json. */
function createTempState(
  context: Record<string, any>,
  value = "executing",
): string {
  const dir = mkdtempSync(join(tmpdir(), "state-bridge-write-test-"));
  const planningDir = join(dir, ".planning");
  mkdirSync(planningDir, { recursive: true });
  writeFileSync(
    join(planningDir, "state.json"),
    JSON.stringify({ value, context }, null, 2),
  );
  return dir;
}

/** Read and parse state.json from a temp dir. */
function readTempState(dir: string): any {
  const raw = readFileSync(join(dir, ".planning", "state.json"), "utf-8");
  return JSON.parse(raw);
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe("writeField", () => {
  let tempDir: string;

  beforeEach(() => {
    mockStateExistsReturn = true;
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ── Validation (no file system needed) ──────────────────────

  test("rejects a non-settable field", async () => {
    tempDir = createTempState({ complexity: "MODERATE" });
    const result = await writeField(tempDir, "not_a_real_field", "value");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not settable");
    expect(result.error).toContain("not_a_real_field");
  });

  test("validates complexity field rejects invalid value", async () => {
    tempDir = createTempState({ complexity: "MODERATE" });
    const result = await writeField(tempDir, "complexity", "INVALID");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid complexity");
    expect(result.error).toContain("INVALID");
  });

  test("validates complexity field rejects non-string value", async () => {
    tempDir = createTempState({ complexity: "MODERATE" });
    const result = await writeField(tempDir, "complexity", 42);
    expect(result.success).toBe(false);
    expect(result.error).toContain("complexity must be a string");
  });

  test("validates oversight field rejects invalid value", async () => {
    tempDir = createTempState({ oversight: "flagged" });
    const result = await writeField(tempDir, "oversight", "INVALID_MODE");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid oversight");
    expect(result.error).toContain("INVALID_MODE");
  });

  test("validates oversight field rejects non-string value", async () => {
    tempDir = createTempState({ oversight: "flagged" });
    const result = await writeField(tempDir, "oversight", 123);
    expect(result.success).toBe(false);
    expect(result.error).toContain("oversight must be a string");
  });

  test("validates branch length rejects > 200 chars", async () => {
    tempDir = createTempState({ branch: "main" });
    const longBranch = "a".repeat(201);
    const result = await writeField(tempDir, "branch", longBranch);
    expect(result.success).toBe(false);
    expect(result.error).toContain("exceeds 200 characters");
  });

  test("validates base_branch length rejects > 200 chars", async () => {
    tempDir = createTempState({ base_branch: "main" });
    const longBranch = "b".repeat(201);
    const result = await writeField(tempDir, "base_branch", longBranch);
    expect(result.success).toBe(false);
    expect(result.error).toContain("exceeds 200 characters");
  });

  test("validates ticket_id length rejects > 100 chars", async () => {
    tempDir = createTempState({ ticket_id: "PROJ-1" });
    const longTicket = "T".repeat(101);
    const result = await writeField(tempDir, "ticket_id", longTicket);
    expect(result.success).toBe(false);
    expect(result.error).toContain("exceeds 100 characters");
  });

  test("validates current_phase rejects non-string/non-number", async () => {
    tempDir = createTempState({ current_phase: "1" });
    const result = await writeField(tempDir, "current_phase", { bad: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain("current_phase must be a string or number");
  });

  test("validates github_issue rejects non-string/non-number", async () => {
    tempDir = createTempState({ github_issue: "42" });
    const result = await writeField(tempDir, "github_issue", [1, 2, 3]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("github_issue must be a string or number");
  });

  // ── stateExists gate ────────────────────────────────────────

  test("returns error when state.json is missing (stateExists false)", async () => {
    mockStateExistsReturn = false;
    tempDir = mkdtempSync(join(tmpdir(), "state-bridge-write-test-"));
    const result = await writeField(tempDir, "complexity", "MODERATE");
    expect(result.success).toBe(false);
    expect(result.error).toContain("state.json not found");
  });

  // ── Full write path ─────────────────────────────────────────

  test("writes a settable field and updates state.json", async () => {
    tempDir = createTempState({ complexity: "SIMPLE", branch: "main" });
    const result = await writeField(tempDir, "complexity", "COMPLEX");
    expect(result.success).toBe(true);

    const updated = readTempState(tempDir);
    expect(updated.context.complexity).toBe("COMPLEX");
    expect(updated.context.last_transition_at).toBeDefined();
  });

  test("returns previous value on success", async () => {
    tempDir = createTempState({ complexity: "SIMPLE" });
    const result = await writeField(tempDir, "complexity", "MODERATE");
    expect(result.success).toBe(true);
    expect(result.previous).toBe("SIMPLE");
  });

  test("returns undefined as previous when field was not set", async () => {
    tempDir = createTempState({});
    const result = await writeField(tempDir, "branch", "feat/test");
    expect(result.success).toBe(true);
    expect(result.previous).toBeUndefined();
  });

  test("writes branch field successfully", async () => {
    tempDir = createTempState({ branch: "main" });
    const result = await writeField(tempDir, "branch", "feat/new-feature");
    expect(result.success).toBe(true);

    const updated = readTempState(tempDir);
    expect(updated.context.branch).toBe("feat/new-feature");
  });

  test("writes oversight field with valid value", async () => {
    tempDir = createTempState({ oversight: "flagged" });
    const result = await writeField(tempDir, "oversight", "full-auto");
    expect(result.success).toBe(true);

    const updated = readTempState(tempDir);
    expect(updated.context.oversight).toBe("full-auto");
  });

  test("creates context object if missing in state.json", async () => {
    // State.json without a context field
    tempDir = mkdtempSync(join(tmpdir(), "state-bridge-write-test-"));
    const planningDir = join(tempDir, ".planning");
    mkdirSync(planningDir, { recursive: true });
    writeFileSync(
      join(planningDir, "state.json"),
      JSON.stringify({ value: "idle" }, null, 2),
    );

    const result = await writeField(tempDir, "complexity", "TRIVIAL");
    expect(result.success).toBe(true);

    const updated = readTempState(tempDir);
    expect(updated.context).toBeDefined();
    expect(updated.context.complexity).toBe("TRIVIAL");
  });

  test("preserves existing context fields when writing a new one", async () => {
    tempDir = createTempState({
      complexity: "MODERATE",
      branch: "main",
      ticket_id: "PROJ-42",
    });

    const result = await writeField(tempDir, "branch", "feat/update");
    expect(result.success).toBe(true);

    const updated = readTempState(tempDir);
    expect(updated.context.complexity).toBe("MODERATE");
    expect(updated.context.branch).toBe("feat/update");
    expect(updated.context.ticket_id).toBe("PROJ-42");
  });

  test("accepts fields without specific validators (memory_tags)", async () => {
    tempDir = createTempState({});
    const result = await writeField(tempDir, "memory_tags", ["tag1", "tag2"]);
    expect(result.success).toBe(true);

    const updated = readTempState(tempDir);
    expect(updated.context.memory_tags).toEqual(["tag1", "tag2"]);
  });

  test("returns error for invalid JSON in state.json", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "state-bridge-write-test-"));
    const planningDir = join(tempDir, ".planning");
    mkdirSync(planningDir, { recursive: true });
    writeFileSync(join(planningDir, "state.json"), "not valid json {{{");

    const result = await writeField(tempDir, "complexity", "MODERATE");
    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid JSON");
  });
});

// ─── writeComplexity ──────────────────────────────────────────────────────────

describe("writeComplexity", () => {
  let tempDir: string;

  beforeEach(() => {
    mockStateExistsReturn = true;
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("normalizes case (lowercase to UPPERCASE)", async () => {
    tempDir = createTempState({ complexity: "SIMPLE" });
    const result = await writeComplexity(tempDir, "moderate");
    expect(result.success).toBe(true);

    const updated = readTempState(tempDir);
    expect(updated.context.complexity).toBe("MODERATE");
  });

  test("normalizes mixed case", async () => {
    tempDir = createTempState({ complexity: "SIMPLE" });
    const result = await writeComplexity(tempDir, "Complex");
    expect(result.success).toBe(true);

    const updated = readTempState(tempDir);
    expect(updated.context.complexity).toBe("COMPLEX");
  });

  test("rejects invalid complexity level", async () => {
    tempDir = createTempState({ complexity: "MODERATE" });
    const result = await writeComplexity(tempDir, "INVALID");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid complexity");
    expect(result.error).toContain("INVALID");
  });

  test("rejects empty string", async () => {
    tempDir = createTempState({ complexity: "MODERATE" });
    const result = await writeComplexity(tempDir, "");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid complexity");
  });

  test("accepts all valid complexity levels", async () => {
    const levels = ["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"];
    for (const level of levels) {
      tempDir = createTempState({ complexity: "MODERATE" });
      const result = await writeComplexity(tempDir, level);
      expect(result.success).toBe(true);

      const updated = readTempState(tempDir);
      expect(updated.context.complexity).toBe(level);
      rmSync(tempDir, { recursive: true, force: true });
    }
    // Prevent afterEach from trying to clean up already-removed dir
    tempDir = "";
  });

  test("returns previous complexity value", async () => {
    tempDir = createTempState({ complexity: "TRIVIAL" });
    const result = await writeComplexity(tempDir, "CRITICAL");
    expect(result.success).toBe(true);
    expect(result.previous).toBe("TRIVIAL");
  });
});
