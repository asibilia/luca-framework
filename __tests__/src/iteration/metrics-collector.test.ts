import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import {
  buildIterationMetrics,
  buildPlanQualityMetrics,
  buildReviewMetrics,
  buildConvergenceMetrics,
  appendMetrics,
} from "../../../src/iteration/__helpers/metrics-collector";
import type {
  LoopResult,
  LoopConfig,
  ConvergenceResult,
} from "../../../src/iteration/__schemas/iteration.schemas";
import { metricsFileSchema } from "../../../src/iteration/__schemas/metrics.schemas";

const TEST_DIR = join(import.meta.dir, ".tmp-metrics-test");
const TEST_METRICS_PATH = join(TEST_DIR, "metrics.json");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

function makeLoopResult(overrides: Partial<LoopResult> = {}): LoopResult {
  return {
    outcome: "all_passed",
    iterations_completed: 2,
    history: {
      phase: 91,
      loop: "harness",
      iterations: [
        {
          tag: "iter/91/harness/1",
          phase: 91,
          loop: "harness",
          iteration: 1,
          error_count: 5,
          error_delta: -3,
          error_fingerprints: ["fp1", "fp2"],
          convergence_status: "improved",
          stale_count: 0,
          permanent_errors: [],
          correctable_errors: ["fp1"],
          transient_errors: ["fp2"],
          artifacts_delta: 3,
          commit_hash: "abc123",
          agent_invoked: "lu-executor",
          duration_ms: 5000,
          timestamp: "2026-03-03T12:00:00Z",
        },
        {
          tag: "iter/91/harness/2",
          phase: 91,
          loop: "harness",
          iteration: 2,
          error_count: 0,
          error_delta: -5,
          error_fingerprints: [],
          convergence_status: "improved",
          stale_count: 0,
          permanent_errors: [],
          correctable_errors: [],
          transient_errors: [],
          artifacts_delta: 2,
          commit_hash: "def456",
          agent_invoked: "lu-executor",
          duration_ms: 3000,
          timestamp: "2026-03-03T12:01:00Z",
        },
      ],
      fingerprint_ledger: { fp1: 1, fp2: 1 },
    },
    remaining_errors: [],
    permanent_errors: [],
    ...overrides,
  };
}

function makeLoopConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return {
    loop_type: "harness",
    phase: 91,
    max_iterations: 3,
    mode: "afk",
    soft_stop_percent: 80,
    stale_threshold: 2,
    promotion_threshold: 3,
    ...overrides,
  };
}

describe("buildIterationMetrics", () => {
  test("extracts correct fields from loop result", () => {
    const result = makeLoopResult();
    const config = makeLoopConfig();

    const metrics = buildIterationMetrics(result, config);

    expect(metrics).not.toBeNull();
    expect(metrics!.phase).toBe(91);
    expect(metrics!.loop).toBe("harness");
    expect(metrics!.actual_iteration_count).toBe(2);
    expect(metrics!.outcome).toBe("all_passed");
    expect(metrics!.stall_events).toBe(0);
    expect(metrics!.debate_changed_outcome).toBe(false);
    expect(metrics!.timestamp).toBeTruthy();
  });

  test("counts stall events from iteration history", () => {
    const result = makeLoopResult({
      outcome: "convergence_failure",
      history: {
        phase: 91,
        loop: "harness",
        iterations: [
          {
            tag: "iter/91/harness/1",
            phase: 91,
            loop: "harness",
            iteration: 1,
            error_count: 3,
            error_delta: 0,
            error_fingerprints: ["fp1"],
            convergence_status: "stalled",
            stale_count: 1,
            permanent_errors: [],
            correctable_errors: ["fp1"],
            transient_errors: [],
            artifacts_delta: 0,
            commit_hash: "abc",
            agent_invoked: "lu-executor",
            duration_ms: 5000,
            timestamp: "2026-03-03T12:00:00Z",
          },
          {
            tag: "iter/91/harness/2",
            phase: 91,
            loop: "harness",
            iteration: 2,
            error_count: 3,
            error_delta: 0,
            error_fingerprints: ["fp1"],
            convergence_status: "stalled",
            stale_count: 2,
            permanent_errors: [],
            correctable_errors: ["fp1"],
            transient_errors: [],
            artifacts_delta: 0,
            commit_hash: "def",
            agent_invoked: "lu-executor",
            duration_ms: 4000,
            timestamp: "2026-03-03T12:01:00Z",
          },
        ],
        fingerprint_ledger: { fp1: 2 },
      },
    });
    const config = makeLoopConfig();

    const metrics = buildIterationMetrics(result, config);
    expect(metrics).not.toBeNull();
    expect(metrics!.stall_events).toBe(2);
  });

  test("records debate_changed_outcome when true", () => {
    const result = makeLoopResult();
    const config = makeLoopConfig();

    const metrics = buildIterationMetrics(result, config, true);
    expect(metrics).not.toBeNull();
    expect(metrics!.debate_changed_outcome).toBe(true);
  });
});

