/**
 * Tests for the Token Cost Model (Plan 18-05).
 *
 * Covers:
 * - getColdStartCost: lookup per complexity level, unknown fallback
 * - createCostEstimate: cold_start vs calibrated source, Zod defaults
 * - calibrateCost: rolling average, source transition, immutability
 * - buildCostTable: all 5 levels, cold-start defaults, calibration merging
 * - formatCostTableForMemory: valid markdown, all levels, N/A for missing actual
 */

import { describe, expect, test } from "bun:test";

import {
  getColdStartCost,
  createCostEstimate,
  calibrateCost,
  buildCostTable,
  formatCostTableForMemory,
} from "../../../src/planner/cost-model";

import type { TokenCostEstimate } from "~/planner/planner.schemas";

/* ------------------------------------------------------------------ */
/*  getColdStartCost                                                   */
/* ------------------------------------------------------------------ */

describe("getColdStartCost", () => {
  test("returns 5 for TRIVIAL", () => {
    expect(getColdStartCost("TRIVIAL")).toBe(5);
  });

  test("returns 10 for SIMPLE", () => {
    expect(getColdStartCost("SIMPLE")).toBe(10);
  });

  test("returns 20 for MODERATE", () => {
    expect(getColdStartCost("MODERATE")).toBe(20);
  });

  test("returns 35 for COMPLEX", () => {
    expect(getColdStartCost("COMPLEX")).toBe(35);
  });

  test("returns 50 for CRITICAL", () => {
    expect(getColdStartCost("CRITICAL")).toBe(50);
  });

  test("returns 20 (MODERATE fallback) for unknown complexity", () => {
    expect(getColdStartCost("UNKNOWN")).toBe(20);
    expect(getColdStartCost("foo")).toBe(20);
    expect(getColdStartCost("")).toBe(20);
  });
});

/* ------------------------------------------------------------------ */
/*  createCostEstimate                                                 */
/* ------------------------------------------------------------------ */

describe("createCostEstimate", () => {
  test("creates cold_start estimate when no estimatedPercent given", () => {
    const est = createCostEstimate("COMPLEX");
    expect(est.complexity).toBe("COMPLEX");
    expect(est.estimated_context_percent).toBe(35);
    expect(est.source).toBe("cold_start");
    expect(est.sample_count).toBe(0);
  });

  test("creates calibrated estimate when estimatedPercent given", () => {
    const est = createCostEstimate("COMPLEX", 28);
    expect(est.complexity).toBe("COMPLEX");
    expect(est.estimated_context_percent).toBe(28);
    expect(est.source).toBe("calibrated");
    expect(est.sample_count).toBe(1);
  });

  test("uses cold-start default for unknown complexity", () => {
    const est = createCostEstimate("UNKNOWN");
    expect(est.estimated_context_percent).toBe(20); // MODERATE fallback
    expect(est.source).toBe("cold_start");
  });

  test("actual_context_percent is undefined for cold-start", () => {
    const est = createCostEstimate("TRIVIAL");
    expect(est.actual_context_percent).toBeUndefined();
  });

  test("Zod defaults are applied correctly", () => {
    const est = createCostEstimate("SIMPLE");
    expect(est.sample_count).toBe(0);
    expect(est.source).toBe("cold_start");
  });
});

/* ------------------------------------------------------------------ */
/*  calibrateCost                                                      */
/* ------------------------------------------------------------------ */

