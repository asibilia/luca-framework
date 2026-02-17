import { describe, test, expect } from "bun:test";
import {
  calculatePhaseQuality,
  scoreToZone,
} from "../../../src/memory/quality-scorer.ts";
import { phaseQualityMetricsSchema } from "../../../src/memory/types.ts";
import type { HarnessResult, CheckResult } from "../../../src/harness/types.ts";

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal CheckResult for testing. */
function createCheckResult(
  name: string,
  status: "passed" | "failed",
): CheckResult {
  return {
    name,
    status,
    exitCode: status === "passed" ? 0 : 1,
    errors: [],
    warnings: [],
    rawOutput: "",
    duration: 100,
  };
}

/** Create a HarnessResult with the specified check outcomes. */
function createHarnessResult(checks: {
  test?: "passed" | "failed";
  typecheck?: "passed" | "failed";
}): HarnessResult {
  const checkResults: CheckResult[] = [];
  const hasFailure = checks.test === "failed" || checks.typecheck === "failed";

  if (checks.test !== undefined) {
    checkResults.push(createCheckResult("test", checks.test));
  }
  if (checks.typecheck !== undefined) {
    checkResults.push(createCheckResult("typecheck", checks.typecheck));
  }

  return {
    status: hasFailure ? "failed" : "passed",
    checks: checkResults,
    totalErrors: hasFailure ? 1 : 0,
    totalWarnings: 0,
    duration: 200,
    timestamp: new Date().toISOString(),
  };
}

// ─── scoreToZone ───────────────────────────────────────────────────────────────

describe("scoreToZone", () => {
  test("score 1.0 -> peak", () => {
    expect(scoreToZone(1.0)).toBe("peak");
  });

  test("score 0.85 -> peak (boundary)", () => {
    expect(scoreToZone(0.85)).toBe("peak");
  });

  test("score 0.84 -> good", () => {
    expect(scoreToZone(0.84)).toBe("good");
  });

  test("score 0.65 -> good (boundary)", () => {
    expect(scoreToZone(0.65)).toBe("good");
  });

  test("score 0.64 -> degrading", () => {
    expect(scoreToZone(0.64)).toBe("degrading");
  });

  test("score 0.45 -> degrading (boundary)", () => {
    expect(scoreToZone(0.45)).toBe("degrading");
  });

  test("score 0.44 -> stop", () => {
    expect(scoreToZone(0.44)).toBe("stop");
  });

  test("score 0.0 -> stop", () => {
    expect(scoreToZone(0.0)).toBe("stop");
  });
});

// ─── Composite Calculation ─────────────────────────────────────────────────────

describe("composite calculation", () => {
  test("all components 1.0 -> composite 1.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 1,
      harness_result: createHarnessResult({
        test: "passed",
        typecheck: "passed",
      }),
      verification_status: "passed",
      learning_count: 5,
      complexity: "COMPLEX",
    });

    expect(metrics.composite_score).toBe(1.0);
    expect(metrics.zone).toBe("peak");
  });

  test("all components 0.0 -> composite 0.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 2,
      harness_result: createHarnessResult({
        test: "failed",
        typecheck: "failed",
      }),
      verification_status: "failed",
      learning_count: 0,
      complexity: "MODERATE",
    });

    expect(metrics.composite_score).toBe(0);
    expect(metrics.zone).toBe("stop");
  });

  test("only tests pass (1.0), rest 0 -> composite ~0.4", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 3,
      harness_result: createHarnessResult({
        test: "passed",
        typecheck: "failed",
      }),
      verification_status: "failed",
      learning_count: 0,
      complexity: "MODERATE",
    });

    // tests=1.0*0.4 + types=0.0*0.2 + verification=0.0*0.25 + learnings=0.0*0.15 = 0.4
    expect(metrics.composite_score).toBe(0.4);
  });

  test("only verification passes (1.0), rest 0 -> composite 0.25", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 4,
      harness_result: createHarnessResult({
        test: "failed",
        typecheck: "failed",
      }),
      verification_status: "passed",
      learning_count: 0,
      complexity: "MODERATE",
    });

    // tests=0.0*0.4 + types=0.0*0.2 + verification=1.0*0.25 + learnings=0.0*0.15 = 0.25
    expect(metrics.composite_score).toBe(0.25);
  });
});

// ─── Weight Verification ───────────────────────────────────────────────────────

describe("weight verification", () => {
  test("weights sum to 1.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 10,
      verification_status: "passed",
      learning_count: 1,
      complexity: "SIMPLE",
    });

    const { weights } = metrics;
    const sum =
      weights.tests + weights.types + weights.verification + weights.learnings;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  test("each weight matches documented values", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 11,
      verification_status: "passed",
      learning_count: 1,
      complexity: "SIMPLE",
    });

    expect(metrics.weights.tests).toBe(0.4);
    expect(metrics.weights.types).toBe(0.2);
    expect(metrics.weights.verification).toBe(0.25);
    expect(metrics.weights.learnings).toBe(0.15);
  });
});

