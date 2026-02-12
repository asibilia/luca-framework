import { describe, test, expect } from "bun:test";
import {
  EFFORT_MAP,
  DEFAULT_ZONE_BOUNDARIES,
  COMPLEXITY_ZONE_MAP,
  DEFAULT_WEEKLY_ALLOCATION,
  COLD_START_COSTS,
  DEFAULT_PLANNER_CONFIG,
  DEFAULT_SESSION_CAP_MINUTES,
  MAX_CONTEXT_PERCENT,
} from "./defaults";

describe("planner defaults", () => {
  test("EFFORT_MAP has correct Fibonacci-like values", () => {
    expect(EFFORT_MAP.TRIVIAL).toBe(1);
    expect(EFFORT_MAP.SIMPLE).toBe(2);
    expect(EFFORT_MAP.MODERATE).toBe(3);
    expect(EFFORT_MAP.COMPLEX).toBe(5);
    expect(EFFORT_MAP.CRITICAL).toBe(8);
  });

  test("EFFORT_MAP covers all 5 complexity levels", () => {
    expect(Object.keys(EFFORT_MAP)).toHaveLength(5);
  });

  test("DEFAULT_ZONE_BOUNDARIES covers 0-100%", () => {
    expect(DEFAULT_ZONE_BOUNDARIES).toHaveLength(4);
    const first = DEFAULT_ZONE_BOUNDARIES[0]!;
    const last = DEFAULT_ZONE_BOUNDARIES[3]!;
    expect(first.start_percent).toBe(0);
    expect(last.end_percent).toBe(100);
  });

  test("DEFAULT_ZONE_BOUNDARIES zones are contiguous", () => {
    for (let i = 1; i < DEFAULT_ZONE_BOUNDARIES.length; i++) {
      const current = DEFAULT_ZONE_BOUNDARIES[i]!;
      const previous = DEFAULT_ZONE_BOUNDARIES[i - 1]!;
      expect(current.start_percent).toBe(previous.end_percent);
    }
  });

  test("COMPLEXITY_ZONE_MAP assigns complex/critical to peak", () => {
    expect(COMPLEXITY_ZONE_MAP.COMPLEX).toBe("peak");
    expect(COMPLEXITY_ZONE_MAP.CRITICAL).toBe("peak");
  });

  test("COMPLEXITY_ZONE_MAP assigns trivial to degrading", () => {
    expect(COMPLEXITY_ZONE_MAP.TRIVIAL).toBe("degrading");
  });

  test("DEFAULT_WEEKLY_ALLOCATION sums to 100%", () => {
    const total =
      DEFAULT_WEEKLY_ALLOCATION.needle_movers +
      DEFAULT_WEEKLY_ALLOCATION.quick_wins +
      DEFAULT_WEEKLY_ALLOCATION.maintenance +
      DEFAULT_WEEKLY_ALLOCATION.reserve;
    expect(total).toBe(100);
  });

  test("DEFAULT_WEEKLY_ALLOCATION matches 60/25/10/5 split", () => {
    expect(DEFAULT_WEEKLY_ALLOCATION.needle_movers).toBe(60);
    expect(DEFAULT_WEEKLY_ALLOCATION.quick_wins).toBe(25);
    expect(DEFAULT_WEEKLY_ALLOCATION.maintenance).toBe(10);
    expect(DEFAULT_WEEKLY_ALLOCATION.reserve).toBe(5);
  });

  test("COLD_START_COSTS increase with complexity", () => {
    expect(COLD_START_COSTS.TRIVIAL).toBeLessThan(COLD_START_COSTS.SIMPLE);
    expect(COLD_START_COSTS.SIMPLE).toBeLessThan(COLD_START_COSTS.MODERATE);
    expect(COLD_START_COSTS.MODERATE).toBeLessThan(COLD_START_COSTS.COMPLEX);
    expect(COLD_START_COSTS.COMPLEX).toBeLessThan(COLD_START_COSTS.CRITICAL);
  });

  test("DEFAULT_PLANNER_CONFIG is a valid PlannerConfig", () => {
    expect(DEFAULT_PLANNER_CONFIG.session_cap_minutes).toBe(180);
    expect(DEFAULT_PLANNER_CONFIG.weekly_allocation.needle_movers).toBe(60);
  });

  test("DEFAULT_SESSION_CAP_MINUTES is 180 (3 hours)", () => {
    expect(DEFAULT_SESSION_CAP_MINUTES).toBe(180);
  });

  test("MAX_CONTEXT_PERCENT is 70", () => {
    expect(MAX_CONTEXT_PERCENT).toBe(70);
  });
});
