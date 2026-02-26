import { describe, test, expect } from "bun:test";
import {
  createQualityTrend,
  addPhaseMetrics,
  computeRollingAverage,
  detectRegression,
  serializeTrend,
  deserializeTrend,
} from "../../../src/memory/quality-trend.ts";
import { phaseQualityMetricsSchema } from "~/memory/memory.schemas";
import type { PhaseQualityMetrics } from "~/memory/memory.schemas";

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal PhaseQualityMetrics with given composite score. */
function createMetrics(
  phaseId: number,
  compositeScore: number,
): PhaseQualityMetrics {
  return phaseQualityMetricsSchema.parse({
    phase_id: phaseId,
    composite_score: compositeScore,
    zone:
      compositeScore >= 0.85
        ? "peak"
        : compositeScore >= 0.65
          ? "good"
          : compositeScore >= 0.45
            ? "degrading"
            : "stop",
    component_scores: {
      tests: compositeScore,
      types: compositeScore,
      verification: compositeScore,
      learnings: compositeScore,
    },
    weights: {
      tests: 0.4,
      types: 0.2,
      verification: 0.25,
      learnings: 0.15,
    },
    timestamp: new Date().toISOString(),
  });
}

// ─── createQualityTrend ────────────────────────────────────────────────────────

describe("createQualityTrend", () => {
  test("default window size is 5", () => {
    const trend = createQualityTrend();
    expect(trend.window_size).toBe(5);
  });

  test("custom window size is respected", () => {
    const trend = createQualityTrend(10);
    expect(trend.window_size).toBe(10);
  });

  test("initial state has empty phases, 0 rolling average, no regression", () => {
    const trend = createQualityTrend();
    expect(trend.phases).toHaveLength(0);
    expect(trend.rolling_average).toBe(0);
    expect(trend.regression_detected).toBe(false);
    expect(trend.regression_details).toBeUndefined();
  });
});

// ─── addPhaseMetrics (immutability) ────────────────────────────────────────────

describe("addPhaseMetrics", () => {
  test("returns new object (original unchanged)", () => {
    const original = createQualityTrend();
    const metrics = createMetrics(1, 0.9);

    const updated = addPhaseMetrics(original, metrics);

    // Original should not be mutated
    expect(original.phases).toHaveLength(0);
    expect(original.rolling_average).toBe(0);

    // Updated should have the new phase
    expect(updated.phases).toHaveLength(1);
    expect(updated).not.toBe(original);
  });

  test("phases array grows by 1", () => {
    let trend = createQualityTrend();
    trend = addPhaseMetrics(trend, createMetrics(1, 0.8));
    expect(trend.phases).toHaveLength(1);

    trend = addPhaseMetrics(trend, createMetrics(2, 0.7));
    expect(trend.phases).toHaveLength(2);
  });

  test("rolling average updates correctly", () => {
    let trend = createQualityTrend();
    trend = addPhaseMetrics(trend, createMetrics(1, 0.8));
    expect(trend.rolling_average).toBeCloseTo(0.8, 2);

    trend = addPhaseMetrics(trend, createMetrics(2, 0.6));
    expect(trend.rolling_average).toBeCloseTo(0.7, 2);
  });

  test("works with first phase (no prior data)", () => {
    const trend = createQualityTrend();
    const metrics = createMetrics(1, 0.85);
    const updated = addPhaseMetrics(trend, metrics);

    expect(updated.phases).toHaveLength(1);
    expect(updated.rolling_average).toBeCloseTo(0.85, 2);
    expect(updated.regression_detected).toBe(false);
  });
});

// ─── computeRollingAverage ─────────────────────────────────────────────────────

describe("computeRollingAverage", () => {
  test("empty array returns 0", () => {
    expect(computeRollingAverage([], 5)).toBe(0);
  });

  test("single phase returns that phase's score", () => {
    const phases = [createMetrics(1, 0.75)];
    expect(computeRollingAverage(phases, 5)).toBeCloseTo(0.75, 10);
  });

  test("5 phases with window 5: average of all 5", () => {
    const phases = [
      createMetrics(1, 0.8),
      createMetrics(2, 0.7),
      createMetrics(3, 0.9),
      createMetrics(4, 0.6),
      createMetrics(5, 0.5),
    ];
    // (0.8 + 0.7 + 0.9 + 0.6 + 0.5) / 5 = 3.5 / 5 = 0.7
    expect(computeRollingAverage(phases, 5)).toBeCloseTo(0.7, 10);
  });

  test("7 phases with window 5: average of last 5 only", () => {
    const phases = [
      createMetrics(1, 1.0), // excluded from window
      createMetrics(2, 1.0), // excluded from window
      createMetrics(3, 0.8),
      createMetrics(4, 0.7),
      createMetrics(5, 0.9),
      createMetrics(6, 0.6),
      createMetrics(7, 0.5),
    ];
    // (0.8 + 0.7 + 0.9 + 0.6 + 0.5) / 5 = 3.5 / 5 = 0.7
    expect(computeRollingAverage(phases, 5)).toBeCloseTo(0.7, 10);
  });

  test("all phases score 0.8 -> average is 0.8", () => {
    const phases = Array.from({ length: 5 }, (_, i) =>
      createMetrics(i + 1, 0.8),
    );
    expect(computeRollingAverage(phases, 5)).toBeCloseTo(0.8, 10);
  });
});

