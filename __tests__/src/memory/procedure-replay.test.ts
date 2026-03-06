import { describe, test, expect } from "bun:test";
import {
  findReplayableProcedures,
  adaptProcedureToContext,
  replayProcedure,
  ProcedureReplayContextSchema,
  ProcedureReplayResultSchema,
} from "../../../src/memory/__helpers/procedure-replay";
import type { ProcedureEntry } from "~/memory/__schemas/memory.schemas";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function buildEntry(overrides: Partial<ProcedureEntry> = {}): ProcedureEntry {
  return {
    id: overrides.id ?? "proc-test",
    title: overrides.title ?? "Test Procedure",
    trigger: overrides.trigger ?? "When testing",
    steps: overrides.steps ?? [{ order: 1, action: "Test step" }],
    tags: overrides.tags ?? [],
    source_agent: overrides.source_agent ?? "general",
    source_phase: overrides.source_phase,
    execution_count: overrides.execution_count ?? 0,
    success_count: overrides.success_count ?? 0,
    success_rate: overrides.success_rate ?? 0,
    added_at: overrides.added_at ?? "2026-02-14T00:00:00Z",
    last_executed_at: overrides.last_executed_at,
    token_estimate: overrides.token_estimate ?? 0,
    status: overrides.status ?? "active",
    retirement_reason: overrides.retirement_reason,
  };
}

// ─── ProcedureReplayContextSchema ───────────────────────────────────────────

describe("ProcedureReplayContextSchema", () => {
  test("applies defaults for empty object", () => {
    const result = ProcedureReplayContextSchema.parse({});
    expect(result.task_description).toBe("");
    expect(result.task_tags).toEqual([]);
    expect(result.relevant_files).toEqual([]);
    expect(result.overrides).toEqual({});
  });

  test("accepts valid context", () => {
    const result = ProcedureReplayContextSchema.parse({
      task_description: "Add API endpoint",
      task_tags: ["api"],
      relevant_files: ["src/routes.ts"],
      overrides: { MODULE: "users" },
    });
    expect(result.task_description).toBe("Add API endpoint");
    expect(result.task_tags).toEqual(["api"]);
  });
});

// ─── findReplayableProcedures ───────────────────────────────────────────────

describe("findReplayableProcedures", () => {
  test("returns procedures sorted by relevance score descending", () => {
    const highMatch = buildEntry({
      id: "proc-high",
      tags: ["api", "coding"],
      trigger: "When adding new API endpoint",
      success_rate: 1.0,
    });
    const lowMatch = buildEntry({
      id: "proc-low",
      tags: [],
      trigger: "deploying infrastructure servers",
      success_rate: 0.1,
    });

    const result = findReplayableProcedures("Add new API endpoint for users", [
      lowMatch,
      highMatch,
    ]);

    // High match should come first due to trigger + tag overlap
    if (result.length >= 2) {
      expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
    }
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.entry.id).toBe("proc-high");
  });

  test("excludes retired procedures", () => {
    const active = buildEntry({
      id: "proc-active",
      status: "active",
      tags: ["coding"],
      trigger: "When coding feature",
      success_rate: 0.8,
    });
    const retired = buildEntry({
      id: "proc-retired",
      status: "retired",
      tags: ["coding"],
      trigger: "When coding feature",
      success_rate: 1.0,
    });

    const result = findReplayableProcedures("coding feature task", [
      active,
      retired,
    ]);

    const ids = result.map((r) => r.entry.id);
    expect(ids).not.toContain("proc-retired");
  });

  test("respects limit parameter", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      buildEntry({
        id: `proc-${i}`,
        tags: ["coding"],
        trigger: "When coding tasks",
        success_rate: 0.8,
      }),
    );

    const result = findReplayableProcedures("coding tasks", entries, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test("empty procedures returns empty array", () => {
    const result = findReplayableProcedures("some task", []);
    expect(result).toEqual([]);
  });

  test("filters out procedures below minimum relevance threshold", () => {
    const irrelevant = buildEntry({
      id: "proc-irrelevant",
      tags: ["infrastructure", "deployment"],
      trigger: "When deploying to production servers",
      success_rate: 0.0,
    });

    const result = findReplayableProcedures(
      "writing unit tests for components",
      [irrelevant],
    );

    expect(result.length).toBe(0);
  });
});

// ─── adaptProcedureToContext ────────────────────────────────────────────────

