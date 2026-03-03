import { describe, test, expect } from "bun:test";
import {
  iterationMetricsSchema,
  planQualityMetricsSchema,
  reviewMetricsSchema,
  convergenceMetricsSchema,
  metricsFileSchema,
} from "../../../src/iteration/__schemas/metrics.schemas";

describe("iterationMetricsSchema", () => {
  test("accepts valid iteration metrics", () => {
    const result = iterationMetricsSchema.safeParse({
      phase: 91,
      loop: "harness",
      predicted_stall_point: 0,
      actual_iteration_count: 3,
      outcome: "all_passed",
      stall_events: 1,
      debate_changed_outcome: false,
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional fields", () => {
    const result = iterationMetricsSchema.parse({
      phase: 91,
      loop: "verify",
      actual_iteration_count: 2,
      outcome: "convergence_failure",
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.predicted_stall_point).toBe(0);
    expect(result.stall_events).toBe(0);
    expect(result.debate_changed_outcome).toBe(false);
  });

  test("rejects invalid loop type", () => {
    const result = iterationMetricsSchema.safeParse({
      phase: 91,
      loop: "invalid",
      actual_iteration_count: 1,
      outcome: "all_passed",
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid outcome", () => {
    const result = iterationMetricsSchema.safeParse({
      phase: 91,
      loop: "harness",
      actual_iteration_count: 1,
      outcome: "invalid_outcome",
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("planQualityMetricsSchema", () => {
  test("accepts valid plan quality metrics", () => {
    const result = planQualityMetricsSchema.safeParse({
      plan_id: "91-A",
      phase: 91,
      wsjf_score: 8.5,
      complexity: "MODERATE",
      execution_duration_ms: 120000,
      outcome: "success",
      gap_count: 0,
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional numeric fields", () => {
    const result = planQualityMetricsSchema.parse({
      plan_id: "91-B",
      phase: 91,
      complexity: "COMPLEX",
      outcome: "partial",
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.wsjf_score).toBe(0);
    expect(result.execution_duration_ms).toBe(0);
    expect(result.gap_count).toBe(0);
  });
});

describe("reviewMetricsSchema", () => {
  test("accepts valid review metrics", () => {
    const result = reviewMetricsSchema.safeParse({
      phase: 91,
      reviewer_count: 3,
      total_issues: 5,
      issues_by_severity: { HIGH: 2, MEDIUM: 3 },
      issues_by_agent: { "dx-advocate": 2, "code-simplifier": 3 },
      debate_enabled: false,
      disagreements_detected: 0,
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults for debate fields", () => {
    const result = reviewMetricsSchema.parse({
      phase: 91,
      reviewer_count: 2,
      total_issues: 1,
      issues_by_severity: { LOW: 1 },
      issues_by_agent: { "dx-advocate": 1 },
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.debate_enabled).toBe(false);
    expect(result.disagreements_detected).toBe(0);
  });
});

describe("convergenceMetricsSchema", () => {
  test("accepts valid convergence metrics", () => {
    const result = convergenceMetricsSchema.safeParse({
      phase: 91,
      loop: "harness",
      premature_halt: true,
      halt_iteration: 3,
      total_stale_count: 2,
      signals_at_halt: {
        error_count_delta: 0,
        fingerprint_overlap: 0.95,
        artifact_change_delta: 0,
      },
      debate_override: false,
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("accepts convergence metrics without signals_at_halt", () => {
    const result = convergenceMetricsSchema.safeParse({
      phase: 91,
      loop: "verify",
      premature_halt: false,
      total_stale_count: 0,
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("signals_at_halt includes optional semantic_overlap", () => {
    const result = convergenceMetricsSchema.parse({
      phase: 91,
      loop: "harness",
      premature_halt: true,
      halt_iteration: 2,
      total_stale_count: 2,
      signals_at_halt: {
        error_count_delta: 0,
        fingerprint_overlap: 0.9,
        artifact_change_delta: 0,
        semantic_overlap: 0.95,
      },
      timestamp: "2026-03-03T12:00:00Z",
    });
    expect(result.signals_at_halt?.semantic_overlap).toBe(0.95);
  });
});

describe("metricsFileSchema", () => {
  test("accepts empty metrics file", () => {
    const result = metricsFileSchema.safeParse({
      version: "1.0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.iteration_metrics).toEqual([]);
      expect(result.data.plan_quality_metrics).toEqual([]);
      expect(result.data.review_metrics).toEqual([]);
      expect(result.data.convergence_metrics).toEqual([]);
    }
  });

  test("accepts populated metrics file", () => {
    const result = metricsFileSchema.safeParse({
      version: "1.0",
      iteration_metrics: [
        {
          phase: 91,
          loop: "harness",
          actual_iteration_count: 2,
          outcome: "all_passed",
          timestamp: "2026-03-03T12:00:00Z",
        },
      ],
      plan_quality_metrics: [],
      review_metrics: [],
      convergence_metrics: [],
    });
    expect(result.success).toBe(true);
  });

  test("rejects wrong version", () => {
    const result = metricsFileSchema.safeParse({
      version: "2.0",
    });
    expect(result.success).toBe(false);
  });
});
