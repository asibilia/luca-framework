import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { workflowMachine, getAllowedEvents } from "../../../packages/luca-framework/src/state/machine";
import { DEFAULT_COMPLEXITY_MATRIX } from "../../../packages/luca-framework/src/state/defaults";

/**
 * Helper to create and start a workflow machine actor with context overrides.
 */
function createWorkflow(overrides: Record<string, any> = {}) {
  const actor = createActor(workflowMachine, {
    input: {
      complexity_matrix: DEFAULT_COMPLEXITY_MATRIX,
      ...overrides,
    },
  });
  actor.start();
  return actor;
}

/**
 * Helper to quickly advance the actor through a sequence of events.
 */
function sendEvents(
  actor: ReturnType<typeof createWorkflow>,
  events: Array<Record<string, any>>,
) {
  for (const event of events) {
    actor.send(event as any);
  }
}

// ─── Happy Path ──────────────────────────────────────────────────────────────

describe("happy path", () => {
  test("full lifecycle idle -> complete for TRIVIAL complexity", () => {
    const actor = createWorkflow();

    expect(actor.getSnapshot().value).toBe("idle");

    actor.send({ type: "START", ticket_id: "TEST-1" });
    expect(actor.getSnapshot().value).toBe("preflight");

    actor.send({ type: "PREFLIGHT_COMPLETE", intuition_flags: ["risk"] });
    expect(actor.getSnapshot().value).toBe("routing");

    // TRIVIAL: discussion=skip, so should go to planning
    actor.send({ type: "ROUTE_COMPLETE", complexity: "TRIVIAL" });
    expect(actor.getSnapshot().value).toBe("planning");

    actor.send({ type: "PLAN_COMPLETE", plan_id: "34-01" });
    expect(actor.getSnapshot().value).toBe("executing");

    actor.send({ type: "PHASE_COMPLETE", phase_id: 34, summary: "Done" });
    expect(actor.getSnapshot().value).toBe("verifying");

    // TRIVIAL: learningCapture=skip, so should go to committing
    actor.send({ type: "VERIFY_PASSED" });
    expect(actor.getSnapshot().value).toBe("committing");

    // Default max_phases_per_session=1 and we have 1 result, so complete
    actor.send({ type: "COMMIT_COMPLETE", commit_hash: "abc123" });
    expect(actor.getSnapshot().value).toBe("complete");
  });

  test("context tracks ticket_id after START", () => {
    const actor = createWorkflow();
    actor.send({ type: "START", ticket_id: "PROJ-42" });
    expect(actor.getSnapshot().context.ticket_id).toBe("PROJ-42");
  });

  test("context tracks intuition_flags after PREFLIGHT_COMPLETE", () => {
    const actor = createWorkflow();
    actor.send({ type: "START" });
    actor.send({
      type: "PREFLIGHT_COMPLETE",
      intuition_flags: ["RISK", "CAUTION"],
    });
    expect(actor.getSnapshot().context.intuition_flags).toEqual([
      "RISK",
      "CAUTION",
    ]);
  });

  test("context tracks complexity after ROUTE_COMPLETE", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "COMPLEX" },
    ]);
    expect(actor.getSnapshot().context.complexity).toBe("COMPLEX");
  });

  test("context tracks phase_results after PHASE_COMPLETE", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "Phase 1 done" },
    ]);
    const results = actor.getSnapshot().context.phase_results;
    expect(results).toHaveLength(1);
    expect(results[0]!.phase_id).toBe(1);
    expect(results[0]!.status).toBe("passed");
    expect(results[0]!.summary).toBe("Phase 1 done");
  });
});

// ─── Discussion Gating ───────────────────────────────────────────────────────

describe("discussion gating", () => {
  test("COMPLEX routes to discussing (discussion=run in matrix)", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "COMPLEX" },
    ]);
    expect(actor.getSnapshot().value).toBe("discussing");
  });

  test("TRIVIAL skips discussing and goes to planning", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
    ]);
    expect(actor.getSnapshot().value).toBe("planning");
  });

  test("SIMPLE skips discussing and goes to planning", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "SIMPLE" },
    ]);
    expect(actor.getSnapshot().value).toBe("planning");
  });

  test("MODERATE routes to discussing (discussion=optional, not skip)", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "MODERATE" },
    ]);
    expect(actor.getSnapshot().value).toBe("discussing");
  });

  test("CRITICAL routes to discussing (discussion=required)", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "CRITICAL" },
    ]);
    expect(actor.getSnapshot().value).toBe("discussing");
  });

  test("DISCUSS_COMPLETE from discussing goes to planning", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "COMPLEX" },
      { type: "DISCUSS_COMPLETE", summary: "Agreed on approach" },
    ]);
    expect(actor.getSnapshot().value).toBe("planning");
  });
});

