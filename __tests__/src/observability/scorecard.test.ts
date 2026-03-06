import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import {
  createScorecardEntry,
  createScorecard,
  recordInvocation,
  queryScorecard,
  formatScorecardReport,
  loadScorecard,
  saveScorecard,
} from "../../../src/observability/__helpers/scorecard";
import type { Scorecard } from "../../../src/observability/__schemas/observability.schemas";
import { scorecardSchema, scorecardEntrySchema } from "../../../src/observability/__schemas/observability.schemas";

// ─── R12.1: Entry Creation ──────────────────────────────────────────────────

describe("createScorecardEntry", () => {
  test("creates entry with zeroed counters", () => {
    const entry = createScorecardEntry("lu-executor");

    expect(entry.agent_name).toBe("lu-executor");
    expect(entry.invocation_count).toBe(0);
    expect(entry.success_count).toBe(0);
    expect(entry.failure_count).toBe(0);
    expect(entry.total_duration_ms).toBe(0);
    expect(entry.avg_duration_ms).toBe(0);
    expect(entry.last_invoked).toBeNull();
  });
});

describe("createScorecard", () => {
  test("creates empty scorecard with timestamp", () => {
    const scorecard = createScorecard();

    expect(Object.keys(scorecard.entries)).toHaveLength(0);
    expect(scorecard.updated_at).toBeTruthy();
  });
});

// ─── R12.1: Invocation Recording ────────────────────────────────────────────

describe("recordInvocation", () => {
  test("creates new entry for unknown agent", () => {
    const scorecard = createScorecard();
    const updated = recordInvocation(scorecard, "lu-executor", true, 1500);

    const entry = updated.entries["lu-executor"];
    expect(entry).toBeDefined();
    expect(entry!.invocation_count).toBe(1);
    expect(entry!.success_count).toBe(1);
    expect(entry!.failure_count).toBe(0);
    expect(entry!.total_duration_ms).toBe(1500);
    expect(entry!.avg_duration_ms).toBe(1500);
    expect(entry!.last_invoked).toBeTruthy();
  });

  test("increments existing entry counters", () => {
    let scorecard = createScorecard();
    scorecard = recordInvocation(scorecard, "lu-executor", true, 1000);
    scorecard = recordInvocation(scorecard, "lu-executor", true, 2000);
    scorecard = recordInvocation(scorecard, "lu-executor", false, 500);

    const entry = scorecard.entries["lu-executor"]!;
    expect(entry.invocation_count).toBe(3);
    expect(entry.success_count).toBe(2);
    expect(entry.failure_count).toBe(1);
    expect(entry.total_duration_ms).toBe(3500);
    expect(entry.avg_duration_ms).toBeCloseTo(1166.67, 1);
  });

  test("does not mutate original scorecard", () => {
    const original = createScorecard();
    const updated = recordInvocation(original, "lu-executor", true, 1000);

    expect(Object.keys(original.entries)).toHaveLength(0);
    expect(Object.keys(updated.entries)).toHaveLength(1);
  });

  test("handles multiple agents independently", () => {
    let scorecard = createScorecard();
    scorecard = recordInvocation(scorecard, "lu-executor", true, 1000);
    scorecard = recordInvocation(scorecard, "lu-verifier", true, 500);
    scorecard = recordInvocation(scorecard, "lu-executor", false, 200);

    expect(scorecard.entries["lu-executor"]!.invocation_count).toBe(2);
    expect(scorecard.entries["lu-verifier"]!.invocation_count).toBe(1);
  });
});

// ─── R12.3: Scorecard Query ─────────────────────────────────────────────────

