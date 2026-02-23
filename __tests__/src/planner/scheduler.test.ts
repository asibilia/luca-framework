/**
 * Tests for the session scheduler module.
 *
 * Covers: selectBigRock, estimateContextCost, assignQualityZone,
 * scheduleSession, generateMermaidGantt, and integration flows.
 */
import { describe, test, expect } from "bun:test";

import type { WSJFScoredItem, PlannerConfig } from "../../../src/planner/types";
import { plannerConfigSchema } from "../../../src/planner/types";
import {
  selectBigRock,
  estimateContextCost,
  assignQualityZone,
  scheduleSession,
  generateMermaidGantt,
} from "../../../src/planner/scheduler";

/* ------------------------------------------------------------------ */
/*  Test helper                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a WSJFScoredItem with sensible defaults.
 * Only `todo_path` is required; everything else has a fallback.
 */
function makeItem(
  overrides: Partial<WSJFScoredItem> & { todo_path: string },
): WSJFScoredItem {
  return {
    title: "Test Item",
    area: "test",
    wsjf_inputs: {
      business_value: 5,
      time_criticality: 5,
      risk_reduction: 5,
      effort_points: 3,
    },
    wsjf_score: 5.0,
    complexity: "MODERATE",
    dependency_free: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  selectBigRock                                                      */
/* ------------------------------------------------------------------ */

describe("selectBigRock", () => {
  test("returns highest WSJF dependency-free item", () => {
    const items = [
      makeItem({ todo_path: "a.md", wsjf_score: 3.0, dependency_free: true }),
      makeItem({ todo_path: "b.md", wsjf_score: 8.0, dependency_free: true }),
      makeItem({ todo_path: "c.md", wsjf_score: 5.0, dependency_free: true }),
    ];

    const rock = selectBigRock(items);
    expect(rock).not.toBeNull();
    expect(rock!.todo_path).toBe("b.md");
    expect(rock!.wsjf_score).toBe(8.0);
  });

  test("returns null when no dependency-free items exist", () => {
    const items = [
      makeItem({ todo_path: "a.md", wsjf_score: 10.0, dependency_free: false }),
      makeItem({ todo_path: "b.md", wsjf_score: 8.0, dependency_free: false }),
    ];

    expect(selectBigRock(items)).toBeNull();
  });

  test("ignores items with dependency_free=false even if higher WSJF", () => {
    const items = [
      makeItem({ todo_path: "a.md", wsjf_score: 2.0, dependency_free: true }),
      makeItem({ todo_path: "b.md", wsjf_score: 20.0, dependency_free: false }),
    ];

    const rock = selectBigRock(items);
    expect(rock).not.toBeNull();
    expect(rock!.todo_path).toBe("a.md");
  });

  test("handles single-item array", () => {
    const items = [
      makeItem({
        todo_path: "only.md",
        wsjf_score: 7.0,
        dependency_free: true,
      }),
    ];

    const rock = selectBigRock(items);
    expect(rock).not.toBeNull();
    expect(rock!.todo_path).toBe("only.md");
  });

  test("handles empty array and returns null", () => {
    expect(selectBigRock([])).toBeNull();
  });

  test("excludes items with effort < 3 (TRIVIAL and SIMPLE)", () => {
    const items = [
      makeItem({
        todo_path: "trivial.md",
        wsjf_score: 20.0,
        dependency_free: true,
        wsjf_inputs: {
          business_value: 10,
          time_criticality: 10,
          risk_reduction: 10,
          effort_points: 1,
        },
      }),
      makeItem({
        todo_path: "simple.md",
        wsjf_score: 15.0,
        dependency_free: true,
        wsjf_inputs: {
          business_value: 10,
          time_criticality: 10,
          risk_reduction: 10,
          effort_points: 2,
        },
      }),
      makeItem({
        todo_path: "moderate.md",
        wsjf_score: 5.0,
        dependency_free: true,
        wsjf_inputs: {
          business_value: 5,
          time_criticality: 5,
          risk_reduction: 5,
          effort_points: 3,
        },
      }),
    ];

    const rock = selectBigRock(items);
    expect(rock).not.toBeNull();
    // Despite trivial.md having highest WSJF (20), it's excluded (effort=1)
    // simple.md also excluded (effort=2). Only moderate.md qualifies (effort=3).
    expect(rock!.todo_path).toBe("moderate.md");
  });

  test("returns null when all dependency-free items have effort < 3", () => {
    const items = [
      makeItem({
        todo_path: "trivial.md",
        wsjf_score: 20.0,
        dependency_free: true,
        wsjf_inputs: {
          business_value: 10,
          time_criticality: 10,
          risk_reduction: 10,
          effort_points: 1,
        },
      }),
      makeItem({
        todo_path: "simple.md",
        wsjf_score: 15.0,
        dependency_free: true,
        wsjf_inputs: {
          business_value: 10,
          time_criticality: 10,
          risk_reduction: 10,
          effort_points: 2,
        },
      }),
    ];

    // No items qualify (all effort < 3)
    expect(selectBigRock(items)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  estimateContextCost                                                */
/* ------------------------------------------------------------------ */

describe("estimateContextCost", () => {
  test("returns correct cost for TRIVIAL", () => {
    expect(estimateContextCost("TRIVIAL")).toBe(5);
  });

  test("returns correct cost for SIMPLE", () => {
    expect(estimateContextCost("SIMPLE")).toBe(10);
  });

  test("returns correct cost for MODERATE", () => {
    expect(estimateContextCost("MODERATE")).toBe(20);
  });

  test("returns correct cost for COMPLEX", () => {
    expect(estimateContextCost("COMPLEX")).toBe(35);
  });

  test("returns correct cost for CRITICAL", () => {
    expect(estimateContextCost("CRITICAL")).toBe(50);
  });

  test("returns MODERATE cost for unknown complexity string", () => {
    expect(estimateContextCost("UNKNOWN")).toBe(20);
    expect(estimateContextCost("banana")).toBe(20);
    expect(estimateContextCost("")).toBe(20);
  });

  test("respects custom config cold_start_costs", () => {
    const customConfig: PlannerConfig = plannerConfigSchema.parse({
      cold_start_costs: {
        TRIVIAL: 2,
        SIMPLE: 4,
        MODERATE: 8,
        COMPLEX: 16,
        CRITICAL: 32,
      },
    });

    expect(estimateContextCost("TRIVIAL", customConfig)).toBe(2);
    expect(estimateContextCost("COMPLEX", customConfig)).toBe(16);
    expect(estimateContextCost("UNKNOWN", customConfig)).toBe(8); // falls back to MODERATE
  });
});

/* ------------------------------------------------------------------ */
/*  assignQualityZone                                                  */
/* ------------------------------------------------------------------ */

describe("assignQualityZone", () => {
  test('returns "peak" for 0%', () => {
    expect(assignQualityZone(0)).toBe("peak");
  });

  test('returns "peak" for 15%', () => {
    expect(assignQualityZone(15)).toBe("peak");
  });

  test('returns "peak" for 29%', () => {
    expect(assignQualityZone(29)).toBe("peak");
  });

  test('returns "good" for 30%', () => {
    expect(assignQualityZone(30)).toBe("good");
  });

  test('returns "good" for 40%', () => {
    expect(assignQualityZone(40)).toBe("good");
  });

  test('returns "good" for 49%', () => {
    expect(assignQualityZone(49)).toBe("good");
  });

  test('returns "degrading" for 50%', () => {
    expect(assignQualityZone(50)).toBe("degrading");
  });

  test('returns "degrading" for 60%', () => {
    expect(assignQualityZone(60)).toBe("degrading");
  });

  test('returns "degrading" for 69%', () => {
    expect(assignQualityZone(69)).toBe("degrading");
  });

  test('returns "stop" for 70%', () => {
    expect(assignQualityZone(70)).toBe("stop");
  });

  test('returns "stop" for 85%', () => {
    expect(assignQualityZone(85)).toBe("stop");
  });

  test('returns "stop" for 100%', () => {
    expect(assignQualityZone(100)).toBe("stop");
  });

  test('returns "stop" for values beyond 100%', () => {
    expect(assignQualityZone(120)).toBe("stop");
    expect(assignQualityZone(999)).toBe("stop");
  });
});

/* ------------------------------------------------------------------ */
/*  scheduleSession                                                    */
/* ------------------------------------------------------------------ */

describe("scheduleSession", () => {
  test("Big Rock is always first item (index 0)", () => {
    const items = [
      makeItem({ todo_path: "low.md", wsjf_score: 2.0, dependency_free: true }),
      makeItem({
        todo_path: "high.md",
        wsjf_score: 10.0,
        dependency_free: true,
      }),
      makeItem({ todo_path: "mid.md", wsjf_score: 5.0, dependency_free: true }),
    ];

    const plan = scheduleSession(items);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items[0]!.todo_path).toBe("high.md");
  });

  test("remaining items sorted by WSJF descending", () => {
    const items = [
      makeItem({
        todo_path: "a.md",
        wsjf_score: 3.0,
        complexity: "TRIVIAL",
        dependency_free: true,
      }),
      makeItem({
        todo_path: "b.md",
        wsjf_score: 10.0,
        complexity: "TRIVIAL",
        dependency_free: true,
      }),
      makeItem({
        todo_path: "c.md",
        wsjf_score: 7.0,
        complexity: "TRIVIAL",
        dependency_free: true,
      }),
      makeItem({
        todo_path: "d.md",
        wsjf_score: 5.0,
        complexity: "TRIVIAL",
        dependency_free: true,
      }),
    ];

    const plan = scheduleSession(items);
    // First is Big Rock (b.md, WSJF 10)
    expect(plan.items[0]!.todo_path).toBe("b.md");
    // Remaining should be sorted: c.md (7), d.md (5), a.md (3)
    if (plan.items.length > 1) {
      expect(plan.items[1]!.todo_path).toBe("c.md");
    }
    if (plan.items.length > 2) {
      expect(plan.items[2]!.todo_path).toBe("d.md");
    }
    if (plan.items.length > 3) {
      expect(plan.items[3]!.todo_path).toBe("a.md");
    }
  });

  test("stops adding items when context budget exhausted", () => {
    // Each COMPLEX item costs 35%. After 2 items (70%), the 3rd should be excluded.
    const items = [
      makeItem({
        todo_path: "a.md",
        wsjf_score: 10.0,
        complexity: "COMPLEX",
        dependency_free: true,
      }),
      makeItem({
        todo_path: "b.md",
        wsjf_score: 8.0,
        complexity: "COMPLEX",
        dependency_free: true,
      }),
      makeItem({
        todo_path: "c.md",
        wsjf_score: 6.0,
        complexity: "COMPLEX",
        dependency_free: true,
      }),
    ];

    const plan = scheduleSession(items);
    expect(plan.items.length).toBe(2);
  });

  test("always includes at least one item even if it exceeds budget", () => {
    // A single CRITICAL item costs 50%, which is within budget.
    // But even if we set up a scenario where the first item is huge, it still goes in.
    const items = [
      makeItem({
        todo_path: "huge.md",
        wsjf_score: 10.0,
        complexity: "CRITICAL",
        dependency_free: true,
      }),
    ];

    const plan = scheduleSession(items);
    expect(plan.items.length).toBe(1);
    expect(plan.items[0]!.todo_path).toBe("huge.md");
  });

  test("items have assigned_zone populated", () => {
    const items = [
      makeItem({
        todo_path: "a.md",
        wsjf_score: 10.0,
        complexity: "TRIVIAL",
        dependency_free: true,
      }),
      makeItem({
        todo_path: "b.md",
        wsjf_score: 8.0,
        complexity: "TRIVIAL",
        dependency_free: true,
      }),
    ];

    const plan = scheduleSession(items);
    for (const item of plan.items) {
      expect(item.assigned_zone).toBeDefined();
      expect(["peak", "good", "degrading", "stop"]).toContain(
        item.assigned_zone!,
      );
    }
  });

  test("returns valid SessionPlan shape", () => {
    const items = [
      makeItem({ todo_path: "a.md", wsjf_score: 5.0, dependency_free: true }),
    ];

    const plan = scheduleSession(items);

    expect(plan.generated_at).toBeString();
    expect(plan.session_cap_minutes).toBeNumber();
    expect(plan.total_effort_points).toBeNumber();
    expect(Array.isArray(plan.items)).toBe(true);
    expect(plan.rationale).toBeString();
    expect(plan.rationale.length).toBeGreaterThan(0);
  });

  test("empty items produces empty session plan", () => {
    const plan = scheduleSession([]);

    expect(plan.items).toEqual([]);
    expect(plan.total_effort_points).toBe(0);
    expect(plan.big_rock_index).toBeUndefined();
    expect(plan.mermaid_gantt).toBeUndefined();
    expect(plan.rationale).toContain("Empty session");
  });

  test("big_rock_index is 0 when Big Rock selected", () => {
    const items = [
      makeItem({ todo_path: "a.md", wsjf_score: 10.0, dependency_free: true }),
      makeItem({ todo_path: "b.md", wsjf_score: 5.0, dependency_free: true }),
    ];

    const plan = scheduleSession(items);
    expect(plan.big_rock_index).toBe(0);
  });

  test("big_rock_index is undefined when no dependency-free items", () => {
    const items = [
      makeItem({
        todo_path: "a.md",
        wsjf_score: 10.0,
        dependency_free: false,
        complexity: "TRIVIAL",
      }),
      makeItem({
        todo_path: "b.md",
        wsjf_score: 5.0,
        dependency_free: false,
        complexity: "TRIVIAL",
      }),
    ];

    const plan = scheduleSession(items);
    expect(plan.big_rock_index).toBeUndefined();
  });

  test("mermaid_gantt is non-empty when items exist", () => {
    const items = [
      makeItem({ todo_path: "a.md", wsjf_score: 5.0, dependency_free: true }),
    ];

    const plan = scheduleSession(items);
    expect(plan.mermaid_gantt).toBeDefined();
    expect(plan.mermaid_gantt!.length).toBeGreaterThan(0);
  });

  test("rationale mentions Big Rock title", () => {
    const items = [
      makeItem({
        todo_path: "a.md",
        title: "Implement Auth",
        wsjf_score: 10.0,
        dependency_free: true,
      }),
    ];

    const plan = scheduleSession(items);
    expect(plan.rationale).toContain("Implement Auth");
  });
});

/* ------------------------------------------------------------------ */
/*  generateMermaidGantt                                               */
/* ------------------------------------------------------------------ */

describe("generateMermaidGantt", () => {
  test("returns empty string for empty items", () => {
    expect(generateMermaidGantt([])).toBe("");
  });

  test('contains "gantt" header', () => {
    const items = [
      makeItem({
        todo_path: "a.md",
        title: "Task A",
        assigned_zone: "peak",
        dependency_free: true,
      }),
    ];

    const chart = generateMermaidGantt(items);
    expect(chart).toContain("gantt");
  });

  test("contains section headers for each zone", () => {
    const items = [
      makeItem({
        todo_path: "a.md",
        title: "Peak Task",
        assigned_zone: "peak",
        dependency_free: true,
      }),
      makeItem({
        todo_path: "b.md",
        title: "Good Task",
        assigned_zone: "good",
        dependency_free: true,
      }),
    ];

    const chart = generateMermaidGantt(items);
    expect(chart).toContain("section peak");
    expect(chart).toContain("section good");
  });

  test("contains task entries with correct durations", () => {
    const items = [
      makeItem({
        todo_path: "a.md",
        title: "Task A",
        assigned_zone: "peak",
        wsjf_inputs: {
          business_value: 5,
          time_criticality: 5,
          risk_reduction: 5,
          effort_points: 5,
        },
        dependency_free: true,
      }),
    ];

    const chart = generateMermaidGantt(items);
    expect(chart).toContain("Task A : 0, 5");
  });

  test("task titles have colons replaced with dashes", () => {
    const items = [
      makeItem({
        todo_path: "a.md",
        title: "Fix: Auth: Token",
        assigned_zone: "peak",
        dependency_free: true,
      }),
    ];

    const chart = generateMermaidGantt(items);
    expect(chart).toContain("Fix - Auth - Token");
    expect(chart).not.toContain("Fix:");
  });
});

/* ------------------------------------------------------------------ */
/*  Integration: schedule -> zone flow                                 */
/* ------------------------------------------------------------------ */

describe("Integration: schedule -> zone flow", () => {
  test("schedules 5 items with progressive zone assignments", () => {
    const items = [
      makeItem({
        todo_path: "big.md",
        title: "Big Feature",
        wsjf_score: 12.0,
        complexity: "COMPLEX",
        dependency_free: true,
        wsjf_inputs: {
          business_value: 8,
          time_criticality: 8,
          risk_reduction: 8,
          effort_points: 5,
        },
      }),
      makeItem({
        todo_path: "med1.md",
        title: "Medium Task 1",
        wsjf_score: 8.0,
        complexity: "MODERATE",
        dependency_free: true,
        wsjf_inputs: {
          business_value: 6,
          time_criticality: 6,
          risk_reduction: 6,
          effort_points: 3,
        },
      }),
      makeItem({
        todo_path: "med2.md",
        title: "Medium Task 2",
        wsjf_score: 6.0,
        complexity: "SIMPLE",
        dependency_free: true,
        wsjf_inputs: {
          business_value: 4,
          time_criticality: 4,
          risk_reduction: 4,
          effort_points: 2,
        },
      }),
      makeItem({
        todo_path: "small1.md",
        title: "Small Task 1",
        wsjf_score: 4.0,
        complexity: "TRIVIAL",
        dependency_free: true,
        wsjf_inputs: {
          business_value: 3,
          time_criticality: 3,
          risk_reduction: 3,
          effort_points: 1,
        },
      }),
      makeItem({
        todo_path: "small2.md",
        title: "Small Task 2",
        wsjf_score: 2.0,
        complexity: "TRIVIAL",
        dependency_free: true,
        wsjf_inputs: {
          business_value: 2,
          time_criticality: 2,
          risk_reduction: 2,
          effort_points: 1,
        },
      }),
    ];

    const plan = scheduleSession(items);

    // Big Rock should be the COMPLEX item with highest WSJF
    expect(plan.items[0]!.todo_path).toBe("big.md");
    expect(plan.big_rock_index).toBe(0);

    // Verify zone progression: Big Rock at 0% -> peak
    expect(plan.items[0]!.assigned_zone).toBe("peak");

    // After COMPLEX (35%), cumulative is 35% -> second item gets "good"
    if (plan.items.length > 1) {
      expect(plan.items[1]!.assigned_zone).toBe("good");
    }

    // After MODERATE (20%), cumulative is 55% -> third item gets "degrading"
    if (plan.items.length > 2) {
      expect(plan.items[2]!.assigned_zone).toBe("degrading");
    }

    // Total context should not exceed 70%
    // COMPLEX(35) + MODERATE(20) + SIMPLE(10) = 65% -> still under 70
    // Adding TRIVIAL(5) = 70% -> exactly at limit (65+5=70, NOT > 70), so included
    // Adding next TRIVIAL(5) = 75% -> exceeds 70%, excluded
    // So we expect 4 items scheduled
    expect(plan.items.length).toBe(4);

    // Verify session stops before total exceeds 70%
    expect(plan.total_effort_points).toBeGreaterThan(0);
    expect(plan.mermaid_gantt).toBeDefined();
    expect(plan.mermaid_gantt!).toContain("gantt");
    expect(plan.rationale).toContain("Big Feature");
  });
});
