/**
 * Unit tests for state-bridge Pi extension helper.
 *
 * Tests synchronous read operations and async write operations
 * for the typed state machine bridge used by all Pi extensions.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  readStateContext,
  readField,
  readComplexity,
  readStateValue,
  readStateAsMap,
  SETTABLE_FIELDS,
} from "~/hooks/pi-extensions/__helpers/state-bridge";

// ─── Helpers ──────────────────────────────────────────────────

/** Create a temp dir with a valid state.json. */
function createTempState(context: Record<string, any>, value = "executing") {
  const dir = mkdtempSync(join(tmpdir(), "state-bridge-test-"));
  const planningDir = join(dir, ".planning");
  mkdirSync(planningDir, { recursive: true });
  writeFileSync(
    join(planningDir, "state.json"),
    JSON.stringify({ value, context }, null, 2),
  );
  return dir;
}

/** Create a temp dir with a STATE.md file (no state.json). */
function createTempStateMd(content: string) {
  const dir = mkdtempSync(join(tmpdir(), "state-bridge-test-"));
  const planningDir = join(dir, ".planning");
  mkdirSync(planningDir, { recursive: true });
  writeFileSync(join(planningDir, "STATE.md"), content);
  return dir;
}

// ─── readStateContext ─────────────────────────────────────────

describe("readStateContext", () => {
  test("returns null when state.json missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-bridge-test-"));
    const ctx = readStateContext(dir);
    expect(ctx).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns null for invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-bridge-test-"));
    const planningDir = join(dir, ".planning");
    mkdirSync(planningDir, { recursive: true });
    writeFileSync(join(planningDir, "state.json"), "not json {{{");
    const ctx = readStateContext(dir);
    expect(ctx).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns null when state.json has no context field", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-bridge-test-"));
    const planningDir = join(dir, ".planning");
    mkdirSync(planningDir, { recursive: true });
    writeFileSync(
      join(planningDir, "state.json"),
      JSON.stringify({ value: "idle" }),
    );
    const ctx = readStateContext(dir);
    expect(ctx).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── readField ────────────────────────────────────────────────

describe("readField", () => {
  test("returns undefined for missing field", () => {
    const dir = createTempState({ complexity: "SIMPLE" });
    expect(readField(dir, "nonexistent")).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns undefined when no state.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-bridge-test-"));
    expect(readField(dir, "complexity")).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── readComplexity ───────────────────────────────────────────

describe("readComplexity", () => {
  test("returns MODERATE as default when both sources unavailable", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-bridge-test-"));
    expect(readComplexity(dir)).toBe("MODERATE");
    rmSync(dir, { recursive: true, force: true });
  });

  test("STATE.md fallback rejects invalid levels", () => {
    const dir = createTempStateMd("**Task Complexity:** INVALID\n");
    expect(readComplexity(dir)).toBe("MODERATE");
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── readStateValue ───────────────────────────────────────────

describe("readStateValue", () => {
  test("returns idle when state.json missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-bridge-test-"));
    expect(readStateValue(dir)).toBe("idle");
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── readStateAsMap ───────────────────────────────────────────

describe("readStateAsMap", () => {
});

// ─── SETTABLE_FIELDS ──────────────────────────────────────────

describe("SETTABLE_FIELDS", () => {
  test("includes expected fields", () => {
    expect(SETTABLE_FIELDS.has("complexity")).toBe(true);
    expect(SETTABLE_FIELDS.has("current_phase")).toBe(true);
    expect(SETTABLE_FIELDS.has("current_milestone")).toBe(true);
    expect(SETTABLE_FIELDS.has("oversight")).toBe(true);
    expect(SETTABLE_FIELDS.has("branch")).toBe(true);
  });

  test("rejects unknown fields", () => {
    expect(SETTABLE_FIELDS.has("arbitrary_field")).toBe(false);
    expect(SETTABLE_FIELDS.has("")).toBe(false);
  });
});