describe("adaptProcedureToContext", () => {
  test("applies override placeholders to step actions", () => {
    const procedure = buildEntry({
      steps: [
        { order: 1, action: "Create {MODULE_NAME} controller" },
        { order: 2, action: "Add routes for {MODULE_NAME}" },
      ],
    });

    const result = adaptProcedureToContext(procedure, {
      task_description: "Add users module",
      task_tags: [],
      relevant_files: [],
      overrides: { MODULE_NAME: "users" },
    });

    expect(result[0]!.action).toBe("Create users controller");
    expect(result[1]!.action).toBe("Add routes for users");
  });

  test("appends relevant files when step mentions file-related words", () => {
    const procedure = buildEntry({
      steps: [{ order: 1, action: "Edit the target file" }],
    });

    const result = adaptProcedureToContext(procedure, {
      task_description: "",
      task_tags: [],
      relevant_files: ["src/routes.ts", "src/models.ts"],
      overrides: {},
    });

    expect(result[0]!.action).toContain("src/routes.ts");
    expect(result[0]!.action).toContain("src/models.ts");
  });

  test("does not append files when step does not mention file-related words", () => {
    const procedure = buildEntry({
      steps: [{ order: 1, action: "Run the test suite" }],
    });

    const result = adaptProcedureToContext(procedure, {
      task_description: "",
      task_tags: [],
      relevant_files: ["src/routes.ts"],
      overrides: {},
    });

    expect(result[0]!.action).toBe("Run the test suite");
  });

  test("preserves step metadata (order, expected_output, tool)", () => {
    const procedure = buildEntry({
      steps: [
        {
          order: 1,
          action: "Step action",
          expected_output: "output.json",
          tool: "bun",
        },
      ],
    });

    const result = adaptProcedureToContext(procedure, {
      task_description: "",
      task_tags: [],
      relevant_files: [],
      overrides: {},
    });

    expect(result[0]!.order).toBe(1);
    expect(result[0]!.expected_output).toBe("output.json");
    expect(result[0]!.tool).toBe("bun");
  });

  test("does not mutate original steps", () => {
    const originalAction = "Create {MODULE} controller";
    const procedure = buildEntry({
      steps: [{ order: 1, action: originalAction }],
    });

    adaptProcedureToContext(procedure, {
      task_description: "",
      task_tags: [],
      relevant_files: [],
      overrides: { MODULE: "users" },
    });

    expect(procedure.steps[0]!.action).toBe(originalAction);
  });
});

// ─── replayProcedure ────────────────────────────────────────────────────────

describe("replayProcedure", () => {
  test("returns valid ProcedureReplayResult", () => {
    const procedure = buildEntry({
      id: "proc-api",
      title: "API Endpoint Setup",
      tags: ["api"],
      trigger: "When adding new API endpoint",
      success_rate: 0.9,
      steps: [
        { order: 1, action: "Create route handler" },
        { order: 2, action: "Add validation schema" },
      ],
    });

    const result = replayProcedure(procedure, {
      task_description: "Add new API endpoint for users",
      task_tags: ["api", "users"],
      relevant_files: [],
      overrides: {},
    });

    const parseResult = ProcedureReplayResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
    expect(result.procedure_id).toBe("proc-api");
    expect(result.procedure_title).toBe("API Endpoint Setup");
    expect(result.adapted_steps).toHaveLength(2);
  });

  test("relevance_score is between 0 and 1", () => {
    const procedure = buildEntry({
      tags: ["api", "coding"],
      trigger: "When adding new API endpoint",
      success_rate: 1.0,
    });

    const result = replayProcedure(procedure, {
      task_description: "Add new API endpoint",
      task_tags: ["api", "coding"],
      relevant_files: [],
      overrides: {},
    });

    expect(result.relevance_score).toBeGreaterThanOrEqual(0);
    expect(result.relevance_score).toBeLessThanOrEqual(1);
  });

  test("was_adapted is true when overrides are provided", () => {
    const procedure = buildEntry({
      steps: [{ order: 1, action: "Create {MODULE} controller" }],
    });

    const result = replayProcedure(procedure, {
      task_description: "test",
      task_tags: [],
      relevant_files: [],
      overrides: { MODULE: "users" },
    });

    expect(result.was_adapted).toBe(true);
  });

  test("was_adapted is true when relevant_files are provided", () => {
    const procedure = buildEntry({
      steps: [{ order: 1, action: "Edit the file" }],
    });

    const result = replayProcedure(procedure, {
      task_description: "test",
      task_tags: [],
      relevant_files: ["src/index.ts"],
      overrides: {},
    });

    expect(result.was_adapted).toBe(true);
  });

  test("was_adapted is false when no overrides or files", () => {
    const procedure = buildEntry();

    const result = replayProcedure(procedure, {
      task_description: "test",
      task_tags: [],
      relevant_files: [],
      overrides: {},
    });

    expect(result.was_adapted).toBe(false);
  });

  test("handles invalid context gracefully via safeParse", () => {
    const procedure = buildEntry();

    // Pass bad context - should fall back to defaults
    const result = replayProcedure(procedure, { task_description: 123 } as any);

    expect(result.procedure_id).toBe("proc-test");
    expect(result.adapted_steps).toHaveLength(1);
  });
});
