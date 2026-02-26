import { describe, test, expect } from "bun:test";
import {
  computeTagOverlap,
  computeTriggerSimilarity,
  scoreProcedure,
  recallProcedures,
} from "../../../src/memory/procedure-recall.ts";
import type { ProcedureEntry } from "~/memory/memory.schemas";

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Build a minimal ProcedureEntry for testing.
 * Overrides can be passed to customize any field.
 */
function buildEntry(overrides: Partial<ProcedureEntry> = {}): ProcedureEntry {
  return {
    id: overrides.id ?? "proc-test",
    title: overrides.title ?? "Test Procedure",
    trigger: overrides.trigger ?? "When testing",
    steps: overrides.steps ?? [{ order: 1, action: "Test step" }],
    tags: overrides.tags ?? [],
    source_agent: overrides.source_agent ?? "general",
    source_phase: overrides.source_phase,
    execution_count: overrides.execution_count ?? 0,
    success_count: overrides.success_count ?? 0,
    success_rate: overrides.success_rate ?? 0,
    added_at: overrides.added_at ?? "2026-02-14T00:00:00Z",
    last_executed_at: overrides.last_executed_at,
    token_estimate: overrides.token_estimate ?? 0,
    status: overrides.status ?? "active",
    retirement_reason: overrides.retirement_reason,
  };
}

// ─── computeTagOverlap ──────────────────────────────────────────────────────

describe("computeTagOverlap", () => {
  test("identical tags return 1.0", () => {
    const result = computeTagOverlap(
      ["coding", "testing", "api"],
      ["coding", "testing", "api"],
    );
    expect(result).toBe(1.0);
  });

  test("disjoint tags return 0.0", () => {
    const result = computeTagOverlap(
      ["coding", "testing"],
      ["security", "performance"],
    );
    expect(result).toBe(0.0);
  });

  test("partial overlap returns correct ratio", () => {
    // Shared: "coding", "testing" = 2
    // Union: "coding", "testing", "api", "security", "performance" = 5
    const result = computeTagOverlap(
      ["coding", "testing", "api"],
      ["coding", "testing", "security", "performance"],
    );
    expect(result).toBeCloseTo(2 / 5, 5);
  });

  test("empty sets return 0.0", () => {
    const result = computeTagOverlap([], []);
    expect(result).toBe(0.0);
  });

  test("case-insensitive comparison", () => {
    const result = computeTagOverlap(
      ["Coding", "TESTING"],
      ["coding", "testing"],
    );
    expect(result).toBe(1.0);
  });

  test("one empty set returns 0.0", () => {
    const result = computeTagOverlap(["coding"], []);
    expect(result).toBe(0.0);
  });
});

// ─── computeTriggerSimilarity ────────────────────────────────────────────────

describe("computeTriggerSimilarity", () => {
  test("matching keywords produce high score", () => {
    const result = computeTriggerSimilarity(
      "When adding a new API endpoint",
      "Add new REST API endpoints for user management",
    );
    // Common non-stop tokens: "adding"/"add", "new", "api", "endpoint"/"endpoints"
    expect(result).toBeGreaterThan(0.2);
  });

  test("no common keywords return 0.0", () => {
    const result = computeTriggerSimilarity(
      "deploying production infrastructure",
      "writing unit tests coverage",
    );
    expect(result).toBe(0.0);
  });

  test("identical text returns 1.0", () => {
    const result = computeTriggerSimilarity(
      "setting up database migrations",
      "setting up database migrations",
    );
    expect(result).toBe(1.0);
  });

  test("stop words are filtered out", () => {
    // "the", "a", "is", "to", "and" are stop words
    // Only content-bearing words matter
    const result = computeTriggerSimilarity(
      "the a is to and",
      "the a is to and",
    );
    // All tokens are stop words, both sets empty after filtering
    expect(result).toBe(0);
  });

  test("empty strings return 0.0", () => {
    const result = computeTriggerSimilarity("", "");
    expect(result).toBe(0.0);
  });
});

// ─── scoreProcedure ──────────────────────────────────────────────────────────

