import { describe, test, expect } from "bun:test";
import {
  evaluateRetirement,
  applyRetirement,
  updateExecutionStats,
} from "../../../src/memory/procedure-lifecycle.ts";
import type { ProcedureEntry } from "../../../src/memory/types.ts";

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Build a minimal ProcedureEntry for testing.
 * Overrides can be passed to customize any field.
 */
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

// ─── evaluateRetirement ──────────────────────────────────────────────────────

describe("evaluateRetirement", () => {
  test("low success rate triggers retirement", () => {
    const entry = buildEntry({
      success_rate: 0.2,
      execution_count: 6,
      success_count: 1,
    });

    const result = evaluateRetirement(entry);

    expect(result.should_retire).toBe(true);
    expect(result.reason).toContain("Low success rate");
    expect(result.reason).toContain("0.20");
    expect(result.reason).toContain("6 executions");
  });

  test("healthy procedure not retired", () => {
    const entry = buildEntry({
      success_rate: 0.8,
      execution_count: 10,
      success_count: 8,
      last_executed_at: new Date().toISOString(),
    });

    const result = evaluateRetirement(entry);

    expect(result.should_retire).toBe(false);
    expect(result.reason).toBe("Procedure is healthy");
  });

  test("stale procedure triggers retirement", () => {
    // 200 days ago
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 200);

    const entry = buildEntry({
      success_rate: 0.5,
      execution_count: 2,
      success_count: 1,
      last_executed_at: staleDate.toISOString(),
    });

    const result = evaluateRetirement(entry);

    expect(result.should_retire).toBe(true);
    expect(result.reason).toContain("Stale procedure");
    expect(result.reason).toContain("2 executions");
  });

  test("recent low-execution not stale", () => {
    // 30 days ago - well within the 180 day window
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30);

    const entry = buildEntry({
      success_rate: 0.5,
      execution_count: 1,
      success_count: 1,
      last_executed_at: recentDate.toISOString(),
    });

    const result = evaluateRetirement(entry);

    expect(result.should_retire).toBe(false);
    expect(result.reason).toBe("Procedure is healthy");
  });

  test("custom threshold overrides - min_success_rate", () => {
    const entry = buildEntry({
      success_rate: 0.4,
      execution_count: 6,
      success_count: 2,
    });

    // Default threshold (0.3) would NOT retire this
    const defaultResult = evaluateRetirement(entry);
    expect(defaultResult.should_retire).toBe(false);

    // Custom threshold (0.5) SHOULD retire this
    const customResult = evaluateRetirement(entry, {
      min_success_rate: 0.5,
    });
    expect(customResult.should_retire).toBe(true);
    expect(customResult.reason).toContain("Low success rate");
  });

  test("custom threshold overrides - min_executions", () => {
    const entry = buildEntry({
      success_rate: 0.2,
      execution_count: 3,
      success_count: 0,
    });

    // Default min_executions (5) would NOT retire this (only 3 executions)
    const defaultResult = evaluateRetirement(entry);
    expect(defaultResult.should_retire).toBe(false);

    // Custom min_executions (2) SHOULD retire this
    const customResult = evaluateRetirement(entry, {
      min_executions: 2,
    });
    expect(customResult.should_retire).toBe(true);
  });

  test("custom threshold overrides - max_stale_days", () => {
    // 100 days ago
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 100);

    const entry = buildEntry({
      success_rate: 0.5,
      execution_count: 2,
      success_count: 1,
      last_executed_at: staleDate.toISOString(),
    });

    // Default max_stale_days (180) would NOT retire this
    const defaultResult = evaluateRetirement(entry);
    expect(defaultResult.should_retire).toBe(false);

    // Custom max_stale_days (90) SHOULD retire this
    const customResult = evaluateRetirement(entry, {
      max_stale_days: 90,
    });
    expect(customResult.should_retire).toBe(true);
    expect(customResult.reason).toContain("Stale procedure");
  });
});

// ─── applyRetirement ────────────────────────────────────────────────────────

