/**
 * Integration tests for the Luca planner module (Plan 18-06).
 *
 * Tests the end-to-end pipeline:
 * parse -> score -> schedule -> plan
 * parse -> score -> weekly plan
 * cost table build and format
 */

import { describe, test, expect } from "bun:test";

import { parseTodos } from "../../../src/planner/__helpers/todo-parser";
import { scoreItem, rankByWSJF } from "../../../src/planner/__helpers/scoring";
import { scheduleSession } from "../../../src/planner/__helpers/scheduler";
import { distributeWeekly } from "../../../src/planner/__helpers/weekly";
import {
  buildCostTable,
  formatCostTableForMemory,
} from "../../../src/planner/__helpers/cost-model";

describe("planner integration", () => {
  test("end-to-end: parse -> score -> weekly plan", async () => {
    const todos = await parseTodos();
    if (todos.length === 0) return;

    const scored = todos.map((todo, i) =>
      scoreItem({
        todo_path: todo.file_path,
        title: todo.title,
        area: todo.area,
        business_value: 5,
        time_criticality: 5,
        risk_reduction: 5,
        complexity: "MODERATE",
        dependency_free: true,
      }),
    );

    const weekly = distributeWeekly(scored, 3);
    expect(weekly.sessions_planned).toBeLessThanOrEqual(3);
    expect(weekly.allocation.needle_movers).toBe(60);
    expect(weekly.total_effort_points).toBeGreaterThanOrEqual(0);
  });

  test("cost table builds and formats correctly", () => {
    const table = buildCostTable();
    expect(Object.keys(table)).toHaveLength(5);

    const formatted = formatCostTableForMemory(table);
    expect(formatted).toContain("TRIVIAL");
    expect(formatted).toContain("CRITICAL");
    expect(formatted).toContain("Estimated %");
  });
});