// ─── detectRegression ──────────────────────────────────────────────────────────

describe("detectRegression", () => {
  test("fewer than 3 phases -> no regression", () => {
    const phases = [createMetrics(1, 0.8), createMetrics(2, 0.2)];
    const result = detectRegression(phases, 0.5, 5);
    expect(result.detected).toBe(false);
  });

  test("current score 0.2 below rolling average -> regression detected", () => {
    const phases = [
      createMetrics(1, 0.8),
      createMetrics(2, 0.8),
      createMetrics(3, 0.5), // 0.3 below average of ~0.7
    ];
    const rollingAvg = computeRollingAverage(phases, 5);
    const result = detectRegression(phases, rollingAvg, 5);
    expect(result.detected).toBe(true);
    expect(result.details).toBeDefined();
    expect(result.details!.length).toBeGreaterThan(0);
  });

  test("current score 0.1 below rolling average -> no regression (below threshold)", () => {
    const phases = [
      createMetrics(1, 0.8),
      createMetrics(2, 0.8),
      createMetrics(3, 0.7), // only 0.1 below avg ~0.767
    ];
    const rollingAvg = computeRollingAverage(phases, 5);
    const result = detectRegression(phases, rollingAvg, 5);
    expect(result.detected).toBe(false);
  });

  test("two consecutive declining phases -> regression detected", () => {
    const phases = [
      createMetrics(1, 0.8),
      createMetrics(2, 0.75),
      createMetrics(3, 0.7), // declining: 0.8 > 0.75 > 0.7
    ];
    const rollingAvg = computeRollingAverage(phases, 5);
    const result = detectRegression(phases, rollingAvg, 5);
    expect(result.detected).toBe(true);
    expect(result.details).toContain("consecutive declining");
  });

  test("details string describes the regression", () => {
    const phases = [
      createMetrics(1, 0.9),
      createMetrics(2, 0.9),
      createMetrics(3, 0.5),
    ];
    const rollingAvg = computeRollingAverage(phases, 5);
    const result = detectRegression(phases, rollingAvg, 5);
    expect(result.detected).toBe(true);
    expect(result.details).toContain("regression");
  });

  test("stable scores -> no regression", () => {
    const phases = [
      createMetrics(1, 0.8),
      createMetrics(2, 0.8),
      createMetrics(3, 0.8),
    ];
    const rollingAvg = computeRollingAverage(phases, 5);
    const result = detectRegression(phases, rollingAvg, 5);
    expect(result.detected).toBe(false);
  });

  test("improving scores -> no regression", () => {
    const phases = [
      createMetrics(1, 0.6),
      createMetrics(2, 0.7),
      createMetrics(3, 0.8),
    ];
    const rollingAvg = computeRollingAverage(phases, 5);
    const result = detectRegression(phases, rollingAvg, 5);
    expect(result.detected).toBe(false);
  });
});

// ─── Serialization roundtrip ───────────────────────────────────────────────────

describe("serialization", () => {
  test("deserializeTrend(serializeTrend(trend)) produces identical data", () => {
    let trend = createQualityTrend(3);
    trend = addPhaseMetrics(trend, createMetrics(1, 0.9));
    trend = addPhaseMetrics(trend, createMetrics(2, 0.8));

    const json = serializeTrend(trend);
    const result = deserializeTrend(json);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toHaveLength(2);
      expect(result.data.rolling_average).toBeCloseTo(
        trend.rolling_average,
        10,
      );
      expect(result.data.window_size).toBe(3);
      expect(result.data.regression_detected).toBe(trend.regression_detected);
    }
  });

  test("invalid JSON returns success: false", () => {
    const result = deserializeTrend("not valid json {{{");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Failed to parse JSON");
    }
  });

  test("valid JSON but wrong schema returns success: false", () => {
    const result = deserializeTrend(
      JSON.stringify({ wrong: "schema", missing: "fields" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid QualityTrend schema");
    }
  });

  test("serializeTrend produces valid JSON", () => {
    const trend = createQualityTrend();
    const json = serializeTrend(trend);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test("empty trend serializes and deserializes", () => {
    const trend = createQualityTrend();
    const json = serializeTrend(trend);
    const result = deserializeTrend(json);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toHaveLength(0);
      expect(result.data.rolling_average).toBe(0);
    }
  });
});