describe("scoreProcedure", () => {
  test("all components contribute to weighted sum", () => {
    const entry = buildEntry({
      tags: ["api", "coding"],
      trigger: "When adding new API endpoint",
      success_rate: 0.8,
    });

    const context = {
      phase_description: "Add new API endpoint for data retrieval",
      phase_tags: ["api", "coding"],
    };

    const score = scoreProcedure(entry, context);

    // Tag overlap = 1.0 (identical tags)
    // Trigger similarity > 0 (shared "api", "endpoint", "new", "adding"/"add")
    // Success rate = 0.8
    // Score = (1.0 * 0.4) + (trigger * 0.4) + (0.8 * 0.2)
    //       = 0.4 + trigger_contrib + 0.16
    expect(score).toBeGreaterThan(0.4 + 0.16); // At least tag + success rate
    expect(score).toBeLessThanOrEqual(1.0);

    // Verify the formula components
    const tagScore = computeTagOverlap(entry.tags, context.phase_tags);
    const triggerScore = computeTriggerSimilarity(
      entry.trigger,
      context.phase_description,
    );
    const expectedScore =
      tagScore * 0.4 + triggerScore * 0.4 + entry.success_rate * 0.2;
    expect(score).toBeCloseTo(expectedScore, 10);
  });

  test("zero across all dimensions returns 0", () => {
    const entry = buildEntry({
      tags: [],
      trigger: "xyz unique words only",
      success_rate: 0,
    });

    const context = {
      phase_description: "completely different context here",
      phase_tags: ["security"],
    };

    const score = scoreProcedure(entry, context);
    expect(score).toBe(0);
  });
});

// ─── recallProcedures ────────────────────────────────────────────────────────

describe("recallProcedures", () => {
  test("results sorted by score descending", () => {
    const highScore = buildEntry({
      id: "proc-high",
      tags: ["api", "coding"],
      trigger: "When adding new API endpoint",
      success_rate: 1.0,
    });
    const lowScore = buildEntry({
      id: "proc-low",
      tags: [],
      trigger: "deploying infrastructure servers",
      success_rate: 0.1,
    });
    const midScore = buildEntry({
      id: "proc-mid",
      tags: ["api"],
      trigger: "setting up database",
      success_rate: 0.5,
    });

    const context = {
      phase_description: "Add new API endpoint for users",
      phase_tags: ["api", "coding"],
    };

    const result = recallProcedures([lowScore, highScore, midScore], context);

    // highScore should come first (perfect tag match + trigger match + high rate)
    expect(result[0]!.id).toBe("proc-high");
    // Verify descending order
    for (let i = 1; i < result.length; i++) {
      const prevScore = scoreProcedure(result[i - 1]!, context);
      const currScore = scoreProcedure(result[i]!, context);
      expect(prevScore).toBeGreaterThanOrEqual(currScore);
    }
  });

  test("limit enforced (request 2 from 5)", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      buildEntry({
        id: `proc-${i}`,
        tags: ["coding"],
        trigger: `trigger ${i}`,
        success_rate: (i + 1) / 5,
      }),
    );

    const result = recallProcedures(
      entries,
      { phase_description: "coding task", phase_tags: ["coding"] },
      2,
    );

    expect(result.length).toBe(2);
  });

  test("retired procedures excluded", () => {
    const active = buildEntry({
      id: "proc-active",
      status: "active",
      tags: ["coding"],
      success_rate: 0.5,
    });
    const retired = buildEntry({
      id: "proc-retired",
      status: "retired",
      tags: ["coding"],
      success_rate: 1.0,
    });

    const result = recallProcedures([active, retired], {
      phase_description: "coding task",
      phase_tags: ["coding"],
    });

    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("proc-active");
  });

  test("empty input returns empty array", () => {
    const result = recallProcedures([], {
      phase_description: "anything",
      phase_tags: ["api"],
    });
    expect(result).toEqual([]);
  });

  test("tie-breaking: procedures with same tag/trigger score ranked by success rate", () => {
    // Same tags, same trigger, different success_rate
    const highRate = buildEntry({
      id: "proc-high-rate",
      tags: ["testing"],
      trigger: "identical trigger text",
      success_rate: 0.9,
    });
    const lowRate = buildEntry({
      id: "proc-low-rate",
      tags: ["testing"],
      trigger: "identical trigger text",
      success_rate: 0.2,
    });

    const context = {
      phase_description: "identical trigger text",
      phase_tags: ["testing"],
    };

    const result = recallProcedures([lowRate, highRate], context);

    // Higher success_rate procedure should come first
    expect(result[0]!.id).toBe("proc-high-rate");
    expect(result[1]!.id).toBe("proc-low-rate");
  });

  test("default limit is 5", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      buildEntry({
        id: `proc-${i}`,
        tags: ["coding"],
        success_rate: 0.5,
      }),
    );

    const result = recallProcedures(entries, {
      phase_description: "coding task",
      phase_tags: ["coding"],
    });

    expect(result.length).toBe(5);
  });
});
