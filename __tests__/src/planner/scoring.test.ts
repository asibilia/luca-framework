/**
 * Tests for the WSJF Scoring Engine (Plan 18-02).
 *
 * Covers:
 * - computeWSJF: formula correctness, edge cases, division by zero
 * - effortFromComplexity: known levels, unknown strings, case sensitivity
 * - rankByWSJF: ordering, tiebreaker, immutability, edge cases
 * - scoreItem: end-to-end convenience function
 */

import { describe, expect, test } from "bun:test";

import {
  computeWSJF,
  effortFromComplexity,
  rankByWSJF,
  scoreItem,
} from "../../../src/planner/__helpers/scoring";

import type { WSJFScoredItem } from "~/planner/__schemas/planner.schemas";

/* ------------------------------------------------------------------ */
/*  computeWSJF                                                       */
/* ------------------------------------------------------------------ */

describe("computeWSJF", () => {
  test("standard: (8+5+3)/5 = 3.2", () => {
    const score = computeWSJF({
      business_value: 8,
      time_criticality: 5,
      risk_reduction: 3,
      effort_points: 5,
    });
    expect(score).toBe(3.2);
  });

  test("all max: (10+10+10)/1 = 30", () => {
    const score = computeWSJF({
      business_value: 10,
      time_criticality: 10,
      risk_reduction: 10,
      effort_points: 1,
    });
    expect(score).toBe(30);
  });

  test("all min: (1+1+1)/8 = 0.375", () => {
    const score = computeWSJF({
      business_value: 1,
      time_criticality: 1,
      risk_reduction: 1,
      effort_points: 8,
    });
    expect(score).toBe(0.375);
  });

  test("division by zero: effort_points=0 returns 0", () => {
    const score = computeWSJF({
      business_value: 10,
      time_criticality: 10,
      risk_reduction: 10,
      effort_points: 0,
    });
    expect(score).toBe(0);
  });

  test("equal cost-of-delay with different efforts produce different scores", () => {
    const scoreA = computeWSJF({
      business_value: 5,
      time_criticality: 5,
      risk_reduction: 5,
      effort_points: 3,
    });
    const scoreB = computeWSJF({
      business_value: 5,
      time_criticality: 5,
      risk_reduction: 5,
      effort_points: 5,
    });
    expect(scoreA).toBeGreaterThan(scoreB);
    expect(scoreA).toBe(5);
    expect(scoreB).toBe(3);
  });

  test("higher business_value produces higher score", () => {
    const scoreHigh = computeWSJF({
      business_value: 9,
      time_criticality: 5,
      risk_reduction: 5,
      effort_points: 3,
    });
    const scoreLow = computeWSJF({
      business_value: 2,
      time_criticality: 5,
      risk_reduction: 5,
      effort_points: 3,
    });
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });
});

/* ------------------------------------------------------------------ */
/*  effortFromComplexity                                              */
/* ------------------------------------------------------------------ */

