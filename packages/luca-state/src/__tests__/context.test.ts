import { describe, test, expect } from "bun:test";
import {
  workflowContextSchema,
  workflowEventSchema,
  phaseResultSchema,
  harnessResultRefSchema,
  budgetStateRefSchema,
  oversightLevelSchema,
  initializeContext,
} from "../types";

// ─── workflowContextSchema ──────────────────────────────────────────────────

describe("workflowContextSchema", () => {
  test("parses a valid full context object", () => {
    const input = {
      session_id: "abc-123",
      ticket_id: "PROJ-42",
      github_issue: 99,
      branch: "feat/test",
      base_branch: "main",
      complexity: "MODERATE",
      oversight: "full-auto",
      gates: { confirm_plan: true },
      workflow_config: { code_review: true },
      complexity_matrix: {},
      autopilot_config: { max_phases_per_session: 3 },
      phase_results: [],
      verification_attempts: 0,
      max_verification_attempts: 3,
      intuition_flags: ["RISK"],
      memory_tags: ["pattern-1"],
      started_at: "2024-01-01T00:00:00Z",
    };

    const result = workflowContextSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.session_id).toBe("abc-123");
      expect(result.data.complexity).toBe("MODERATE");
      expect(result.data.oversight).toBe("full-auto");
    }
  });

  test("applies default values for optional fields", () => {
    const minimal = {
      session_id: "test-session",
    };

    const result = workflowContextSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.base_branch).toBe("main");
      expect(result.data.complexity).toBe("TRIVIAL");
      expect(result.data.oversight).toBe("milestone");
      expect(result.data.gates).toEqual({});
      expect(result.data.workflow_config).toEqual({});
      expect(result.data.phase_results).toEqual([]);
      expect(result.data.verification_attempts).toBe(0);
      expect(result.data.max_verification_attempts).toBe(3);
      expect(result.data.intuition_flags).toEqual([]);
      expect(result.data.memory_tags).toEqual([]);
      expect(result.data.current_plan_ids).toEqual([]);
      expect(result.data.current_wave_count).toBe(0);
    }
  });

  test("rejects invalid complexity value", () => {
    const invalid = {
      session_id: "test",
      complexity: "INVALID",
    };

    const result = workflowContextSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid oversight value", () => {
    const invalid = {
      session_id: "test",
      oversight: "INVALID",
    };

    const result = workflowContextSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("optional fields can be omitted", () => {
    const minimal = { session_id: "test" };
    const result = workflowContextSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticket_id).toBeUndefined();
      expect(result.data.github_issue).toBeUndefined();
      expect(result.data.branch).toBeUndefined();
      expect(result.data.harness_result).toBeUndefined();
      expect(result.data.iteration_budget).toBeUndefined();
      expect(result.data.skip_reason).toBeUndefined();
      expect(result.data.last_error).toBeUndefined();
    }
  });
});

// ─── workflowEventSchema ────────────────────────────────────────────────────

