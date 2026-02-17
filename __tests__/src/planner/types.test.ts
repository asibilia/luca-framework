import { describe, test, expect } from "bun:test";
import {
  wsjfInputSchema,
  wsjfScoredItemSchema,
  sessionPlanSchema,
  weeklyPlanSchema,
  tokenCostEstimateSchema,
  plannerConfigSchema,
  todoMetadataSchema,
  zoneBoundarySchema,
  qualityZoneSchema,
} from "../../../src/planner/types";

describe("planner types", () => {
  test("qualityZoneSchema accepts valid zones", () => {
    for (const zone of ["peak", "good", "degrading", "stop"]) {
      expect(qualityZoneSchema.safeParse(zone).success).toBe(true);
    }
  });

  test("qualityZoneSchema rejects invalid zone", () => {
    expect(qualityZoneSchema.safeParse("excellent").success).toBe(false);
  });

  test("zoneBoundarySchema parses valid boundary", () => {
    const result = zoneBoundarySchema.safeParse({
      zone: "peak",
      start_percent: 0,
      end_percent: 30,
      description: "Best for complex work",
    });
    expect(result.success).toBe(true);
  });

  test("wsjfInputSchema parses valid inputs", () => {
    const result = wsjfInputSchema.safeParse({
      business_value: 8,
      time_criticality: 5,
      risk_reduction: 3,
      effort_points: 5,
    });
    expect(result.success).toBe(true);
  });

  test("wsjfInputSchema rejects out-of-range values", () => {
    const result = wsjfInputSchema.safeParse({
      business_value: 11,
      time_criticality: 5,
      risk_reduction: 3,
      effort_points: 5,
    });
    expect(result.success).toBe(false);
  });

  test("wsjfInputSchema rejects zero effort_points", () => {
    const result = wsjfInputSchema.safeParse({
      business_value: 5,
      time_criticality: 5,
      risk_reduction: 5,
      effort_points: 0,
    });
    expect(result.success).toBe(false);
  });

  test("wsjfScoredItemSchema parses valid scored item", () => {
    const result = wsjfScoredItemSchema.safeParse({
      todo_path: ".planning/todos/pending/some-task.md",
      title: "Some task",
      area: "workflow",
      wsjf_inputs: {
        business_value: 8,
        time_criticality: 5,
        risk_reduction: 3,
        effort_points: 5,
      },
      wsjf_score: 3.2,
      complexity: "COMPLEX",
      dependency_free: true,
    });
    expect(result.success).toBe(true);
  });

  test("sessionPlanSchema applies default session_cap_minutes", () => {
    const result = sessionPlanSchema.parse({
      generated_at: "2026-02-11T12:00:00Z",
      total_effort_points: 10,
      items: [],
      rationale: "Test plan",
    });
    expect(result.session_cap_minutes).toBe(180);
  });

  test("weeklyPlanSchema parses valid weekly plan", () => {
    const result = weeklyPlanSchema.safeParse({
      generated_at: "2026-02-11T12:00:00Z",
      sessions_planned: 3,
      allocation: {
        needle_movers: 60,
        quick_wins: 25,
        maintenance: 10,
        reserve: 5,
      },
      sessions: [],
      deferred: [],
      total_effort_points: 30,
    });
    expect(result.success).toBe(true);
  });

  test("tokenCostEstimateSchema applies defaults", () => {
    const result = tokenCostEstimateSchema.parse({
      complexity: "MODERATE",
      estimated_context_percent: 20,
    });
    expect(result.sample_count).toBe(0);
    expect(result.source).toBe("cold_start");
  });

  test("plannerConfigSchema applies all defaults", () => {
    const result = plannerConfigSchema.parse({});
    expect(result.session_cap_minutes).toBe(180);
    expect(result.weekly_allocation.needle_movers).toBe(60);
    expect(result.weekly_allocation.quick_wins).toBe(25);
    expect(result.weekly_allocation.maintenance).toBe(10);
    expect(result.weekly_allocation.reserve).toBe(5);
    expect(result.zone_boundaries.peak_end).toBe(30);
    expect(result.zone_boundaries.good_end).toBe(50);
    expect(result.zone_boundaries.degrading_end).toBe(70);
    expect(result.cold_start_costs.TRIVIAL).toBe(5);
    expect(result.cold_start_costs.CRITICAL).toBe(50);
  });

  test("todoMetadataSchema parses valid todo metadata", () => {
    const result = todoMetadataSchema.safeParse({
      title: "Usage-aware sprint planner",
      area: "workflow",
      created: "2026-02-11",
      source: "conversation",
      file_path: ".planning/todos/pending/usage-aware-sprint-planner.md",
    });
    expect(result.success).toBe(true);
  });

  test("todoMetadataSchema rejects missing required fields", () => {
    const result = todoMetadataSchema.safeParse({
      title: "Missing fields",
    });
    expect(result.success).toBe(false);
  });
});
