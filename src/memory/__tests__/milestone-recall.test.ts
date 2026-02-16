import { describe, test, expect } from "bun:test";
import {
  parseVersion,
  versionDistance,
  calculateMilestoneProximity,
  calculateTagOverlap,
  scoreMilestoneRecall,
} from "../milestone-recall.ts";
import type { MemoryEntry } from "../types.ts";

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Build a minimal MemoryEntry for testing.
 * Overrides can be passed to customize any field.
 */
function buildEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: overrides.id ?? "test-entry",
    category: overrides.category ?? "pattern",
    title: overrides.title ?? "Test Entry",
    content: overrides.content ?? "Test content",
    tags: overrides.tags ?? [],
    agent: overrides.agent ?? "general",
    confidence: overrides.confidence ?? "medium",
    milestone: overrides.milestone,
    added_at: overrides.added_at ?? new Date().toISOString(),
    last_recalled_at: overrides.last_recalled_at,
    recall_count: overrides.recall_count ?? 0,
    token_estimate: overrides.token_estimate ?? 0,
  };
}

// ─── parseVersion ────────────────────────────────────────────────────────────

describe("parseVersion", () => {
  test("parses v-prefixed version string", () => {
    const result = parseVersion("v1.6.0");
    expect(result).toEqual({ major: 1, minor: 6, patch: 0 });
  });

  test("parses version without v prefix", () => {
    const result = parseVersion("1.6.0");
    expect(result).toEqual({ major: 1, minor: 6, patch: 0 });
  });

  test("parses version without patch", () => {
    const result = parseVersion("v2.3");
    expect(result).toEqual({ major: 2, minor: 3, patch: 0 });
  });

  test("parses uppercase V prefix", () => {
    const result = parseVersion("V1.0.0");
    expect(result).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  test("returns null for single-segment version", () => {
    expect(parseVersion("1")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseVersion("")).toBeNull();
  });

  test("returns null for non-numeric segments", () => {
    expect(parseVersion("v1.beta.0")).toBeNull();
  });

  test("trims whitespace", () => {
    const result = parseVersion("  v1.5.0  ");
    expect(result).toEqual({ major: 1, minor: 5, patch: 0 });
  });
});

// ─── versionDistance ─────────────────────────────────────────────────────────

describe("versionDistance", () => {
  test("same version returns distance 0", () => {
    const v = { major: 1, minor: 6, patch: 0 };
    expect(versionDistance(v, v)).toBe(0);
  });

  test("adjacent minor returns distance 1", () => {
    const a = { major: 1, minor: 5, patch: 0 };
    const b = { major: 1, minor: 6, patch: 0 };
    expect(versionDistance(a, b)).toBe(1);
  });

  test("two minor versions apart returns distance 2", () => {
    const a = { major: 1, minor: 4, patch: 0 };
    const b = { major: 1, minor: 6, patch: 0 };
    expect(versionDistance(a, b)).toBe(2);
  });

  test("major version difference is weighted by 10", () => {
    const a = { major: 1, minor: 0, patch: 0 };
    const b = { major: 2, minor: 0, patch: 0 };
    expect(versionDistance(a, b)).toBe(10);
  });

  test("combined major and minor difference", () => {
    const a = { major: 1, minor: 3, patch: 0 };
    const b = { major: 2, minor: 5, patch: 0 };
    expect(versionDistance(a, b)).toBe(12); // 10 + 2
  });

  test("ignores patch differences", () => {
    const a = { major: 1, minor: 6, patch: 0 };
    const b = { major: 1, minor: 6, patch: 9 };
    expect(versionDistance(a, b)).toBe(0);
  });
});

// ─── calculateMilestoneProximity ─────────────────────────────────────────────

describe("calculateMilestoneProximity", () => {
  test("same milestone returns 1.0", () => {
    expect(calculateMilestoneProximity("v1.6.0", "v1.6.0")).toBe(1.0);
  });

  test("adjacent milestone returns 0.7", () => {
    expect(calculateMilestoneProximity("v1.5.0", "v1.6.0")).toBe(0.7);
  });

  test("two milestones apart returns 0.4", () => {
    expect(calculateMilestoneProximity("v1.4.0", "v1.6.0")).toBe(0.4);
  });

  test("three or more milestones apart returns 0.2", () => {
    expect(calculateMilestoneProximity("v1.2.0", "v1.6.0")).toBe(0.2);
  });

  test("undefined entry milestone returns neutral 0.5", () => {
    expect(calculateMilestoneProximity(undefined, "v1.6.0")).toBe(0.5);
  });

  test("unparseable entry milestone returns neutral 0.5", () => {
    expect(calculateMilestoneProximity("invalid", "v1.6.0")).toBe(0.5);
  });

  test("unparseable current milestone returns neutral 0.5", () => {
    expect(calculateMilestoneProximity("v1.5.0", "invalid")).toBe(0.5);
  });

  test("patch differences are ignored", () => {
    expect(calculateMilestoneProximity("v1.6.1", "v1.6.0")).toBe(1.0);
  });

  test("major version difference gives distant score", () => {
    expect(calculateMilestoneProximity("v2.0.0", "v1.6.0")).toBe(0.2);
  });
});

// ─── calculateTagOverlap ────────────────────────────────────────────────────

describe("calculateTagOverlap", () => {
  test("exact match returns 1.0", () => {
    expect(
      calculateTagOverlap(["memory", "recall"], ["memory", "recall"]),
    ).toBe(1.0);
  });

  test("partial overlap returns fraction", () => {
    expect(
      calculateTagOverlap(["memory", "state-machine"], ["memory", "recall"]),
    ).toBe(0.5);
  });

  test("no overlap returns 0.0", () => {
    expect(calculateTagOverlap(["testing", "ci"], ["memory", "recall"])).toBe(
      0.0,
    );
  });

  test("empty query tags returns 0.0", () => {
    expect(calculateTagOverlap(["memory"], [])).toBe(0.0);
  });

  test("empty entry tags returns 0.0", () => {
    expect(calculateTagOverlap([], ["memory"])).toBe(0.0);
  });

  test("case-insensitive matching", () => {
    expect(
      calculateTagOverlap(["Memory", "RECALL"], ["memory", "recall"]),
    ).toBe(1.0);
  });

  test("duplicate query tags are deduplicated", () => {
    expect(calculateTagOverlap(["memory"], ["memory", "memory"])).toBe(1.0);
  });

  test("superset entry tags still match fully", () => {
    expect(
      calculateTagOverlap(
        ["memory", "recall", "scoring", "extra"],
        ["memory", "recall"],
      ),
    ).toBe(1.0);
  });
});

// ─── scoreMilestoneRecall ────────────────────────────────────────────────────

describe("scoreMilestoneRecall", () => {
  test("returns empty array for empty entries", () => {
    const result = scoreMilestoneRecall([], ["memory"], {
      current_milestone: "v1.6.0",
    });
    expect(result).toEqual([]);
  });

  test("returns all entries scored and sorted by descending score", () => {
    const entries = [
      buildEntry({ id: "a", milestone: "v1.4.0", tags: ["api"] }),
      buildEntry({ id: "b", milestone: "v1.6.0", tags: ["memory"] }),
      buildEntry({ id: "c", milestone: "v1.5.0", tags: ["memory"] }),
    ];

    const result = scoreMilestoneRecall(entries, ["memory"], {
      current_milestone: "v1.6.0",
    });

    expect(result).toHaveLength(3);
    // Entry "b" (same milestone + tag match) should rank first
    expect(result[0]!.entry.id).toBe("b");
    // Scores should be descending
    expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
    expect(result[1]!.score).toBeGreaterThanOrEqual(result[2]!.score);
  });

  test("same-milestone entries rank above distant entries", () => {
    const entries = [
      buildEntry({
        id: "distant",
        milestone: "v1.2.0",
        tags: ["memory"],
        confidence: "high",
      }),
      buildEntry({
        id: "current",
        milestone: "v1.6.0",
        tags: ["memory"],
        confidence: "high",
      }),
    ];

    const result = scoreMilestoneRecall(entries, ["memory"], {
      current_milestone: "v1.6.0",
    });

    expect(result[0]!.entry.id).toBe("current");
    expect(result[0]!.milestone_proximity).toBe(1.0);
    expect(result[1]!.entry.id).toBe("distant");
    expect(result[1]!.milestone_proximity).toBe(0.2);
  });

  test("entries without milestone get neutral proximity 0.5", () => {
    const entries = [buildEntry({ id: "no-milestone", tags: ["memory"] })];

    const result = scoreMilestoneRecall(entries, ["memory"], {
      current_milestone: "v1.6.0",
    });

    expect(result[0]!.milestone_proximity).toBe(0.5);
  });

  test("tag overlap is computed correctly in scored entries", () => {
    const entries = [
      buildEntry({
        id: "full-match",
        tags: ["memory", "recall"],
        milestone: "v1.6.0",
      }),
      buildEntry({
        id: "partial-match",
        tags: ["memory", "other"],
        milestone: "v1.6.0",
      }),
      buildEntry({
        id: "no-match",
        tags: ["unrelated"],
        milestone: "v1.6.0",
      }),
    ];

    const result = scoreMilestoneRecall(entries, ["memory", "recall"], {
      current_milestone: "v1.6.0",
    });

    const fullMatch = result.find((r) => r.entry.id === "full-match")!;
    const partialMatch = result.find((r) => r.entry.id === "partial-match")!;
    const noMatch = result.find((r) => r.entry.id === "no-match")!;

    expect(fullMatch.tag_overlap).toBe(1.0);
    expect(partialMatch.tag_overlap).toBe(0.5);
    expect(noMatch.tag_overlap).toBe(0.0);
  });

  test("composite score is rounded to 3 decimal places", () => {
    const entries = [
      buildEntry({
        id: "entry",
        tags: ["memory"],
        milestone: "v1.6.0",
        confidence: "medium",
      }),
    ];

    const result = scoreMilestoneRecall(entries, ["memory"], {
      current_milestone: "v1.6.0",
    });

    const score = result[0]!.score;
    const decimalPlaces = score.toString().split(".")[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(3);
  });

  test("custom weights override defaults", () => {
    const entries = [
      buildEntry({
        id: "entry",
        tags: ["memory"],
        milestone: "v1.6.0",
        confidence: "high",
      }),
    ];

    // Tag-only scoring: all weight on tags
    const tagOnly = scoreMilestoneRecall(entries, ["memory"], {
      current_milestone: "v1.6.0",
      tag_weight: 1.0,
      milestone_weight: 0,
      confidence_weight: 0,
      recency_weight: 0,
    });

    // Milestone-only scoring: all weight on milestone
    const milestoneOnly = scoreMilestoneRecall(entries, ["memory"], {
      current_milestone: "v1.6.0",
      tag_weight: 0,
      milestone_weight: 1.0,
      confidence_weight: 0,
      recency_weight: 0,
    });

    // Tag overlap = 1.0, so tag-only should score 1.0
    expect(tagOnly[0]!.score).toBe(1.0);
    // Milestone proximity = 1.0 (same), so milestone-only should score 1.0
    expect(milestoneOnly[0]!.score).toBe(1.0);
  });

  test("high confidence entries score higher than low confidence", () => {
    const entries = [
      buildEntry({
        id: "low",
        confidence: "low",
        milestone: "v1.6.0",
        tags: ["memory"],
      }),
      buildEntry({
        id: "high",
        confidence: "high",
        milestone: "v1.6.0",
        tags: ["memory"],
      }),
    ];

    const result = scoreMilestoneRecall(entries, ["memory"], {
      current_milestone: "v1.6.0",
    });

    const highEntry = result.find((r) => r.entry.id === "high")!;
    const lowEntry = result.find((r) => r.entry.id === "low")!;

    expect(highEntry.score).toBeGreaterThan(lowEntry.score);
  });

  test("recent entries score higher than old entries", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const old = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // 200 days ago

    const entries = [
      buildEntry({
        id: "recent",
        added_at: recent.toISOString(),
        milestone: "v1.6.0",
        tags: ["memory"],
        confidence: "medium",
      }),
      buildEntry({
        id: "old",
        added_at: old.toISOString(),
        milestone: "v1.6.0",
        tags: ["memory"],
        confidence: "medium",
      }),
    ];

    const result = scoreMilestoneRecall(entries, ["memory"], {
      current_milestone: "v1.6.0",
    });

    const recentEntry = result.find((r) => r.entry.id === "recent")!;
    const oldEntry = result.find((r) => r.entry.id === "old")!;

    expect(recentEntry.score).toBeGreaterThan(oldEntry.score);
  });

  test("empty query tags still scores by milestone and confidence", () => {
    const entries = [
      buildEntry({
        id: "current",
        milestone: "v1.6.0",
        confidence: "high",
      }),
      buildEntry({
        id: "distant",
        milestone: "v1.2.0",
        confidence: "low",
      }),
    ];

    const result = scoreMilestoneRecall(entries, [], {
      current_milestone: "v1.6.0",
    });

    expect(result[0]!.entry.id).toBe("current");
    // Both should have tag_overlap = 0 (no query tags)
    expect(result[0]!.tag_overlap).toBe(0);
    expect(result[1]!.tag_overlap).toBe(0);
  });
});
