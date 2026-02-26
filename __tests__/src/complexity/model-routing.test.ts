import { describe, test, expect } from "bun:test";
import {
  DEFAULT_COMPLEXITY_MATRIX,
  COMPLEXITY_LEVELS,
  ModelIdSchema,
} from "../../../src/complexity";

describe("model routing in complexity matrix", () => {
  test("every level has a default_model", () => {
    for (const level of COMPLEXITY_LEVELS) {
      const gate = DEFAULT_COMPLEXITY_MATRIX[level];
      expect(gate.default_model).toBeDefined();
      expect(ModelIdSchema.safeParse(gate.default_model).success).toBe(true);
    }
  });

  test("TRIVIAL defaults to haiku", () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.TRIVIAL.default_model).toBe("haiku");
  });

  test("SIMPLE defaults to haiku", () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.default_model).toBe("haiku");
  });

  test("MODERATE defaults to sonnet", () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.MODERATE.default_model).toBe("sonnet");
  });

  test("COMPLEX defaults to sonnet", () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.default_model).toBe("sonnet");
  });

  test("CRITICAL defaults to opus", () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.CRITICAL.default_model).toBe("opus");
  });

  test("model cost scales with complexity (haiku < sonnet < opus)", () => {
    const modelCost = (model: string): number => {
      const order: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2 };
      return order[model] ?? -1;
    };

    // Verify non-decreasing cost across the ordered levels
    expect(
      modelCost(DEFAULT_COMPLEXITY_MATRIX.TRIVIAL.default_model ?? ""),
    ).toBeLessThanOrEqual(
      modelCost(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.default_model ?? ""),
    );
    expect(
      modelCost(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.default_model ?? ""),
    ).toBeLessThanOrEqual(
      modelCost(DEFAULT_COMPLEXITY_MATRIX.MODERATE.default_model ?? ""),
    );
    expect(
      modelCost(DEFAULT_COMPLEXITY_MATRIX.MODERATE.default_model ?? ""),
    ).toBeLessThanOrEqual(
      modelCost(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.default_model ?? ""),
    );
    expect(
      modelCost(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.default_model ?? ""),
    ).toBeLessThanOrEqual(
      modelCost(DEFAULT_COMPLEXITY_MATRIX.CRITICAL.default_model ?? ""),
    );
  });
});

describe("ModelIdSchema", () => {
  test("accepts valid model ids", () => {
    expect(ModelIdSchema.safeParse("opus").success).toBe(true);
    expect(ModelIdSchema.safeParse("sonnet").success).toBe(true);
    expect(ModelIdSchema.safeParse("haiku").success).toBe(true);
  });

  test("rejects invalid model ids", () => {
    expect(ModelIdSchema.safeParse("gpt-4").success).toBe(false);
    expect(ModelIdSchema.safeParse("claude").success).toBe(false);
    expect(ModelIdSchema.safeParse("").success).toBe(false);
    expect(ModelIdSchema.safeParse(123).success).toBe(false);
  });
});