// ─── Learning Gating ─────────────────────────────────────────────────────────

describe("learning gating", () => {
  test("COMPLEX routes to learning after VERIFY_PASSED (learningCapture=full)", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "COMPLEX" },
      { type: "DISCUSS_COMPLETE", summary: "" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
    ]);
    expect(actor.getSnapshot().value).toBe("learning");
  });

  test("TRIVIAL skips learning after VERIFY_PASSED (learningCapture=skip)", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
    ]);
    expect(actor.getSnapshot().value).toBe("committing");
  });

  test("SIMPLE routes to learning after VERIFY_PASSED (learningCapture=brief)", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "SIMPLE" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
    ]);
    expect(actor.getSnapshot().value).toBe("learning");
  });

  test("LEARN_COMPLETE from learning goes to committing", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "COMPLEX" },
      { type: "DISCUSS_COMPLETE", summary: "" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
      { type: "LEARN_COMPLETE", learnings: ["pattern-1"] },
    ]);
    expect(actor.getSnapshot().value).toBe("committing");
  });
});

// ─── Verification Retry ──────────────────────────────────────────────────────

describe("verification retry", () => {
  test("VERIFY_FAILED when attempts < max transitions to executing", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_FAILED", gaps: ["missing test"] },
    ]);
    expect(actor.getSnapshot().value).toBe("executing");
    expect(actor.getSnapshot().context.verification_attempts).toBe(1);
  });

  test("VERIFY_FAILED increments verification_attempts across retries", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_FAILED", gaps: ["gap1"] },
    ]);
    expect(actor.getSnapshot().context.verification_attempts).toBe(1);

    // Re-execute and verify again - attempts persist (no reset on PHASE_COMPLETE)
    actor.send({ type: "PHASE_COMPLETE", phase_id: 1, summary: "" });
    actor.send({ type: "VERIFY_FAILED", gaps: ["gap2"] });
    expect(actor.getSnapshot().context.verification_attempts).toBe(2);
  });

  test("VERIFY_FAILED when attempts >= max transitions to failed", () => {
    const actor = createWorkflow({ max_verification_attempts: 2 });
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      // First failure: attempts 0 < 2, retry
      { type: "VERIFY_FAILED", gaps: ["gap1"] },
    ]);
    expect(actor.getSnapshot().value).toBe("executing");
    expect(actor.getSnapshot().context.verification_attempts).toBe(1);

    // Second cycle
    actor.send({ type: "PHASE_COMPLETE", phase_id: 1, summary: "" });
    // Second failure: attempts 1 < 2, retry
    actor.send({ type: "VERIFY_FAILED", gaps: ["gap2"] });
    expect(actor.getSnapshot().value).toBe("executing");
    expect(actor.getSnapshot().context.verification_attempts).toBe(2);

    // Third cycle
    actor.send({ type: "PHASE_COMPLETE", phase_id: 1, summary: "" });
    // Third failure: attempts 2 >= 2, go to failed
    actor.send({ type: "VERIFY_FAILED", gaps: ["gap3"] });
    expect(actor.getSnapshot().value).toBe("failed");
  });

  test("records verification gaps in last_error", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_FAILED", gaps: ["missing docs", "no tests"] },
    ]);
    expect(actor.getSnapshot().context.last_error).toBe(
      "Verification gaps: missing docs, no tests",
    );
  });

  test("PLAN_COMPLETE resets verification_attempts", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
    ]);
    expect(actor.getSnapshot().context.verification_attempts).toBe(0);
  });
});

// ─── Paused State ─────────────────────────────────────────────────────────────

