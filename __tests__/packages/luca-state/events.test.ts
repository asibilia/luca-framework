import { describe, test, expect } from "bun:test";
import {
  buildTransitionRecord,
  extractContextSummary,
  isSignificantTransition,
  describeTransition,
} from "../../../packages/luca-framework/src/state/events";
import {
  transitionRecordSchema,
  initializeContext,
} from "../../../packages/luca-framework/src/state/types";
import type { WorkflowContext } from "../../../packages/luca-framework/src/state/types";

/**
 * Helper to create a test context with sensible defaults.
 */
function createTestContext(
  overrides: Partial<WorkflowContext> = {},
): WorkflowContext {
  return initializeContext({
    session_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    ticket_id: "PROJ-42",
    complexity: "COMPLEX",
    oversight: "milestone",
    ...overrides,
  });
}

// ─── buildTransitionRecord ──────────────────────────────────────────────────

describe("buildTransitionRecord", () => {
  test("returns a valid TransitionRecord", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      { ticket_id: "PROJ-42" },
      context,
    );

    // Should pass Zod validation
    const result = transitionRecordSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  test("includes correct state fields", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      {},
      context,
    );

    expect(record.previous_state).toBe("idle");
    expect(record.current_state).toBe("preflight");
    expect(record.event_type).toBe("START");
  });

  test("includes event data in record", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      { ticket_id: "PROJ-42", config_path: "/path" },
      context,
    );

    expect(record.event_data.ticket_id).toBe("PROJ-42");
    expect(record.event_data.config_path).toBe("/path");
  });

  test("includes minimal context summary, not full context", () => {
    const context = createTestContext({
      gates: { confirm_plan: true, skip_verification: false },
      complexity_matrix: { COMPLEX: { discussion: "run" } },
    });
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      {},
      context,
    );

    // Should include summary fields
    expect(record.context.session_id).toBe(context.session_id);
    expect(record.context.complexity).toBe("COMPLEX");
    expect(record.context.oversight).toBe("milestone");

    // Should NOT include large objects
    expect(record.context.gates).toBeUndefined();
    expect(record.context.complexity_matrix).toBeUndefined();
    expect(record.context.autopilot_config).toBeUndefined();
  });

  test("includes session_id from context", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      {},
      context,
    );

    expect(record.session_id).toBe(context.session_id);
  });

  test("includes timestamp", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      {},
      context,
    );

    expect(record.timestamp).toBeDefined();
    expect(typeof record.timestamp).toBe("string");
    // Should be a valid ISO string
    expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
  });

  test("includes actions_executed when provided", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      {},
      context,
      ["initSession", "recordTransition"],
    );

    expect(record.actions_executed).toEqual([
      "initSession",
      "recordTransition",
    ]);
  });

  test("defaults actions_executed to empty array", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      {},
      context,
    );

    expect(record.actions_executed).toEqual([]);
  });
});

// ─── extractContextSummary ──────────────────────────────────────────────────

describe("extractContextSummary", () => {
  test("returns expected keys", () => {
    const context = createTestContext();
    const summary = extractContextSummary(context);

    expect(summary).toHaveProperty("session_id");
    expect(summary).toHaveProperty("ticket_id");
    expect(summary).toHaveProperty("complexity");
    expect(summary).toHaveProperty("oversight");
    expect(summary).toHaveProperty("current_phase");
    expect(summary).toHaveProperty("current_milestone");
    expect(summary).toHaveProperty("verification_attempts");
    expect(summary).toHaveProperty("phases_completed");
    expect(summary).toHaveProperty("last_error");
  });

  test("does NOT include gates", () => {
    const context = createTestContext({
      gates: { confirm_plan: true },
    });
    const summary = extractContextSummary(context);
    expect(
      (summary as unknown as Record<string, unknown>).gates,
    ).toBeUndefined();
  });

  test("does NOT include complexity_matrix", () => {
    const context = createTestContext({
      complexity_matrix: { COMPLEX: { discussion: "run" } },
    });
    const summary = extractContextSummary(context);
    expect(
      (summary as unknown as Record<string, unknown>).complexity_matrix,
    ).toBeUndefined();
  });

  test("does NOT include autopilot_config", () => {
    const context = createTestContext({
      autopilot_config: { oversight: "full-auto" },
    });
    const summary = extractContextSummary(context);
    expect(
      (summary as unknown as Record<string, unknown>).autopilot_config,
    ).toBeUndefined();
  });

  test("phases_completed reflects phase_results length", () => {
    const context = createTestContext();
    // Initially no phases completed
    const summary1 = extractContextSummary(context);
    expect(summary1.phases_completed).toBe(0);
  });
});

// ─── isSignificantTransition ────────────────────────────────────────────────

describe("isSignificantTransition", () => {
  test("returns true when states differ", () => {
    expect(isSignificantTransition("idle", "preflight")).toBe(true);
  });

  test("returns false when states are the same", () => {
    expect(isSignificantTransition("idle", "idle")).toBe(false);
  });

  test("returns true for executing to verifying", () => {
    expect(isSignificantTransition("executing", "verifying")).toBe(true);
  });

  test("returns false for same complex state name", () => {
    expect(isSignificantTransition("wave_executing", "wave_executing")).toBe(
      false,
    );
  });
});

// ─── describeTransition ─────────────────────────────────────────────────────

describe("describeTransition", () => {
  test("formats transition with truncated session_id", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "idle",
      "preflight",
      "START",
      {},
      context,
    );

    const desc = describeTransition(record);
    const expectedPrefix = `[${context.session_id.slice(0, 8)}]`;
    expect(desc).toContain(expectedPrefix);
    expect(desc).toContain("idle -> preflight");
    expect(desc).toContain("(START)");
  });

  test("includes event type in parentheses", () => {
    const context = createTestContext();
    const record = buildTransitionRecord(
      "routing",
      "discussing",
      "ROUTE_COMPLETE",
      { complexity: "COMPLEX" },
      context,
    );

    const desc = describeTransition(record);
    expect(desc).toContain("(ROUTE_COMPLETE)");
  });
});

// ─── transitionRecordSchema ─────────────────────────────────────────────────

describe("transitionRecordSchema", () => {
  test("valid record passes validation", () => {
    const result = transitionRecordSchema.safeParse({
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
      event_data: { ticket_id: "PROJ-1" },
      actions_executed: ["initSession"],
      context: { session_id: "abc", complexity: "TRIVIAL" },
      timestamp: new Date().toISOString(),
      session_id: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  test("missing required fields fails validation", () => {
    const result = transitionRecordSchema.safeParse({
      // Missing previous_state, current_state, event_type
    });
    expect(result.success).toBe(false);
  });

  test("defaults are applied for optional fields", () => {
    const result = transitionRecordSchema.safeParse({
      previous_state: "idle",
      current_state: "preflight",
      event_type: "START",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event_data).toEqual({});
      expect(result.data.actions_executed).toEqual([]);
      expect(result.data.context).toEqual({});
      expect(result.data.timestamp).toBe("");
      expect(result.data.session_id).toBe("");
    }
  });
});
