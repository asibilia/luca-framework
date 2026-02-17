import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { phaseActorMachine } from "../actors/phase-actor";
import type { PhaseInput } from "../types";

/**
 * Helper to create and start a phase actor with input overrides.
 */
function createPhaseActor(overrides: Partial<PhaseInput> = {}) {
  const input: PhaseInput = {
    phase_id: 1,
    plan_ids: ["34-01"],
    total_waves: 1,
    max_fix_iterations: 3,
    ...overrides,
  };
  const actor = createActor(phaseActorMachine, { input });
  actor.start();
  return actor;
}

// ─── Single Wave Happy Path ─────────────────────────────────────────────────

describe("single wave happy path", () => {
  test("starts in idle state", () => {
    const actor = createPhaseActor();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  test("PLAN_WAVE transitions idle to wave_executing", () => {
    const actor = createPhaseActor();
    actor.send({ type: "PLAN_WAVE" });
    expect(actor.getSnapshot().value).toBe("wave_executing");
  });

  test("WAVE_COMPLETE transitions to phase_verifying for single wave", () => {
    const actor = createPhaseActor({ total_waves: 1 });
    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "Done" });
    // wave_evaluating -> (no more waves) -> phase_verifying (always transition)
    expect(actor.getSnapshot().value).toBe("phase_verifying");
  });

  test("HARNESS_PASSED transitions to phase_done with outcome passed", () => {
    const actor = createPhaseActor({ total_waves: 1 });
    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "Done" });
    actor.send({ type: "HARNESS_PASSED" });
    expect(actor.getSnapshot().value).toBe("phase_done");
    expect(actor.getSnapshot().context.outcome).toBe("passed");
  });

  test("full lifecycle records correct outcome_reason", () => {
    const actor = createPhaseActor({ total_waves: 1 });
    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "Done" });
    actor.send({ type: "HARNESS_PASSED" });
    expect(actor.getSnapshot().context.outcome_reason).toBe(
      "All waves completed and harness passed",
    );
  });
});

// ─── Multi-Wave Execution ───────────────────────────────────────────────────

describe("multi-wave execution", () => {
  test("three waves all complete and advance to phase_verifying", () => {
    const actor = createPhaseActor({ total_waves: 3 });

    actor.send({ type: "PLAN_WAVE" });
    expect(actor.getSnapshot().context.current_wave).toBe(1);

    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "Wave 1" });
    // wave_evaluating -> hasMoreWaves (1 < 3) -> wave_executing (wave 2)
    expect(actor.getSnapshot().value).toBe("wave_executing");
    expect(actor.getSnapshot().context.current_wave).toBe(2);

    actor.send({ type: "WAVE_COMPLETE", wave_number: 2, summary: "Wave 2" });
    // wave_evaluating -> hasMoreWaves (2 < 3) -> wave_executing (wave 3)
    expect(actor.getSnapshot().value).toBe("wave_executing");
    expect(actor.getSnapshot().context.current_wave).toBe(3);

    actor.send({ type: "WAVE_COMPLETE", wave_number: 3, summary: "Wave 3" });
    // wave_evaluating -> no more waves (3 >= 3) -> phase_verifying
    expect(actor.getSnapshot().value).toBe("phase_verifying");
  });

  test("wave results array tracks all completed waves", () => {
    const actor = createPhaseActor({ total_waves: 3 });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "W1" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 2, summary: "W2" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 3, summary: "W3" });

    const results = actor.getSnapshot().context.wave_results;
    expect(results).toHaveLength(3);
    expect(results[0]!.wave_number).toBe(1);
    expect(results[0]!.status).toBe("passed");
    expect(results[1]!.wave_number).toBe(2);
    expect(results[2]!.wave_number).toBe(3);
  });

  test("wave counter increments correctly across all waves", () => {
    const actor = createPhaseActor({ total_waves: 2 });

    actor.send({ type: "PLAN_WAVE" });
    expect(actor.getSnapshot().context.current_wave).toBe(1);

    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    expect(actor.getSnapshot().context.current_wave).toBe(2);

    actor.send({ type: "WAVE_COMPLETE", wave_number: 2, summary: "" });
    // Now in phase_verifying, wave counter should be 2
    expect(actor.getSnapshot().context.current_wave).toBe(2);
  });
});

