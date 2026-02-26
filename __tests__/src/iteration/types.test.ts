import { describe, test, expect } from "bun:test";
import {
  classifiedErrorSchema,
  convergenceSignalsSchema,
  convergenceResultSchema,
  iterationRecordSchema,
  iterationHistorySchema,
  budgetStateSchema,
  loopConfigSchema,
  loopResultSchema,
  iterationConfigSchema,
  hitlDecisionSchema,
} from "~/iteration/__schemas/iteration.schemas";

describe("iteration types", () => {
  test("classifiedErrorSchema parses valid classified error", () => {
    const result = classifiedErrorSchema.safeParse({
      fingerprint: "abc123def456",
      source: "test",
      classification: "correctable",
      iterations_seen: 2,
      message: "Expected true, received false",
      file: "src/foo.test.ts",
      line: 42,
    });
    expect(result.success).toBe(true);
  });

  test("classifiedErrorSchema rejects invalid classification", () => {
    const result = classifiedErrorSchema.safeParse({
      fingerprint: "abc123",
      source: "test",
      classification: "unknown",
      iterations_seen: 1,
      message: "error",
    });
    expect(result.success).toBe(false);
  });

  test("convergenceSignalsSchema parses valid signals", () => {
    const result = convergenceSignalsSchema.safeParse({
      error_count_delta: -2,
      fingerprint_overlap: 0.75,
      artifact_change_delta: 3,
    });
    expect(result.success).toBe(true);
  });

  test("convergenceResultSchema parses valid result", () => {
    const result = convergenceResultSchema.safeParse({
      signals: {
        error_count_delta: 0,
        fingerprint_overlap: 1.0,
        artifact_change_delta: 0,
      },
      status: "stalled",
      consecutive_stale: 2,
      should_halt: true,
    });
    expect(result.success).toBe(true);
  });

  test("iterationRecordSchema parses valid checkpoint metadata", () => {
    const result = iterationRecordSchema.safeParse({
      tag: "iter/17/harness/1",
      phase: 17,
      loop: "harness",
      iteration: 1,
      error_count: 5,
      error_delta: -3,
      error_fingerprints: ["fp1", "fp2", "fp3", "fp4", "fp5"],
      convergence_status: "improved",
      stale_count: 0,
      permanent_errors: [],
      correctable_errors: ["fp1", "fp2"],
      transient_errors: ["fp3"],
      artifacts_delta: 4,
      commit_hash: "abc123def456789",
      agent_invoked: "lu-executor",
      duration_ms: 45000,
      timestamp: "2026-02-11T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("iterationHistorySchema parses valid history", () => {
    const result = iterationHistorySchema.safeParse({
      phase: 17,
      loop: "harness",
      iterations: [],
      fingerprint_ledger: {},
    });
    expect(result.success).toBe(true);
  });

  test("budgetStateSchema applies default soft_stop_percent", () => {
    const result = budgetStateSchema.parse({
      max_iterations: 3,
      current_iteration: 1,
      status: "under_budget",
    });
    expect(result.soft_stop_percent).toBe(80);
  });

  test("loopConfigSchema parses with defaults", () => {
    const result = loopConfigSchema.parse({
      loop_type: "harness",
      phase: 17,
      max_iterations: 3,
      mode: "afk",
    });
    expect(result.soft_stop_percent).toBe(80);
    expect(result.stale_threshold).toBe(2);
    expect(result.promotion_threshold).toBe(3);
  });

  test("loopResultSchema parses valid result", () => {
    const result = loopResultSchema.safeParse({
      outcome: "all_passed",
      iterations_completed: 2,
      history: {
        phase: 17,
        loop: "harness",
        iterations: [],
        fingerprint_ledger: {},
      },
      remaining_errors: [],
      permanent_errors: [],
    });
    expect(result.success).toBe(true);
  });

  test("iterationConfigSchema applies defaults", () => {
    const result = iterationConfigSchema.parse({});
    expect(result.default_mode).toBe("afk");
    expect(result.soft_stop_percent).toBe(80);
    expect(result.stale_threshold).toBe(2);
    expect(result.promotion_threshold).toBe(3);
  });

  test("loopTypeSchema accepts harness and verify", () => {
    expect(() =>
      loopConfigSchema.parse({
        loop_type: "harness",
        phase: 1,
        max_iterations: 1,
        mode: "afk",
      }),
    ).not.toThrow();
    expect(() =>
      loopConfigSchema.parse({
        loop_type: "verify",
        phase: 1,
        max_iterations: 1,
        mode: "afk",
      }),
    ).not.toThrow();
  });

  test("hitl decision values are complete", () => {
    for (const d of ["continue", "rollback", "abort", "skip"]) {
      expect(hitlDecisionSchema.safeParse(d).success).toBe(true);
    }
  });
});