describe("paused state", () => {
  test("VERIFY_HALTED transitions to paused", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_HALTED", reason: "Human review needed" },
    ]);
    expect(actor.getSnapshot().value).toBe("paused");
    expect(actor.getSnapshot().context.last_error).toBe("Human review needed");
  });

  test("RESUME from paused transitions to executing", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_HALTED", reason: "Review needed" },
      { type: "RESUME" },
    ]);
    expect(actor.getSnapshot().value).toBe("executing");
  });

  test("ABORT from paused transitions to idle", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_HALTED", reason: "Review needed" },
      { type: "ABORT", reason: "User decided to stop" },
    ]);
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.last_error).toBe("User decided to stop");
  });
});

// ─── Suspended State ──────────────────────────────────────────────────────────

describe("suspended state", () => {
  test("SUSPEND from executing transitions to suspended", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "SUSPEND", reason: "context_exhaustion", checkpoint_id: "42" },
    ]);
    expect(actor.getSnapshot().value).toBe("suspended");
  });

  test("SUSPEND records suspend_metadata", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "SUSPEND", reason: "context_exhaustion", checkpoint_id: "42" },
    ]);
    const ctx = actor.getSnapshot().context;
    expect(ctx.suspend_metadata).toBeDefined();
    expect(ctx.suspend_metadata?.reason).toBe("context_exhaustion");
    expect(ctx.suspend_metadata?.checkpoint_path).toBe(
      ".planning/checkpoints/suspend-42.json",
    );
    expect(ctx.suspend_metadata?.suspended_at).toBeDefined();
  });

  test("SUSPEND without checkpoint_id records no checkpoint_path", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "SUSPEND", reason: "manual" },
    ]);
    const ctx = actor.getSnapshot().context;
    expect(ctx.suspend_metadata).toBeDefined();
    expect(ctx.suspend_metadata?.reason).toBe("manual");
    expect(ctx.suspend_metadata?.checkpoint_path).toBeUndefined();
  });

  test("RESUME_PHASE from suspended transitions to executing", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "SUSPEND", reason: "context_exhaustion", checkpoint_id: "42" },
      { type: "RESUME_PHASE", checkpoint_id: "42" },
    ]);
    expect(actor.getSnapshot().value).toBe("executing");
  });

  test("RESUME_PHASE clears suspend_metadata", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "SUSPEND", reason: "context_exhaustion" },
      { type: "RESUME_PHASE" },
    ]);
    const ctx = actor.getSnapshot().context;
    expect(ctx.suspend_metadata).toBeUndefined();
  });

  test("ABORT from suspended transitions to idle", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "SUSPEND", reason: "context_exhaustion" },
      { type: "ABORT", reason: "User cancelled" },
    ]);
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.suspend_metadata).toBeUndefined();
    expect(actor.getSnapshot().context.last_error).toBe("User cancelled");
  });

  test("RESET from suspended transitions to idle", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "SUSPEND", reason: "context_exhaustion" },
      { type: "RESET" },
    ]);
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.suspend_metadata).toBeUndefined();
  });
});

// ─── Failed State ─────────────────────────────────────────────────────────────

describe("failed state", () => {
  test("RESET from failed transitions to idle", () => {
    const actor = createWorkflow({ max_verification_attempts: 1 });
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      // First failure: attempts 0 < 1, retry
      { type: "VERIFY_FAILED", gaps: ["gap1"] },
    ]);
    expect(actor.getSnapshot().context.verification_attempts).toBe(1);

    // Second cycle: attempts 1 >= 1, go to failed
    actor.send({ type: "PHASE_COMPLETE", phase_id: 1, summary: "" });
    actor.send({ type: "VERIFY_FAILED", gaps: ["fatal error"] });
    expect(actor.getSnapshot().value).toBe("failed");

    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  test("context is cleaned up after RESET", () => {
    const actor = createWorkflow({ max_verification_attempts: 1 });
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_FAILED", gaps: ["gap1"] },
    ]);
    actor.send({ type: "PHASE_COMPLETE", phase_id: 1, summary: "" });
    actor.send({ type: "VERIFY_FAILED", gaps: ["fatal"] });
    expect(actor.getSnapshot().value).toBe("failed");

    actor.send({ type: "RESET" });
    const ctx = actor.getSnapshot().context;
    expect(ctx.phase_results).toEqual([]);
    expect(ctx.verification_attempts).toBe(0);
    expect(ctx.last_error).toBeUndefined();
    expect(ctx.skip_reason).toBeUndefined();
    expect(ctx.intuition_flags).toEqual([]);
  });
});

// ─── Skip Events ─────────────────────────────────────────────────────────────