// ─── Wave Failure ───────────────────────────────────────────────────────────

describe("wave failure", () => {
  test("WAVE_FAILED advances to wave_evaluating and records failure", () => {
    const actor = createPhaseActor({ total_waves: 2 });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({
      type: "WAVE_FAILED",
      wave_number: 1,
      error: "Build error",
    });

    // With 2 total waves, should advance to next wave
    expect(actor.getSnapshot().value).toBe("wave_executing");

    const results = actor.getSnapshot().context.wave_results;
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("failed");
    expect(results[0]!.summary).toBe("Build error");
  });

  test("WAVE_FAILED on last wave goes to phase_verifying", () => {
    const actor = createPhaseActor({ total_waves: 1 });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({
      type: "WAVE_FAILED",
      wave_number: 1,
      error: "Compilation failed",
    });

    expect(actor.getSnapshot().value).toBe("phase_verifying");
  });
});

// ─── Harness Fix Iterations ─────────────────────────────────────────────────

describe("harness fix iterations", () => {
  test("HARNESS_FAILED within budget transitions to phase_fixing", () => {
    const actor = createPhaseActor({
      total_waves: 1,
      max_fix_iterations: 3,
    });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_FAILED", error_count: 5 });

    expect(actor.getSnapshot().value).toBe("phase_fixing");
    expect(actor.getSnapshot().context.fix_iterations).toBe(1);
  });

  test("FIX_COMPLETE transitions back to phase_verifying", () => {
    const actor = createPhaseActor({
      total_waves: 1,
      max_fix_iterations: 3,
    });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_FAILED", error_count: 5 });
    actor.send({ type: "FIX_COMPLETE", summary: "Fixed 5 errors" });

    expect(actor.getSnapshot().value).toBe("phase_verifying");
  });

  test("fix -> verify -> pass cycle results in phase_done", () => {
    const actor = createPhaseActor({
      total_waves: 1,
      max_fix_iterations: 3,
    });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_FAILED", error_count: 5 });
    actor.send({ type: "FIX_COMPLETE", summary: "Fixed errors" });
    actor.send({ type: "HARNESS_PASSED" });

    expect(actor.getSnapshot().value).toBe("phase_done");
    expect(actor.getSnapshot().context.outcome).toBe("passed");
    expect(actor.getSnapshot().context.fix_iterations).toBe(1);
  });
});

// ─── Fix Budget Exhaustion ──────────────────────────────────────────────────

describe("fix budget exhaustion", () => {
  test("HARNESS_FAILED when budget exhausted transitions to phase_blocked", () => {
    const actor = createPhaseActor({
      total_waves: 1,
      max_fix_iterations: 1,
    });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });

    // First failure: iterations 0 < 1, goes to fixing
    actor.send({ type: "HARNESS_FAILED", error_count: 3 });
    expect(actor.getSnapshot().value).toBe("phase_fixing");
    expect(actor.getSnapshot().context.fix_iterations).toBe(1);

    // Fix completes, back to verifying
    actor.send({ type: "FIX_COMPLETE", summary: "Attempted fix" });
    expect(actor.getSnapshot().value).toBe("phase_verifying");

    // Second failure: iterations 1 >= 1, budget exhausted -> blocked
    actor.send({ type: "HARNESS_FAILED", error_count: 2 });
    expect(actor.getSnapshot().value).toBe("phase_blocked");
    expect(actor.getSnapshot().context.outcome).toBe("blocked");
  });

  test("blocked outcome_reason mentions budget exhaustion", () => {
    const actor = createPhaseActor({
      total_waves: 1,
      max_fix_iterations: 1,
    });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_FAILED", error_count: 3 });
    actor.send({ type: "FIX_COMPLETE", summary: "Attempted" });
    actor.send({ type: "HARNESS_FAILED", error_count: 2 });

    expect(actor.getSnapshot().context.outcome_reason).toContain(
      "Fix budget exhausted",
    );
  });
});