describe("buildPlanQualityMetrics", () => {
  test("constructs valid plan quality metrics", () => {
    const metrics = buildPlanQualityMetrics(
      "91-A",
      91,
      8.5,
      "MODERATE",
      120000,
      "success",
      0,
    );

    expect(metrics).not.toBeNull();
    expect(metrics!.plan_id).toBe("91-A");
    expect(metrics!.phase).toBe(91);
    expect(metrics!.wsjf_score).toBe(8.5);
    expect(metrics!.complexity).toBe("MODERATE");
    expect(metrics!.execution_duration_ms).toBe(120000);
    expect(metrics!.outcome).toBe("success");
    expect(metrics!.gap_count).toBe(0);
    expect(metrics!.timestamp).toBeTruthy();
  });
});

describe("buildReviewMetrics", () => {
  test("aggregates findings by severity and agent", () => {
    const findings = [
      { severity: "HIGH", source_agent: "dx-advocate" },
      { severity: "MEDIUM", source_agent: "dx-advocate" },
      { severity: "HIGH", source_agent: "code-simplifier" },
      { severity: "low", source_agent: "code-architect" },
    ];

    const metrics = buildReviewMetrics(91, findings);

    expect(metrics).not.toBeNull();
    expect(metrics!.phase).toBe(91);
    expect(metrics!.reviewer_count).toBe(3);
    expect(metrics!.total_issues).toBe(4);
    expect(metrics!.issues_by_severity).toEqual({
      HIGH: 2,
      MEDIUM: 1,
      LOW: 1,
    });
    expect(metrics!.issues_by_agent).toEqual({
      "dx-advocate": 2,
      "code-simplifier": 1,
      "code-architect": 1,
    });
    expect(metrics!.debate_enabled).toBe(false);
    expect(metrics!.disagreements_detected).toBe(0);
  });

  test("handles empty findings", () => {
    const metrics = buildReviewMetrics(91, []);

    expect(metrics).not.toBeNull();
    expect(metrics!.reviewer_count).toBe(0);
    expect(metrics!.total_issues).toBe(0);
    expect(metrics!.issues_by_severity).toEqual({});
    expect(metrics!.issues_by_agent).toEqual({});
  });

  test("records debate fields when provided", () => {
    const metrics = buildReviewMetrics(91, [], true, 3);

    expect(metrics).not.toBeNull();
    expect(metrics!.debate_enabled).toBe(true);
    expect(metrics!.disagreements_detected).toBe(3);
  });
});