describe("workflowEventSchema", () => {
  const validEvents = [
    { type: "START" },
    { type: "START", ticket_id: "PROJ-1", config_path: "/path" },
    { type: "PREFLIGHT_COMPLETE", intuition_flags: ["RISK"] },
    { type: "ROUTE_COMPLETE", complexity: "COMPLEX" },
    { type: "DISCUSS_COMPLETE", summary: "Done" },
    { type: "PLAN_COMPLETE", plan_id: "34-01" },
    { type: "PHASE_START", phase_id: 1 },
    { type: "PHASE_COMPLETE", phase_id: 1, summary: "Done" },
    { type: "PHASE_FAILED", phase_id: 1, error: "Build failed" },
    { type: "HARNESS_COMPLETE", status: "passed", total_errors: 0 },
    { type: "VERIFY_PASSED" },
    { type: "VERIFY_FAILED", gaps: ["gap1", "gap2"] },
    { type: "VERIFY_HALTED", reason: "Human review" },
    { type: "LEARN_COMPLETE", learnings: ["pattern-1"] },
    { type: "COMMIT_COMPLETE", commit_hash: "abc123" },
    { type: "SKIP", reason: "Not needed" },
    { type: "RESUME" },
    { type: "ABORT", reason: "User stopped" },
    { type: "RESET" },
  ];

  test.each(validEvents)("parses valid event: %j", (event) => {
    const result = workflowEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  test("rejects invalid event type", () => {
    const invalid = { type: "UNKNOWN_EVENT" };
    const result = workflowEventSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects PHASE_START without required phase_id", () => {
    const invalid = { type: "PHASE_START" };
    const result = workflowEventSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects ROUTE_COMPLETE with invalid complexity", () => {
    const invalid = { type: "ROUTE_COMPLETE", complexity: "INVALID" };
    const result = workflowEventSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("applies default values for optional event fields", () => {
    const event = { type: "SKIP" };
    const result = workflowEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("SKIP");
      // Zod v4 applies defaults
      expect((result.data as any).reason).toBeDefined();
    }
  });
});

// ─── initializeContext ──────────────────────────────────────────────────────

describe("initializeContext", () => {
  test("returns valid context with generated session_id when no input", () => {
    const ctx = initializeContext();
    expect(ctx.session_id).toBeDefined();
    expect(ctx.session_id.length).toBeGreaterThan(0);
    // UUID format
    expect(ctx.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("merges partial input correctly", () => {
    const ctx = initializeContext({
      ticket_id: "TEST-1",
      complexity: "COMPLEX",
    });
    expect(ctx.ticket_id).toBe("TEST-1");
    expect(ctx.complexity).toBe("COMPLEX");
    expect(ctx.base_branch).toBe("main");
    expect(ctx.oversight).toBe("milestone");
  });

  test("populates gates from config object", () => {
    const ctx = initializeContext({
      config: {
        gates: { confirm_plan: true, require_tests: false },
      },
    });
    expect(ctx.gates).toEqual({
      confirm_plan: true,
      require_tests: false,
    });
  });

  test("populates workflow_config from config object", () => {
    const ctx = initializeContext({
      config: {
        workflow: { code_review: true, uat_required: false },
      },
    });
    expect(ctx.workflow_config).toEqual({
      code_review: true,
      uat_required: false,
    });
  });

  test("populates complexity_matrix from config object", () => {
    const ctx = initializeContext({
      config: {
        complexity: {
          matrix: { TRIVIAL: { research: "skip" } },
        },
      },
    });
    expect(ctx.complexity_matrix).toEqual({
      TRIVIAL: { research: "skip" },
    });
  });

  test("populates autopilot_config from config object", () => {
    const ctx = initializeContext({
      config: {
        autopilot: { max_phases_per_session: 5, oversight: "full-auto" },
      },
    });
    expect(ctx.autopilot_config).toEqual({
      max_phases_per_session: 5,
      oversight: "full-auto",
    });
    expect(ctx.oversight).toBe("full-auto");
  });

  test("started_at is set to current time", () => {
    const before = new Date().toISOString();
    const ctx = initializeContext();
    const after = new Date().toISOString();
    expect(ctx.started_at).toBeDefined();
    expect(ctx.started_at! >= before).toBe(true);
    expect(ctx.started_at! <= after).toBe(true);
  });
});

// ─── phaseResultSchema ──────────────────────────────────────────────────────

describe("phaseResultSchema", () => {
  test("parses valid phase result", () => {
    const input = {
      phase_id: 1,
      status: "passed",
      summary: "All good",
      errors: [],
      duration_ms: 1500,
      timestamp: "2024-01-01T00:00:00Z",
    };
    const result = phaseResultSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional fields", () => {
    const input = { phase_id: 1, status: "failed" };
    const result = phaseResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe("");
      expect(result.data.errors).toEqual([]);
      expect(result.data.duration_ms).toBe(0);
      expect(result.data.timestamp).toBe("");
    }
  });

  test("rejects invalid status", () => {
    const input = { phase_id: 1, status: "unknown" };
    const result = phaseResultSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ─── Supporting Schemas ─────────────────────────────────────────────────────

describe("harnessResultRefSchema", () => {
  test("parses valid harness result", () => {
    const input = {
      status: "passed",
      total_errors: 0,
      total_warnings: 2,
      duration_ms: 3000,
      timestamp: "2024-01-01T00:00:00Z",
    };
    const result = harnessResultRefSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("rejects negative total_errors", () => {
    const input = {
      status: "passed",
      total_errors: -1,
      total_warnings: 0,
      duration_ms: 100,
      timestamp: "2024-01-01T00:00:00Z",
    };
    const result = harnessResultRefSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("budgetStateRefSchema", () => {
  test("parses valid budget state", () => {
    const input = {
      max_iterations: 3,
      current_iteration: 1,
      soft_stop_percent: 80,
      status: "under_budget",
    };
    const result = budgetStateRefSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("rejects max_iterations of 0", () => {
    const input = {
      max_iterations: 0,
      current_iteration: 0,
      status: "under_budget",
    };
    const result = budgetStateRefSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("applies default soft_stop_percent", () => {
    const input = {
      max_iterations: 3,
      current_iteration: 0,
      status: "under_budget",
    };
    const result = budgetStateRefSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.soft_stop_percent).toBe(80);
    }
  });
});

describe("oversightLevelSchema", () => {
  test("accepts valid oversight levels", () => {
    const levels = ["full-auto", "milestone", "phase", "plan"];
    for (const level of levels) {
      const result = oversightLevelSchema.safeParse(level);
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid oversight level", () => {
    const result = oversightLevelSchema.safeParse("invalid");
    expect(result.success).toBe(false);
  });
});