// ─── Harness Integration ───────────────────────────────────────────────────────

describe("harness integration", () => {
  test("passed harness with all checks -> test and type scores 1.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 20,
      harness_result: createHarnessResult({
        test: "passed",
        typecheck: "passed",
      }),
      verification_status: "passed",
      learning_count: 3,
      complexity: "MODERATE",
    });

    expect(metrics.component_scores.tests).toBe(1.0);
    expect(metrics.component_scores.types).toBe(1.0);
  });

  test("failed harness with test failures -> test score 0.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 21,
      harness_result: createHarnessResult({
        test: "failed",
        typecheck: "passed",
      }),
      verification_status: "passed",
      learning_count: 3,
      complexity: "MODERATE",
    });

    expect(metrics.component_scores.tests).toBe(0.0);
    expect(metrics.component_scores.types).toBe(1.0);
  });

  test("no harness result -> component scores default to 0.5", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 22,
      verification_status: "passed",
      learning_count: 3,
      complexity: "MODERATE",
    });

    expect(metrics.component_scores.tests).toBe(0.5);
    expect(metrics.component_scores.types).toBe(0.5);
  });
});

// ─── Verification Status Mapping ───────────────────────────────────────────────

describe("verification status mapping", () => {
  test("passed -> 1.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 30,
      verification_status: "passed",
      learning_count: 0,
      complexity: "SIMPLE",
    });
    expect(metrics.component_scores.verification).toBe(1.0);
  });

  test("partial -> 0.5", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 31,
      verification_status: "partial",
      learning_count: 0,
      complexity: "SIMPLE",
    });
    expect(metrics.component_scores.verification).toBe(0.5);
  });

  test("failed -> 0.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 32,
      verification_status: "failed",
      learning_count: 0,
      complexity: "SIMPLE",
    });
    expect(metrics.component_scores.verification).toBe(0.0);
  });

  test("skipped -> 0.5", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 33,
      verification_status: "skipped",
      learning_count: 0,
      complexity: "SIMPLE",
    });
    expect(metrics.component_scores.verification).toBe(0.5);
  });
});

// ─── Learning Score with Complexity Scaling ─────────────────────────────────────

describe("learning score with complexity scaling", () => {
  test("MODERATE with 3 learnings -> 1.0 (meets expectation)", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 40,
      verification_status: "passed",
      learning_count: 3,
      complexity: "MODERATE",
    });
    expect(metrics.component_scores.learnings).toBe(1.0);
  });

  test("MODERATE with 1 learning -> ~0.333", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 41,
      verification_status: "passed",
      learning_count: 1,
      complexity: "MODERATE",
    });
    expect(metrics.component_scores.learnings).toBeCloseTo(0.333, 2);
  });

  test("COMPLEX with 5 learnings -> 1.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 42,
      verification_status: "passed",
      learning_count: 5,
      complexity: "COMPLEX",
    });
    expect(metrics.component_scores.learnings).toBe(1.0);
  });

  test("any complexity with 0 learnings -> 0.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 43,
      verification_status: "passed",
      learning_count: 0,
      complexity: "MODERATE",
    });
    expect(metrics.component_scores.learnings).toBe(0);
  });

  test("MODERATE with more learnings than expected is capped at 1.0", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 44,
      verification_status: "passed",
      learning_count: 10,
      complexity: "MODERATE",
    });
    expect(metrics.component_scores.learnings).toBe(1.0);
  });
});

// ─── Schema Validation ─────────────────────────────────────────────────────────

describe("schema validation", () => {
  test("output is valid PhaseQualityMetrics per schema", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 50,
      harness_result: createHarnessResult({
        test: "passed",
        typecheck: "passed",
      }),
      verification_status: "passed",
      learning_count: 3,
      complexity: "MODERATE",
    });

    // Should not throw
    const parsed = phaseQualityMetricsSchema.parse(metrics);
    expect(parsed.phase_id).toBe(50);
    expect(parsed.zone).toBeDefined();
    expect(parsed.composite_score).toBeGreaterThanOrEqual(0);
    expect(parsed.composite_score).toBeLessThanOrEqual(1);
  });

  test("timestamp is a valid ISO string", () => {
    const metrics = calculatePhaseQuality({
      phase_id: 51,
      verification_status: "passed",
      learning_count: 1,
      complexity: "SIMPLE",
    });

    const date = new Date(metrics.timestamp);
    expect(date.toString()).not.toBe("Invalid Date");
  });
});