// ─── Context Initialization ─────────────────────────────────────────────────

describe("context initialization", () => {
  test("input is preserved in context", () => {
    const actor = createPhaseActor({
      phase_id: 42,
      plan_ids: ["plan-a", "plan-b"],
      total_waves: 5,
      max_fix_iterations: 2,
    });
    const ctx = actor.getSnapshot().context;
    expect(ctx.phase_id).toBe(42);
    expect(ctx.plan_ids).toEqual(["plan-a", "plan-b"]);
    expect(ctx.total_waves).toBe(5);
    expect(ctx.max_fix_iterations).toBe(2);
  });

  test("defaults are applied for unset fields", () => {
    const actor = createPhaseActor({ phase_id: 1 });
    const ctx = actor.getSnapshot().context;
    expect(ctx.current_wave).toBe(0);
    expect(ctx.wave_results).toEqual([]);
    expect(ctx.fix_iterations).toBe(0);
    expect(ctx.harness_passed).toBe(false);
    expect(ctx.last_harness_errors).toEqual([]);
    expect(ctx.outcome).toBe("pending");
    expect(ctx.outcome_reason).toBe("");
  });
});

// ─── FIX_FAILED ─────────────────────────────────────────────────────────────

describe("FIX_FAILED", () => {
  test("FIX_FAILED transitions to phase_blocked", () => {
    const actor = createPhaseActor({
      total_waves: 1,
      max_fix_iterations: 3,
    });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_FAILED", error_count: 5 });
    actor.send({ type: "FIX_FAILED", error: "Cannot fix import cycle" });

    expect(actor.getSnapshot().value).toBe("phase_blocked");
    expect(actor.getSnapshot().context.outcome).toBe("blocked");
    expect(actor.getSnapshot().context.outcome_reason).toContain(
      "Fix failed: Cannot fix import cycle",
    );
  });
});

// ─── Output ─────────────────────────────────────────────────────────────────

describe("output", () => {
  test("phase_done output has outcome passed", () => {
    const actor = createPhaseActor({
      phase_id: 7,
      total_waves: 1,
    });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_PASSED" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("phase_done");
    expect(snapshot.output).toEqual({
      phase_id: 7,
      outcome: "passed",
      outcome_reason: "All waves completed and harness passed",
    });
  });

  test("phase_blocked output has outcome blocked", () => {
    const actor = createPhaseActor({
      phase_id: 9,
      total_waves: 1,
      max_fix_iterations: 1,
    });

    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_FAILED", error_count: 3 });
    actor.send({ type: "FIX_FAILED", error: "Unrecoverable" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("phase_blocked");
    expect(snapshot.output).toEqual({
      phase_id: 9,
      outcome: "blocked",
      outcome_reason: "Fix failed: Unrecoverable",
    });
  });

  test("harness_passed flag is set after HARNESS_PASSED", () => {
    const actor = createPhaseActor({ total_waves: 1 });
    actor.send({ type: "PLAN_WAVE" });
    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_PASSED" });
    expect(actor.getSnapshot().context.harness_passed).toBe(true);
  });

  test("timestamps are recorded for start and completion", () => {
    const actor = createPhaseActor({ total_waves: 1 });
    actor.send({ type: "PLAN_WAVE" });
    expect(actor.getSnapshot().context.timestamps.started_at).toBeDefined();

    actor.send({ type: "WAVE_COMPLETE", wave_number: 1, summary: "" });
    actor.send({ type: "HARNESS_PASSED" });
    expect(actor.getSnapshot().context.timestamps.completed_at).toBeDefined();
  });
});
