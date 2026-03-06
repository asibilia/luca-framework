/**
 * Tests for reflective meta-cognition module.
 */
import { test, expect, describe } from "bun:test";
import {
  ReflectionSchema,
  QualityAssessmentSchema,
  assessPlanQuality,
  generateReflection,
} from "../../../src/memory/__helpers/meta-cognition";

import type { PastOutcome } from "../../../src/memory/__helpers/meta-cognition";

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe("ReflectionSchema", () => {
  test("validates a well-formed reflection", () => {
    const result = ReflectionSchema.safeParse({
      summary: "Did the thing",
      outcome: "success",
      strengths: ["Good test coverage"],
      weaknesses: [],
      improvements: [],
      confidence: 0.8,
      generated_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid outcome", () => {
    const result = ReflectionSchema.safeParse({
      summary: "Did the thing",
      outcome: "unknown",
      generated_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("QualityAssessmentSchema", () => {
  test("validates a well-formed assessment", () => {
    const result = QualityAssessmentSchema.safeParse({
      score: 0.75,
      dimensions: {
        clarity: 0.8,
        granularity: 0.7,
        verifiability: 0.9,
        scope_fit: 0.5,
      },
      issues: [],
      suggestions: [],
      assessed_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("rejects score outside 0-1 range", () => {
    const result = QualityAssessmentSchema.safeParse({
      score: 1.5,
      dimensions: {
        clarity: 0,
        granularity: 0,
        verifiability: 0,
        scope_fit: 0,
      },
      assessed_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

// ─── assessPlanQuality Tests ─────────────────────────────────────────────────

describe("assessPlanQuality", () => {
  test("scores high for a well-structured plan", () => {
    const plan = `
## Objective
Implement user auth module.

## Context
Building on existing session framework.

## Tasks
- [ ] Create login endpoint
- [ ] Add JWT validation
- [ ] Write integration tests

## Verification
- All tests pass
- Expect 100% coverage on auth module
`;

    const assessment = assessPlanQuality(plan, []);
    expect(assessment.score).toBeGreaterThan(0.7);
    expect(assessment.dimensions.clarity).toBe(1.0);
    expect(assessment.dimensions.verifiability).toBe(1.0);
    expect(assessment.issues).toHaveLength(0);
  });

  test("scores low for an empty plan", () => {
    const assessment = assessPlanQuality("", []);
    expect(assessment.score).toBeLessThan(0.3);
    expect(assessment.issues.length).toBeGreaterThan(0);
  });

  test("detects missing objective section", () => {
    const plan = `
## Tasks
- [ ] Do something
`;
    const assessment = assessPlanQuality(plan, []);
    expect(assessment.issues).toContain(
      "No clear objective/goal section found",
    );
  });

  test("detects missing verification section", () => {
    const plan = `
## Objective
Do the thing.

## Tasks
- [ ] Task one
`;
    const assessment = assessPlanQuality(plan, []);
    expect(assessment.issues).toContain(
      "No verification/test criteria section found",
    );
  });

  test("flags high task count as scope risk", () => {
    const tasks = Array.from(
      { length: 12 },
      (_, i) => `- [ ] Task ${i + 1}`,
    ).join("\n");
    const plan = `
## Objective
Big plan.

${tasks}
`;
    const assessment = assessPlanQuality(plan, []);
    expect(assessment.issues.some((i) => i.includes("scope creep"))).toBe(true);
  });

  test("calibrates scope_fit from past outcomes", () => {
    const plan = `
## Objective
Do stuff.

## Verification
Tests pass.
`;
    const outcomes: PastOutcome[] = [
      {
        plan_id: "p1",
        outcome: "success",
        task_count: 3,
        verification_count: 2,
      },
      {
        plan_id: "p2",
        outcome: "success",
        task_count: 5,
        verification_count: 3,
      },
      {
        plan_id: "p3",
        outcome: "failure",
        task_count: 8,
        verification_count: 0,
      },
    ];

    const assessment = assessPlanQuality(plan, outcomes);
    // scope_fit should be calibrated by past data, not just 0.5
    expect(assessment.dimensions.scope_fit).not.toBe(0.5);
  });

  test("suggests reducing scope when past success rate is low", () => {
    const plan = `## Objective\nDo stuff.\n`;
    const outcomes: PastOutcome[] = [
      {
        plan_id: "p1",
        outcome: "failure",
        task_count: 3,
        verification_count: 0,
      },
      {
        plan_id: "p2",
        outcome: "failure",
        task_count: 5,
        verification_count: 0,
      },
    ];

    const assessment = assessPlanQuality(plan, outcomes);
    expect(
      assessment.suggestions.some((s) => s.includes("low success rate")),
    ).toBe(true);
  });

  test("handles numbered task lists", () => {
    const plan = `
## Goal
Something.

1. First task
2. Second task
3. Third task
`;
    const assessment = assessPlanQuality(plan, []);
    expect(assessment.dimensions.granularity).toBeGreaterThan(0.3);
  });
});

// ─── generateReflection Tests ────────────────────────────────────────────────

describe("generateReflection", () => {
  test("returns structured reflection for success", () => {
    const reflection = generateReflection(
      "Implemented auth with full test coverage",
      "success",
    );
    expect(reflection.outcome).toBe("success");
    expect(reflection.strengths).toContain("Included testing");
    expect(reflection.confidence).toBe(0.8);
  });

  test("detects testing signals in summary", () => {
    const reflection = generateReflection(
      "Added spec files for all modules",
      "success",
    );
    expect(reflection.strengths).toContain("Included testing");
  });

  test("detects workaround signals", () => {
    const reflection = generateReflection(
      "Added temporary hack for date parsing",
      "partial",
    );
    expect(reflection.weaknesses).toContain(
      "Contains temporary solutions or workarounds",
    );
    expect(reflection.improvements.some((i) => i.includes("workaround"))).toBe(
      true,
    );
  });

  test("detects bypass signals", () => {
    const reflection = generateReflection(
      "Had to skip linting due to config issue",
      "partial",
    );
    expect(reflection.weaknesses).toContain(
      "Some checks were skipped or bypassed",
    );
  });

  test("generates failure-specific improvements", () => {
    const reflection = generateReflection(
      "Could not complete migration",
      "failure",
    );
    expect(reflection.outcome).toBe("failure");
    expect(reflection.weaknesses).toContain(
      "Task did not complete successfully",
    );
    expect(
      reflection.improvements.some((i) => i.includes("alternative strategies")),
    ).toBe(true);
    expect(reflection.confidence).toBe(0.4);
  });

  test("generates partial-specific improvements", () => {
    const reflection = generateReflection(
      "Only completed 2 of 5 items",
      "partial",
    );
    expect(reflection.weaknesses).toContain("Task only partially completed");
    expect(reflection.confidence).toBe(0.6);
  });

  test("adds generic success strength when no signals found", () => {
    const reflection = generateReflection("Updated README", "success");
    expect(reflection.strengths).toContain("Task completed successfully");
  });

  test("schema validates generated reflection", () => {
    const reflection = generateReflection("Did something", "success");
    const result = ReflectionSchema.safeParse(reflection);
    expect(result.success).toBe(true);
  });
});