describe("skip events", () => {
  test("SKIP in preflight transitions to routing", () => {
    const actor = createWorkflow();
    actor.send({ type: "START" });
    actor.send({ type: "SKIP", reason: "Not needed" });
    expect(actor.getSnapshot().value).toBe("routing");
    expect(actor.getSnapshot().context.skip_reason).toBe("Not needed");
  });

  test("SKIP in discussing transitions to planning", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "COMPLEX" },
    ]);
    expect(actor.getSnapshot().value).toBe("discussing");

    actor.send({ type: "SKIP", reason: "Already discussed" });
    expect(actor.getSnapshot().value).toBe("planning");
    expect(actor.getSnapshot().context.skip_reason).toBe("Already discussed");
  });

  test("SKIP in learning transitions to committing", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "COMPLEX" },
      { type: "DISCUSS_COMPLETE", summary: "" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
    ]);
    expect(actor.getSnapshot().value).toBe("learning");

    actor.send({ type: "SKIP", reason: "No learnings" });
    expect(actor.getSnapshot().value).toBe("committing");
    expect(actor.getSnapshot().context.skip_reason).toBe("No learnings");
  });
});

// ─── Autopilot Looping ──────────────────────────────────────────────────────

describe("autopilot looping", () => {
  test("COMMIT_COMPLETE with hasMorePhases=true transitions to idle", () => {
    const actor = createWorkflow({
      autopilot_config: { max_phases_per_session: 3 },
    });
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
      { type: "COMMIT_COMPLETE", commit_hash: "abc" },
    ]);
    // 1 phase result < max 3 = hasMorePhases true
    expect(actor.getSnapshot().value).toBe("idle");
  });

  test("COMMIT_COMPLETE with hasMorePhases=false transitions to complete", () => {
    const actor = createWorkflow({
      autopilot_config: { max_phases_per_session: 1 },
    });
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
      { type: "COMMIT_COMPLETE", commit_hash: "abc" },
    ]);
    // 1 phase result >= max 1 = hasMorePhases false
    expect(actor.getSnapshot().value).toBe("complete");
  });

  test("context is reset when looping back to idle", () => {
    const actor = createWorkflow({
      autopilot_config: { max_phases_per_session: 3 },
    });
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
      { type: "COMMIT_COMPLETE", commit_hash: "abc" },
    ]);
    const ctx = actor.getSnapshot().context;
    // resetContext clears phase_results, verification_attempts, etc.
    expect(ctx.phase_results).toEqual([]);
    expect(ctx.verification_attempts).toBe(0);
  });
});

// ─── Context Initialization ──────────────────────────────────────────────────

