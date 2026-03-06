import { describe, test, expect } from "bun:test";
import {
  assessComplexityAccuracy,
  tuneComplexityModel,
  ComplexityPredictionRecordSchema,
  ComplexityAccuracyResultSchema,
  ComplexityTuningResultSchema,
} from "../../../src/complexity/__helpers/self-tuning";
import type { ComplexityPredictionRecord } from "../../../src/complexity/__helpers/self-tuning";

// ─── Schema Validation ──────────────────────────────────────────────────────

describe("ComplexityPredictionRecordSchema", () => {
  test("accepts valid record", () => {
    const result = ComplexityPredictionRecordSchema.safeParse({
      task_id: "t1",
      predicted: "COMPLEX",
      actual: "MODERATE",
      predicted_at: "2026-03-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid complexity level", () => {
    const result = ComplexityPredictionRecordSchema.safeParse({
      task_id: "t1",
      predicted: "INVALID",
      actual: "MODERATE",
      predicted_at: "2026-03-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  test("accepts optional fields", () => {
    const result = ComplexityPredictionRecordSchema.safeParse({
      task_id: "t1",
      predicted: "SIMPLE",
      actual: "SIMPLE",
      predicted_at: "2026-03-01T00:00:00Z",
      actual_file_count: 3,
      actual_iterations: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actual_file_count).toBe(3);
      expect(result.data.actual_iterations).toBe(2);
    }
  });
});

// ─── assessComplexityAccuracy ───────────────────────────────────────────────

describe("assessComplexityAccuracy", () => {
  test("exact match returns distance 0", () => {
    const result = assessComplexityAccuracy("MODERATE", "MODERATE", "t1");
    expect(result.exact_match).toBe(true);
    expect(result.distance).toBe(0);
    expect(result.direction).toBe("exact");
    expect(result.task_id).toBe("t1");
  });

  test("over-prediction returns positive distance", () => {
    const result = assessComplexityAccuracy("COMPLEX", "SIMPLE");
    // COMPLEX=3, SIMPLE=1, distance=2
    expect(result.exact_match).toBe(false);
    expect(result.distance).toBe(2);
    expect(result.direction).toBe("over");
  });

  test("under-prediction returns negative distance", () => {
    const result = assessComplexityAccuracy("TRIVIAL", "COMPLEX");
    // TRIVIAL=0, COMPLEX=3, distance=-3
    expect(result.exact_match).toBe(false);
    expect(result.distance).toBe(-3);
    expect(result.direction).toBe("under");
  });

  test("one level over-prediction", () => {
    const result = assessComplexityAccuracy("MODERATE", "SIMPLE");
    expect(result.distance).toBe(1);
    expect(result.direction).toBe("over");
  });

  test("one level under-prediction", () => {
    const result = assessComplexityAccuracy("SIMPLE", "MODERATE");
    expect(result.distance).toBe(-1);
    expect(result.direction).toBe("under");
  });

  test("maximum possible distance (CRITICAL vs TRIVIAL)", () => {
    const result = assessComplexityAccuracy("CRITICAL", "TRIVIAL");
    expect(result.distance).toBe(4);
    expect(result.direction).toBe("over");
  });

  test("default task_id is empty string", () => {
    const result = assessComplexityAccuracy("SIMPLE", "SIMPLE");
    expect(result.task_id).toBe("");
  });

  test("result conforms to schema", () => {
    const result = assessComplexityAccuracy("COMPLEX", "MODERATE", "t1");
    const parseResult = ComplexityAccuracyResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });
});

// ─── tuneComplexityModel ────────────────────────────────────────────────────

describe("tuneComplexityModel", () => {
  test("empty history returns zero metrics with insufficient data recommendation", () => {
    const result = tuneComplexityModel([]);
    expect(result.total_predictions).toBe(0);
    expect(result.exact_matches).toBe(0);
    expect(result.accuracy_rate).toBe(0);
    expect(result.mean_distance).toBe(0);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toContain("Insufficient data");
  });

  test("perfect predictions yield 100% accuracy", () => {
    const history: ComplexityPredictionRecord[] = [
      {
        task_id: "t1",
        predicted: "SIMPLE",
        actual: "SIMPLE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t2",
        predicted: "COMPLEX",
        actual: "COMPLEX",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t3",
        predicted: "MODERATE",
        actual: "MODERATE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
    ];

    const result = tuneComplexityModel(history);
    expect(result.total_predictions).toBe(3);
    expect(result.exact_matches).toBe(3);
    expect(result.accuracy_rate).toBe(1);
    expect(result.mean_distance).toBe(0);
    expect(result.recommendations[0]).toContain("good");
  });

  test("systematic over-prediction detected", () => {
    const history: ComplexityPredictionRecord[] = [
      {
        task_id: "t1",
        predicted: "CRITICAL",
        actual: "SIMPLE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t2",
        predicted: "COMPLEX",
        actual: "TRIVIAL",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t3",
        predicted: "COMPLEX",
        actual: "SIMPLE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
    ];

    const result = tuneComplexityModel(history);
    expect(result.accuracy_rate).toBe(0);
    expect(result.mean_distance).toBeGreaterThan(0.5);
    expect(
      result.recommendations.some((r) => r.includes("over-prediction")),
    ).toBe(true);
  });

  test("systematic under-prediction detected", () => {
    const history: ComplexityPredictionRecord[] = [
      {
        task_id: "t1",
        predicted: "TRIVIAL",
        actual: "COMPLEX",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t2",
        predicted: "SIMPLE",
        actual: "CRITICAL",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t3",
        predicted: "TRIVIAL",
        actual: "MODERATE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
    ];

    const result = tuneComplexityModel(history);
    expect(result.mean_distance).toBeLessThan(-0.5);
    expect(
      result.recommendations.some((r) => r.includes("under-prediction")),
    ).toBe(true);
  });

  test("per-level breakdown is computed correctly", () => {
    const history: ComplexityPredictionRecord[] = [
      {
        task_id: "t1",
        predicted: "COMPLEX",
        actual: "COMPLEX",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t2",
        predicted: "COMPLEX",
        actual: "SIMPLE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t3",
        predicted: "SIMPLE",
        actual: "SIMPLE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
    ];

    const result = tuneComplexityModel(history);

    const complexLevel = result.per_level.find((l) => l.level === "COMPLEX");
    expect(complexLevel!.predictions).toBe(2);
    expect(complexLevel!.exact).toBe(1);
    expect(complexLevel!.over).toBe(1);
    expect(complexLevel!.under).toBe(0);

    const simpleLevel = result.per_level.find((l) => l.level === "SIMPLE");
    expect(simpleLevel!.predictions).toBe(1);
    expect(simpleLevel!.exact).toBe(1);
  });

  test("mixed accuracy scenario", () => {
    const history: ComplexityPredictionRecord[] = [
      {
        task_id: "t1",
        predicted: "SIMPLE",
        actual: "SIMPLE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
      {
        task_id: "t2",
        predicted: "COMPLEX",
        actual: "MODERATE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
    ];

    const result = tuneComplexityModel(history);
    expect(result.total_predictions).toBe(2);
    expect(result.exact_matches).toBe(1);
    expect(result.accuracy_rate).toBe(0.5);
    // mean_distance: (0 + 1) / 2 = 0.5
    expect(result.mean_distance).toBe(0.5);
  });

  test("result conforms to schema", () => {
    const history: ComplexityPredictionRecord[] = [
      {
        task_id: "t1",
        predicted: "MODERATE",
        actual: "MODERATE",
        predicted_at: "2026-03-01T00:00:00Z",
      },
    ];

    const result = tuneComplexityModel(history);
    const parseResult = ComplexityTuningResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });

  test("per-level recommendations for consistently mispredicted levels", () => {
    // 4 COMPLEX predictions, all over-predicted (actual was lower)
    const history: ComplexityPredictionRecord[] = Array.from(
      { length: 4 },
      (_, i) => ({
        task_id: `t${i}`,
        predicted: "COMPLEX" as const,
        actual: "SIMPLE" as const,
        predicted_at: "2026-03-01T00:00:00Z",
      }),
    );

    const result = tuneComplexityModel(history);
    expect(
      result.recommendations.some(
        (r) => r.includes("COMPLEX") && r.includes("over-predicted"),
      ),
    ).toBe(true);
  });
});