describe("calibrateCost", () => {
  test("first calibration from cold-start: new estimate equals actual", () => {
    const cold = createCostEstimate("COMPLEX"); // est=35, samples=0
    const cal = calibrateCost(cold, 30);

    // (35 * 0 + 30) / (0 + 1) = 30
    expect(cal.estimated_context_percent).toBe(30);
    expect(cal.sample_count).toBe(1);
    expect(cal.source).toBe("calibrated");
  });

  test("rolling average with 1 existing sample", () => {
    const cold = createCostEstimate("COMPLEX"); // est=35, samples=0
    const cal1 = calibrateCost(cold, 30); // est=30, samples=1
    const cal2 = calibrateCost(cal1, 28); // (30*1 + 28) / 2 = 29

    expect(cal2.estimated_context_percent).toBe(29);
    expect(cal2.sample_count).toBe(2);
  });

  test("rolling average with multiple samples", () => {
    let est = createCostEstimate("MODERATE"); // est=20, samples=0
    est = calibrateCost(est, 18); // (20*0 + 18)/1 = 18, samples=1
    est = calibrateCost(est, 22); // (18*1 + 22)/2 = 20, samples=2
    est = calibrateCost(est, 19); // (20*2 + 19)/3 = 19.666... => 19.7, samples=3

    expect(est.estimated_context_percent).toBe(19.7);
    expect(est.sample_count).toBe(3);
  });

  test("rounds to 1 decimal place", () => {
    let est = createCostEstimate("SIMPLE"); // est=10, samples=0
    est = calibrateCost(est, 7); // 7.0, samples=1
    est = calibrateCost(est, 8); // (7*1 + 8)/2 = 7.5, samples=2
    est = calibrateCost(est, 9); // (7.5*2 + 9)/3 = 8.0, samples=3

    expect(est.estimated_context_percent).toBe(8);
    expect(est.sample_count).toBe(3);
  });

  test("source transitions from cold_start to calibrated", () => {
    const cold = createCostEstimate("TRIVIAL");
    expect(cold.source).toBe("cold_start");

    const cal = calibrateCost(cold, 4);
    expect(cal.source).toBe("calibrated");
  });

  test("immutability: original estimate is not mutated", () => {
    const original = createCostEstimate("COMPLEX");
    const originalCopy = { ...original };

    const calibrated = calibrateCost(original, 30);

    // Original should be unchanged
    expect(original.estimated_context_percent).toBe(
      originalCopy.estimated_context_percent,
    );
    expect(original.sample_count).toBe(originalCopy.sample_count);
    expect(original.source).toBe(originalCopy.source);

    // Calibrated should be different
    expect(calibrated).not.toBe(original);
    expect(calibrated.estimated_context_percent).toBe(30);
  });

  test("actual_context_percent is set to the latest observation", () => {
    const cold = createCostEstimate("MODERATE");
    const cal = calibrateCost(cold, 25);
    expect(cal.actual_context_percent).toBe(25);

    const cal2 = calibrateCost(cal, 22);
    expect(cal2.actual_context_percent).toBe(22);
  });

  test("sample_count increments correctly", () => {
    let est = createCostEstimate("CRITICAL"); // samples=0
    expect(est.sample_count).toBe(0);

    est = calibrateCost(est, 45); // samples=1
    expect(est.sample_count).toBe(1);

    est = calibrateCost(est, 48); // samples=2
    expect(est.sample_count).toBe(2);

    est = calibrateCost(est, 42); // samples=3
    expect(est.sample_count).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/*  buildCostTable                                                     */
/* ------------------------------------------------------------------ */

describe("buildCostTable", () => {
  test("returns entries for all 5 complexity levels", () => {
    const table = buildCostTable();
    expect(Object.keys(table)).toHaveLength(5);
    expect(table["TRIVIAL"]).toBeDefined();
    expect(table["SIMPLE"]).toBeDefined();
    expect(table["MODERATE"]).toBeDefined();
    expect(table["COMPLEX"]).toBeDefined();
    expect(table["CRITICAL"]).toBeDefined();
  });

  test("cold-start defaults match COLD_START_COSTS", () => {
    const table = buildCostTable();
    expect(table["TRIVIAL"]!.estimated_context_percent).toBe(5);
    expect(table["SIMPLE"]!.estimated_context_percent).toBe(10);
    expect(table["MODERATE"]!.estimated_context_percent).toBe(20);
    expect(table["COMPLEX"]!.estimated_context_percent).toBe(35);
    expect(table["CRITICAL"]!.estimated_context_percent).toBe(50);
  });

  test("all entries have source cold_start by default", () => {
    const table = buildCostTable();
    for (const level of [
      "TRIVIAL",
      "SIMPLE",
      "MODERATE",
      "COMPLEX",
      "CRITICAL",
    ]) {
      expect(table[level]!.source).toBe("cold_start");
    }
  });

  test("merges calibrated values over cold-start defaults", () => {
    const calibrated = calibrateCost(createCostEstimate("COMPLEX"), 28);
    const table = buildCostTable({ COMPLEX: calibrated });

    // Calibrated entry should be used
    expect(table["COMPLEX"]!.estimated_context_percent).toBe(28);
    expect(table["COMPLEX"]!.source).toBe("calibrated");

    // Other entries should still be cold-start
    expect(table["TRIVIAL"]!.source).toBe("cold_start");
    expect(table["SIMPLE"]!.source).toBe("cold_start");
    expect(table["MODERATE"]!.source).toBe("cold_start");
    expect(table["CRITICAL"]!.source).toBe("cold_start");
  });

  test("multiple calibrations can be merged", () => {
    const calComplex = calibrateCost(createCostEstimate("COMPLEX"), 28);
    const calSimple = calibrateCost(createCostEstimate("SIMPLE"), 8);
    const table = buildCostTable({
      COMPLEX: calComplex,
      SIMPLE: calSimple,
    });

    expect(table["COMPLEX"]!.estimated_context_percent).toBe(28);
    expect(table["SIMPLE"]!.estimated_context_percent).toBe(8);
    expect(table["TRIVIAL"]!.source).toBe("cold_start");
    expect(table["MODERATE"]!.source).toBe("cold_start");
    expect(table["CRITICAL"]!.source).toBe("cold_start");
  });
});

/* ------------------------------------------------------------------ */
/*  formatCostTableForMemory                                           */
/* ------------------------------------------------------------------ */

describe("formatCostTableForMemory", () => {
  test("produces valid markdown with header and separator", () => {
    const table = buildCostTable();
    const md = formatCostTableForMemory(table);

    const lines = md.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(7); // header + separator + 5 rows

    // Header line
    expect(lines[0]).toContain("Complexity");
    expect(lines[0]).toContain("Estimated %");
    expect(lines[0]).toContain("Actual %");
    expect(lines[0]).toContain("Samples");
    expect(lines[0]).toContain("Source");

    // Separator line
    expect(lines[1]).toContain("---");
  });

  test("includes all 5 complexity levels", () => {
    const table = buildCostTable();
    const md = formatCostTableForMemory(table);

    expect(md).toContain("TRIVIAL");
    expect(md).toContain("SIMPLE");
    expect(md).toContain("MODERATE");
    expect(md).toContain("COMPLEX");
    expect(md).toContain("CRITICAL");
  });

  test("shows N/A for missing actual_context_percent", () => {
    const table = buildCostTable();
    const md = formatCostTableForMemory(table);

    // All cold-start entries should show N/A for actual
    expect(md).toContain("N/A");
  });

  test("shows actual value when present", () => {
    const calibrated = calibrateCost(createCostEstimate("COMPLEX"), 28);
    const table = buildCostTable({ COMPLEX: calibrated });
    const md = formatCostTableForMemory(table);

    // The COMPLEX row should contain the actual value (28.0)
    expect(md).toContain("28.0");
    // And still show "calibrated" source
    expect(md).toContain("calibrated");
  });

  test("displays correct estimated values", () => {
    const table = buildCostTable();
    const md = formatCostTableForMemory(table);

    expect(md).toContain("5.0"); // TRIVIAL
    expect(md).toContain("10.0"); // SIMPLE
    expect(md).toContain("20.0"); // MODERATE
    expect(md).toContain("35.0"); // COMPLEX
    expect(md).toContain("50.0"); // CRITICAL
  });
});