describe("buildConvergenceMetrics", () => {
  test("maps convergence result to metrics (halt case)", () => {
    const convergenceResult: ConvergenceResult = {
      signals: {
        error_count_delta: 0,
        fingerprint_overlap: 0.95,
        artifact_change_delta: 0,
      },
      status: "stalled",
      consecutive_stale: 2,
      should_halt: true,
    };

    const metrics = buildConvergenceMetrics(91, convergenceResult, "harness");

    expect(metrics).not.toBeNull();
    expect(metrics!.phase).toBe(91);
    expect(metrics!.loop).toBe("harness");
    expect(metrics!.premature_halt).toBe(true);
    expect(metrics!.total_stale_count).toBe(2);
    expect(metrics!.signals_at_halt).toEqual({
      error_count_delta: 0,
      fingerprint_overlap: 0.95,
      artifact_change_delta: 0,
    });
    expect(metrics!.debate_override).toBe(false);
  });

  test("maps convergence result to metrics (no halt case)", () => {
    const convergenceResult: ConvergenceResult = {
      signals: {
        error_count_delta: -2,
        fingerprint_overlap: 0.3,
        artifact_change_delta: 5,
      },
      status: "improved",
      consecutive_stale: 0,
      should_halt: false,
    };

    const metrics = buildConvergenceMetrics(91, convergenceResult, "verify");

    expect(metrics).not.toBeNull();
    expect(metrics!.premature_halt).toBe(false);
    expect(metrics!.signals_at_halt).toBeUndefined();
  });

  test("records debate override", () => {
    const convergenceResult: ConvergenceResult = {
      signals: {
        error_count_delta: 0,
        fingerprint_overlap: 0.9,
        artifact_change_delta: 0,
      },
      status: "stalled",
      consecutive_stale: 2,
      should_halt: true,
    };

    const metrics = buildConvergenceMetrics(
      91,
      convergenceResult,
      "harness",
      true,
    );
    expect(metrics).not.toBeNull();
    expect(metrics!.debate_override).toBe(true);
  });
});

describe("appendMetrics", () => {
  test("creates new file when absent", async () => {
    const entry = {
      phase: 91,
      loop: "harness",
      actual_iteration_count: 2,
      outcome: "all_passed",
      stall_events: 0,
      debate_changed_outcome: false,
      timestamp: "2026-03-03T12:00:00Z",
    };

    await appendMetrics(TEST_METRICS_PATH, entry, "iteration_metrics");

    expect(existsSync(TEST_METRICS_PATH)).toBe(true);
    const raw = readFileSync(TEST_METRICS_PATH, "utf-8");
    const parsed = metricsFileSchema.parse(JSON.parse(raw));
    expect(parsed.iteration_metrics).toHaveLength(1);
    expect(parsed.iteration_metrics[0]!.phase).toBe(91);
  });

  test("appends to existing file", async () => {
    const entry1 = {
      phase: 91,
      loop: "harness",
      actual_iteration_count: 2,
      outcome: "all_passed",
      stall_events: 0,
      timestamp: "2026-03-03T12:00:00Z",
    };
    const entry2 = {
      phase: 91,
      loop: "verify",
      actual_iteration_count: 1,
      outcome: "convergence_failure",
      stall_events: 2,
      timestamp: "2026-03-03T12:01:00Z",
    };

    await appendMetrics(TEST_METRICS_PATH, entry1, "iteration_metrics");
    await appendMetrics(TEST_METRICS_PATH, entry2, "iteration_metrics");

    const raw = readFileSync(TEST_METRICS_PATH, "utf-8");
    const parsed = metricsFileSchema.parse(JSON.parse(raw));
    expect(parsed.iteration_metrics).toHaveLength(2);
  });

  test("appends to different categories", async () => {
    const iterEntry = {
      phase: 91,
      loop: "harness",
      actual_iteration_count: 2,
      outcome: "all_passed",
      stall_events: 0,
      timestamp: "2026-03-03T12:00:00Z",
    };
    const planEntry = {
      plan_id: "91-A",
      phase: 91,
      complexity: "MODERATE",
      outcome: "success",
      timestamp: "2026-03-03T12:00:00Z",
    };

    await appendMetrics(TEST_METRICS_PATH, iterEntry, "iteration_metrics");
    await appendMetrics(TEST_METRICS_PATH, planEntry, "plan_quality_metrics");

    const raw = readFileSync(TEST_METRICS_PATH, "utf-8");
    const parsed = metricsFileSchema.parse(JSON.parse(raw));
    expect(parsed.iteration_metrics).toHaveLength(1);
    expect(parsed.plan_quality_metrics).toHaveLength(1);
  });

  test("rejects invalid data for category", async () => {
    const badEntry = {
      invalid_field: "bad",
    };

    expect(
      appendMetrics(TEST_METRICS_PATH, badEntry, "iteration_metrics"),
    ).rejects.toThrow();
  });
});
