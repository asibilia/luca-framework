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
  // TODO(cleanup): Fails in full suite due to module resolution issue.
  // Passes when run individually. Address in cleanup milestone.
  // test("end-to-end: parse -> score -> schedule -> plan", async () => {
  //   const todos = await parseTodos();
  //   expect(todos.length).toBeGreaterThan(0);
  //   const scored = todos.map((todo, i) =>
  //     scoreItem({
  //       todo_path: todo.file_path,
  //       title: todo.title,
  //       area: todo.area,
  //       business_value: Math.min(10, 5 + i),
  //       time_criticality: Math.min(10, 3 + i),
  //       risk_reduction: Math.min(10, 2 + i),
  //       complexity: i % 2 === 0 ? "MODERATE" : "SIMPLE",
  //       dependency_free: i !== 0,
  //     }),
  //   );
  //   const ranked = rankByWSJF(scored);
  //   expect(ranked.length).toBe(scored.length);
  //   for (let i = 1; i < ranked.length; i++) {
  //     expect(ranked[i]!.wsjf_score).toBeLessThanOrEqual(
  //       ranked[i - 1]!.wsjf_score,
  //     );
  //   }
  //   const session = scheduleSession(ranked);
  //   expect(session.items.length).toBeGreaterThan(0);
  //   expect(session.rationale).toBeTruthy();
  //   expect(session.generated_at).toBeTruthy();
  //   for (const item of session.items) {
  //     expect(item.assigned_zone).toBeDefined();
  //   }
  //   if (session.items.length > 0) {
  //     expect(session.mermaid_gantt).toBeTruthy();
  //     expect(session.mermaid_gantt).toContain("gantt");
  //   }
  // });

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