describe("queryScorecard", () => {
  let scorecard: Scorecard;

  beforeEach(() => {
    scorecard = createScorecard();
    scorecard = recordInvocation(scorecard, "lu-executor", true, 1000);
    scorecard = recordInvocation(scorecard, "lu-executor", true, 2000);
    scorecard = recordInvocation(scorecard, "lu-verifier", true, 500);
    scorecard = recordInvocation(scorecard, "dx-advocate", false, 300);
  });

  test("returns all entries with empty query", () => {
    const results = queryScorecard(scorecard);
    expect(results).toHaveLength(3);
  });

  test("filters by agent name", () => {
    const results = queryScorecard(scorecard, {
      agent_name: "lu-executor",
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.agent_name).toBe("lu-executor");
  });

  test("filters by minimum invocations", () => {
    const results = queryScorecard(scorecard, { min_invocations: 2 });
    expect(results).toHaveLength(1);
    expect(results[0]!.agent_name).toBe("lu-executor");
  });

  test("sorts by invocation_count descending", () => {
    const results = queryScorecard(scorecard, {
      sort_by: "invocation_count",
      sort_order: "desc",
    });
    expect(results[0]!.agent_name).toBe("lu-executor");
    expect(results[0]!.invocation_count).toBe(2);
  });

  test("sorts by success_rate", () => {
    const results = queryScorecard(scorecard, {
      sort_by: "success_rate",
      sort_order: "desc",
    });
    // lu-executor: 2/2 = 1.0, lu-verifier: 1/1 = 1.0, dx-advocate: 0/1 = 0.0
    expect(results[results.length - 1]!.agent_name).toBe("dx-advocate");
  });

  test("applies limit", () => {
    const results = queryScorecard(scorecard, {
      sort_by: "invocation_count",
      sort_order: "desc",
      limit: 2,
    });
    expect(results).toHaveLength(2);
  });

  test("returns empty for non-existent agent", () => {
    const results = queryScorecard(scorecard, {
      agent_name: "nonexistent",
    });
    expect(results).toHaveLength(0);
  });
});

// ─── R12.4: Report Generation ───────────────────────────────────────────────

describe("formatScorecardReport", () => {
  test("generates report with computed fields", () => {
    let scorecard = createScorecard();
    scorecard = recordInvocation(scorecard, "lu-executor", true, 1000);
    scorecard = recordInvocation(scorecard, "lu-executor", false, 500);
    scorecard = recordInvocation(scorecard, "lu-verifier", true, 300);

    const report = formatScorecardReport(scorecard);

    expect(report.total_agents).toBe(2);
    expect(report.total_invocations).toBe(3);
    expect(report.generated_at).toBeTruthy();
    expect(report.entries).toHaveLength(2);

    // lu-executor has more invocations, should be first (sorted desc)
    expect(report.entries[0]!.agent_name).toBe("lu-executor");
    expect(report.entries[0]!.invocations).toBe(2);
    expect(report.entries[0]!.success_rate).toBe(0.5);
  });

  test("handles empty scorecard", () => {
    const report = formatScorecardReport(createScorecard());

    expect(report.total_agents).toBe(0);
    expect(report.total_invocations).toBe(0);
    expect(report.entries).toHaveLength(0);
  });

  test("success_rate is 0 for zero invocations", () => {
    const scorecard: Scorecard = {
      entries: {
        "test-agent": createScorecardEntry("test-agent"),
      },
      updated_at: new Date().toISOString(),
    };

    const report = formatScorecardReport(scorecard);
    expect(report.entries[0]!.success_rate).toBe(0);
  });
});

// ─── R12.2: Persistence ─────────────────────────────────────────────────────

describe("loadScorecard / saveScorecard", () => {
  const testPath = "/tmp/luca-test-scorecard.json";

  afterEach(() => {
    try {
      if (existsSync(testPath)) unlinkSync(testPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  test("save and load roundtrip preserves data", async () => {
    let scorecard = createScorecard();
    scorecard = recordInvocation(scorecard, "lu-executor", true, 1500);
    scorecard = recordInvocation(scorecard, "lu-verifier", false, 300);

    await saveScorecard(scorecard, testPath);
    const loaded = await loadScorecard(testPath);

    expect(loaded.entries["lu-executor"]!.invocation_count).toBe(1);
    expect(loaded.entries["lu-executor"]!.success_count).toBe(1);
    expect(loaded.entries["lu-verifier"]!.failure_count).toBe(1);
  });

  test("loadScorecard returns empty scorecard for missing file", async () => {
    const scorecard = await loadScorecard("/tmp/nonexistent-scorecard.json");

    expect(Object.keys(scorecard.entries)).toHaveLength(0);
    expect(scorecard.updated_at).toBeTruthy();
  });

  test("loadScorecard returns empty scorecard for invalid JSON", async () => {
    await Bun.write(testPath, "not valid json{{{");
    const scorecard = await loadScorecard(testPath);

    expect(Object.keys(scorecard.entries)).toHaveLength(0);
  });
});

// ─── Schema Validation ──────────────────────────────────────────────────────

describe("scorecardSchema validation", () => {
  test("validates a well-formed scorecard", () => {
    const result = scorecardSchema.safeParse({
      entries: {
        "lu-executor": {
          agent_name: "lu-executor",
          invocation_count: 5,
          success_count: 4,
          failure_count: 1,
          total_duration_ms: 7500,
          avg_duration_ms: 1500,
          last_invoked: "2026-03-01T12:00:00Z",
        },
      },
      updated_at: "2026-03-01T12:00:00Z",
    });

    expect(result.success).toBe(true);
  });

  test("rejects negative invocation count", () => {
    const result = scorecardEntrySchema.safeParse({
      agent_name: "test",
      invocation_count: -1,
      success_count: 0,
      failure_count: 0,
      total_duration_ms: 0,
      avg_duration_ms: 0,
      last_invoked: null,
    });

    expect(result.success).toBe(false);
  });
});