describe("context initialization", () => {
  test("machine starts with valid context from initializeContext", () => {
    const actor = createWorkflow();
    const ctx = actor.getSnapshot().context;
    expect(ctx).toBeDefined();
    expect(ctx.session_id).toBeDefined();
    expect(typeof ctx.session_id).toBe("string");
    expect(ctx.session_id.length).toBeGreaterThan(0);
  });

  test("session_id is a UUID", () => {
    const actor = createWorkflow();
    const ctx = actor.getSnapshot().context;
    // UUID format: 8-4-4-4-12
    expect(ctx.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("default values are applied", () => {
    const actor = createWorkflow();
    const ctx = actor.getSnapshot().context;
    expect(ctx.complexity).toBe("TRIVIAL");
    expect(ctx.oversight).toBe("milestone");
    expect(ctx.base_branch).toBe("main");
    expect(ctx.phase_results).toEqual([]);
    expect(ctx.verification_attempts).toBe(0);
    expect(ctx.max_verification_attempts).toBe(3);
    expect(ctx.current_plan_ids).toEqual([]);
    expect(ctx.intuition_flags).toEqual([]);
    expect(ctx.memory_tags).toEqual([]);
  });

  test("context overrides are applied", () => {
    const actor = createWorkflow({
      ticket_id: "TEST-99",
      complexity: "COMPLEX",
      oversight: "full-auto",
    });
    const ctx = actor.getSnapshot().context;
    expect(ctx.ticket_id).toBe("TEST-99");
    expect(ctx.complexity).toBe("COMPLEX");
    expect(ctx.oversight).toBe("full-auto");
  });

  test("started_at is set", () => {
    const actor = createWorkflow();
    const ctx = actor.getSnapshot().context;
    expect(ctx.started_at).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(ctx.started_at!).toISOString()).toBe(ctx.started_at!);
  });
});

// ─── getAllowedEvents ────────────────────────────────────────────────────────

describe("getAllowedEvents", () => {
  test("returns START for idle state", () => {
    const actor = createWorkflow();
    const events = getAllowedEvents(actor.getSnapshot());
    expect(events).toContain("START");
  });

  test("returns PREFLIGHT_COMPLETE and SKIP for preflight state", () => {
    const actor = createWorkflow();
    actor.send({ type: "START" });
    const events = getAllowedEvents(actor.getSnapshot());
    expect(events).toContain("PREFLIGHT_COMPLETE");
    expect(events).toContain("SKIP");
  });

  test("returns RESUME and ABORT for paused state", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_HALTED", reason: "Review" },
    ]);
    const events = getAllowedEvents(actor.getSnapshot());
    expect(events).toContain("RESUME");
    expect(events).toContain("ABORT");
  });

  test("returns RESUME_PHASE, ABORT, and RESET for suspended state", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "SUSPEND", reason: "context_exhaustion" },
    ]);
    const events = getAllowedEvents(actor.getSnapshot());
    expect(events).toContain("RESUME_PHASE");
    expect(events).toContain("ABORT");
    expect(events).toContain("RESET");
  });

  test("returns empty array for complete (final) state", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_PASSED" },
      { type: "COMMIT_COMPLETE", commit_hash: "abc" },
    ]);
    const events = getAllowedEvents(actor.getSnapshot());
    expect(events).toEqual([]);
  });

  test("returns RESET for failed state", () => {
    const actor = createWorkflow({ max_verification_attempts: 1 });
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_COMPLETE", phase_id: 1, summary: "" },
      { type: "VERIFY_FAILED", gaps: ["gap1"] },
    ]);
    actor.send({ type: "PHASE_COMPLETE", phase_id: 1, summary: "" });
    actor.send({ type: "VERIFY_FAILED", gaps: ["gap2"] });
    expect(actor.getSnapshot().value).toBe("failed");

    const events = getAllowedEvents(actor.getSnapshot());
    expect(events).toContain("RESET");
  });
});

// ─── Phase Failure Path ──────────────────────────────────────────────────────

describe("phase failure path", () => {
  test("PHASE_FAILED transitions to verifying", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_FAILED", phase_id: 1, error: "Build error" },
    ]);
    expect(actor.getSnapshot().value).toBe("verifying");
  });

  test("PHASE_FAILED records error in phase_results", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_FAILED", phase_id: 1, error: "Build error" },
    ]);
    const results = actor.getSnapshot().context.phase_results;
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("failed");
    expect(results[0]!.errors).toContain("Build error");
  });

  test("PHASE_FAILED records last_error", () => {
    const actor = createWorkflow();
    sendEvents(actor, [
      { type: "START" },
      { type: "PREFLIGHT_COMPLETE", intuition_flags: [] },
      { type: "ROUTE_COMPLETE", complexity: "TRIVIAL" },
      { type: "PLAN_COMPLETE", plan_id: "1" },
      { type: "PHASE_FAILED", phase_id: 1, error: "Compilation failed" },
    ]);
    expect(actor.getSnapshot().context.last_error).toBe("Compilation failed");
  });
});

// ─── Transition Timestamps ──────────────────────────────────────────────────

describe("transition timestamps", () => {
  test("last_transition_at is updated on each transition", () => {
    const actor = createWorkflow();

    actor.send({ type: "START" });
    const afterStart = actor.getSnapshot().context.last_transition_at;
    expect(afterStart).toBeDefined();

    actor.send({ type: "PREFLIGHT_COMPLETE", intuition_flags: [] });
    const afterPreflight = actor.getSnapshot().context.last_transition_at;
    expect(afterPreflight).toBeDefined();
  });
});

// ─── Invalid Events ─────────────────────────────────────────────────────────

describe("invalid events", () => {
  test("invalid event in idle does not change state", () => {
    const actor = createWorkflow();
    // PREFLIGHT_COMPLETE is not valid in idle
    actor.send({ type: "PREFLIGHT_COMPLETE", intuition_flags: [] });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  test("RESET in idle does not change state (not handled)", () => {
    const actor = createWorkflow();
    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
  });
});