describe("effortFromComplexity", () => {
  test("returns 1 for TRIVIAL", () => {
    expect(effortFromComplexity("TRIVIAL")).toBe(1);
  });

  test("returns 2 for SIMPLE", () => {
    expect(effortFromComplexity("SIMPLE")).toBe(2);
  });

  test("returns 3 for MODERATE", () => {
    expect(effortFromComplexity("MODERATE")).toBe(3);
  });

  test("returns 5 for COMPLEX", () => {
    expect(effortFromComplexity("COMPLEX")).toBe(5);
  });

  test("returns 8 for CRITICAL", () => {
    expect(effortFromComplexity("CRITICAL")).toBe(8);
  });

  test("returns 3 (MODERATE default) for unknown complexity strings", () => {
    expect(effortFromComplexity("UNKNOWN")).toBe(3);
    expect(effortFromComplexity("foo")).toBe(3);
    expect(effortFromComplexity("")).toBe(3);
  });

  test("case-sensitive: lowercase 'trivial' returns default 3", () => {
    expect(effortFromComplexity("trivial")).toBe(3);
    expect(effortFromComplexity("simple")).toBe(3);
    expect(effortFromComplexity("complex")).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/*  rankByWSJF                                                        */
/* ------------------------------------------------------------------ */

describe("rankByWSJF", () => {
  /**
   * Helper to build a minimal WSJFScoredItem for test purposes.
   */
  function makeItem(
    overrides: Partial<WSJFScoredItem> & {
      wsjf_score: number;
      effort_points?: number;
    },
  ): WSJFScoredItem {
    const effort = overrides.effort_points ?? 3;
    return {
      todo_path: overrides.todo_path ?? "test.md",
      title: overrides.title ?? "Test",
      area: overrides.area ?? "test",
      wsjf_inputs: overrides.wsjf_inputs ?? {
        business_value: 5,
        time_criticality: 5,
        risk_reduction: 5,
        effort_points: effort,
      },
      wsjf_score: overrides.wsjf_score,
      complexity: overrides.complexity ?? "MODERATE",
      dependency_free: overrides.dependency_free ?? true,
    };
  }

  test("items sorted by WSJF descending", () => {
    const items: WSJFScoredItem[] = [
      makeItem({ wsjf_score: 2, title: "Low" }),
      makeItem({ wsjf_score: 10, title: "High" }),
      makeItem({ wsjf_score: 5, title: "Mid" }),
    ];

    const ranked = rankByWSJF(items);
    expect(ranked[0]!.title).toBe("High");
    expect(ranked[1]!.title).toBe("Mid");
    expect(ranked[2]!.title).toBe("Low");
  });

  test("equal WSJF sorted by effort ascending (prefer cheaper)", () => {
    const items: WSJFScoredItem[] = [
      makeItem({
        wsjf_score: 5,
        title: "Expensive",
        effort_points: 8,
        wsjf_inputs: {
          business_value: 5,
          time_criticality: 5,
          risk_reduction: 5,
          effort_points: 8,
        },
      }),
      makeItem({
        wsjf_score: 5,
        title: "Cheap",
        effort_points: 1,
        wsjf_inputs: {
          business_value: 5,
          time_criticality: 5,
          risk_reduction: 5,
          effort_points: 1,
        },
      }),
      makeItem({
        wsjf_score: 5,
        title: "Medium",
        effort_points: 3,
        wsjf_inputs: {
          business_value: 5,
          time_criticality: 5,
          risk_reduction: 5,
          effort_points: 3,
        },
      }),
    ];

    const ranked = rankByWSJF(items);
    expect(ranked[0]!.title).toBe("Cheap");
    expect(ranked[1]!.title).toBe("Medium");
    expect(ranked[2]!.title).toBe("Expensive");
  });

  test("returns new array (immutability check)", () => {
    const items: WSJFScoredItem[] = [
      makeItem({ wsjf_score: 2, title: "A" }),
      makeItem({ wsjf_score: 8, title: "B" }),
    ];

    const ranked = rankByWSJF(items);
    expect(ranked).not.toBe(items);
    // Original array should be unchanged
    expect(items[0]!.title).toBe("A");
    expect(items[1]!.title).toBe("B");
  });

  test("empty array returns empty", () => {
    const ranked = rankByWSJF([]);
    expect(ranked).toEqual([]);
    expect(ranked).toHaveLength(0);
  });

  test("single item returns same item", () => {
    const single = makeItem({ wsjf_score: 7, title: "Only" });
    const ranked = rankByWSJF([single]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.title).toBe("Only");
    expect(ranked[0]!.wsjf_score).toBe(7);
  });

  test("preserves all item fields", () => {
    const item = makeItem({
      todo_path: "path/to/todo.md",
      title: "Full Fields",
      area: "quality",
      wsjf_score: 6,
      complexity: "COMPLEX",
      dependency_free: false,
      wsjf_inputs: {
        business_value: 8,
        time_criticality: 7,
        risk_reduction: 3,
        effort_points: 5,
      },
    });

    const ranked = rankByWSJF([item]);
    const result = ranked[0]!;

    expect(result.todo_path).toBe("path/to/todo.md");
    expect(result.title).toBe("Full Fields");
    expect(result.area).toBe("quality");
    expect(result.wsjf_score).toBe(6);
    expect(result.complexity).toBe("COMPLEX");
    expect(result.dependency_free).toBe(false);
    expect(result.wsjf_inputs.business_value).toBe(8);
    expect(result.wsjf_inputs.time_criticality).toBe(7);
    expect(result.wsjf_inputs.risk_reduction).toBe(3);
    expect(result.wsjf_inputs.effort_points).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/*  scoreItem                                                         */
/* ------------------------------------------------------------------ */

describe("scoreItem", () => {
  test("computes correct effort from complexity", () => {
    const item = scoreItem({
      todo_path: "test.md",
      title: "Test",
      area: "test",
      business_value: 5,
      time_criticality: 5,
      risk_reduction: 5,
      complexity: "COMPLEX",
      dependency_free: true,
    });
    // COMPLEX maps to effort 5
    expect(item.wsjf_inputs.effort_points).toBe(5);
  });

  test("computes correct WSJF score", () => {
    const item = scoreItem({
      todo_path: "test.md",
      title: "Test",
      area: "test",
      business_value: 8,
      time_criticality: 5,
      risk_reduction: 3,
      complexity: "COMPLEX",
      dependency_free: true,
    });
    // (8 + 5 + 3) / 5 = 3.2
    expect(item.wsjf_score).toBe(3.2);
  });

  test("returns complete WSJFScoredItem with all fields", () => {
    const item = scoreItem({
      todo_path: "backlog/improve-tests.md",
      title: "Improve test coverage",
      area: "quality",
      business_value: 7,
      time_criticality: 3,
      risk_reduction: 5,
      complexity: "MODERATE",
      dependency_free: true,
    });

    expect(item.todo_path).toBe("backlog/improve-tests.md");
    expect(item.title).toBe("Improve test coverage");
    expect(item.area).toBe("quality");
    expect(item.complexity).toBe("MODERATE");
    expect(item.dependency_free).toBe(true);
    expect(item.wsjf_inputs).toEqual({
      business_value: 7,
      time_criticality: 3,
      risk_reduction: 5,
      effort_points: 3,
    });
    // (7 + 3 + 5) / 3 = 5
    expect(item.wsjf_score).toBe(5);
  });

  test("works with TRIVIAL complexity (effort=1)", () => {
    const item = scoreItem({
      todo_path: "test.md",
      title: "Trivial fix",
      area: "maintenance",
      business_value: 3,
      time_criticality: 2,
      risk_reduction: 1,
      complexity: "TRIVIAL",
      dependency_free: true,
    });
    expect(item.wsjf_inputs.effort_points).toBe(1);
    // (3 + 2 + 1) / 1 = 6
    expect(item.wsjf_score).toBe(6);
  });

  test("works with SIMPLE complexity (effort=2)", () => {
    const item = scoreItem({
      todo_path: "test.md",
      title: "Simple task",
      area: "feature",
      business_value: 4,
      time_criticality: 4,
      risk_reduction: 4,
      complexity: "SIMPLE",
      dependency_free: false,
    });
    expect(item.wsjf_inputs.effort_points).toBe(2);
    // (4 + 4 + 4) / 2 = 6
    expect(item.wsjf_score).toBe(6);
    expect(item.dependency_free).toBe(false);
  });

  test("works with CRITICAL complexity (effort=8)", () => {
    const item = scoreItem({
      todo_path: "test.md",
      title: "Critical overhaul",
      area: "architecture",
      business_value: 10,
      time_criticality: 8,
      risk_reduction: 6,
      complexity: "CRITICAL",
      dependency_free: false,
    });
    expect(item.wsjf_inputs.effort_points).toBe(8);
    // (10 + 8 + 6) / 8 = 3
    expect(item.wsjf_score).toBe(3);
  });
});