describe("applyRetirement", () => {
  test("returns new entry with status='retired'", () => {
    const entry = buildEntry({ status: "active" });
    const reason = "Test retirement";

    const retired = applyRetirement(entry, reason);

    expect(retired.status).toBe("retired");
    expect(retired.id).toBe(entry.id);
    expect(retired.title).toBe(entry.title);
  });

  test("sets retirement_reason", () => {
    const entry = buildEntry({ status: "active" });
    const reason = "Low success rate (0.20 after 5 executions)";

    const retired = applyRetirement(entry, reason);

    expect(retired.retirement_reason).toBe(reason);
  });

  test("does not mutate original entry", () => {
    const entry = buildEntry({ status: "active" });
    const originalStatus = entry.status;
    const originalReason = entry.retirement_reason;

    applyRetirement(entry, "some reason");

    expect(entry.status).toBe(originalStatus);
    expect(entry.retirement_reason).toBe(originalReason);
  });
});

// ─── updateExecutionStats ────────────────────────────────────────────────────

describe("updateExecutionStats", () => {
  test("success increments both counts", () => {
    const entry = buildEntry({
      execution_count: 5,
      success_count: 3,
      success_rate: 0.6,
    });

    const updated = updateExecutionStats(entry, true);

    expect(updated.execution_count).toBe(6);
    expect(updated.success_count).toBe(4);
  });

  test("failure only increments execution_count", () => {
    const entry = buildEntry({
      execution_count: 5,
      success_count: 3,
      success_rate: 0.6,
    });

    const updated = updateExecutionStats(entry, false);

    expect(updated.execution_count).toBe(6);
    expect(updated.success_count).toBe(3);
  });

  test("rate computation (3/4 = 0.75)", () => {
    const entry = buildEntry({
      execution_count: 3,
      success_count: 3,
      success_rate: 1.0,
    });

    // Add a failure: 3/4 = 0.75
    const updated = updateExecutionStats(entry, false);

    expect(updated.success_rate).toBe(0.75);
  });

  test("from zero (first execution: 1/1 = 1.0)", () => {
    const entry = buildEntry({
      execution_count: 0,
      success_count: 0,
      success_rate: 0,
    });

    const updated = updateExecutionStats(entry, true);

    expect(updated.execution_count).toBe(1);
    expect(updated.success_count).toBe(1);
    expect(updated.success_rate).toBe(1.0);
  });

  test("from zero first failure (0/1 = 0.0)", () => {
    const entry = buildEntry({
      execution_count: 0,
      success_count: 0,
      success_rate: 0,
    });

    const updated = updateExecutionStats(entry, false);

    expect(updated.execution_count).toBe(1);
    expect(updated.success_count).toBe(0);
    expect(updated.success_rate).toBe(0);
  });

  test("updates last_executed_at to current timestamp", () => {
    const entry = buildEntry({
      execution_count: 1,
      success_count: 1,
      success_rate: 1.0,
    });

    const before = new Date();
    const updated = updateExecutionStats(entry, true);
    const after = new Date();

    expect(updated.last_executed_at).toBeDefined();
    const executedAt = new Date(updated.last_executed_at!);
    expect(executedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(executedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test("immutability check - original entry not mutated", () => {
    const entry = buildEntry({
      execution_count: 5,
      success_count: 3,
      success_rate: 0.6,
    });
    const originalExecCount = entry.execution_count;
    const originalSuccessCount = entry.success_count;
    const originalRate = entry.success_rate;
    const originalLastExecuted = entry.last_executed_at;

    updateExecutionStats(entry, true);

    expect(entry.execution_count).toBe(originalExecCount);
    expect(entry.success_count).toBe(originalSuccessCount);
    expect(entry.success_rate).toBe(originalRate);
    expect(entry.last_executed_at).toBe(originalLastExecuted);
  });

  test("success rate rounds to 2 decimal places", () => {
    // 1/3 = 0.33333... should round to 0.33
    const entry = buildEntry({
      execution_count: 2,
      success_count: 1,
      success_rate: 0.5,
    });

    const updated = updateExecutionStats(entry, false);
    // 1/3 = 0.33
    expect(updated.success_rate).toBe(0.33);
  });
});
