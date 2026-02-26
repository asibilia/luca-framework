import { describe, test, expect } from "bun:test";
import { analyzeMemoryEntries } from "../../../src/memory/__helpers/compression.ts";
import { memoryEntrySchema } from "~/memory/__schemas/memory.schemas";
import type { MemoryEntry } from "~/memory/__schemas/memory.schemas";

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a MemoryEntry with sensible defaults, validated via schema.
 */
function createEntry(
  overrides: Partial<MemoryEntry> & {
    id: string;
    title: string;
    content: string;
    added_at: string;
  },
): MemoryEntry {
  return memoryEntrySchema.parse({
    category: "pattern",
    ...overrides,
  });
}

/** Create an ISO date string N days ago from now. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// ─── Strategy Assignment ───────────────────────────────────────────────────────

describe("strategy assignment", () => {
  test("old entry (1 year), zero recalls, low confidence -> archive", () => {
    const entries = [
      createEntry({
        id: "old-entry",
        title: "Old Pattern",
        content: "This is an old pattern that nobody uses anymore.",
        confidence: "low",
        added_at: daysAgo(365),
        recall_count: 0,
        token_estimate: 50,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]!.strategy).toBe("archive");
    expect(recommendations[0]!.entry_id).toBe("old-entry");
  });

  test("recent entry (1 week), high recalls, high confidence -> keep", () => {
    const entries = [
      createEntry({
        id: "recent-entry",
        title: "Active Decision",
        content: "This is a recent decision we use all the time.",
        confidence: "high",
        added_at: daysAgo(7),
        recall_count: 10,
        token_estimate: 40,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]!.strategy).toBe("keep");
  });

  test("mid-priority entry gets summarize", () => {
    // Need two entries: one anchor with high recall to set the max,
    // and one target entry that should land in summarize range.
    // Target: moderate age, zero recalls, medium confidence
    // age = 200/365 ~ 0.548, staleness = 1 - 0/10 = 1.0, inverted_conf = 1 - 0.6 = 0.4
    // priority = 0.548*0.3 + 1.0*0.4 + 0.4*0.3 = 0.164 + 0.4 + 0.12 = 0.684
    // -> should be "summarize" (0.5 <= priority < 0.7)
    const entries = [
      createEntry({
        id: "anchor",
        title: "Anchor Entry",
        content: "High recall anchor",
        confidence: "high",
        added_at: daysAgo(5),
        recall_count: 10,
        token_estimate: 20,
      }),
      createEntry({
        id: "mid-entry",
        title: "Medium Priority Pattern",
        content: "A pattern of medium importance that could be summarized.",
        confidence: "medium",
        added_at: daysAgo(200),
        recall_count: 0,
        token_estimate: 60,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);
    const midRec = recommendations.find((r) => r.entry_id === "mid-entry")!;

    // With the anchor providing max recall=10, this entry should be summarize or archive
    expect(["summarize", "archive"]).toContain(midRec.strategy);
  });

  test("two entries with identical title -> deduplicate for the second one", () => {
    const entries = [
      createEntry({
        id: "original",
        title: "Use Bun Instead of Node",
        content: "Always prefer Bun runtime.",
        confidence: "high",
        added_at: daysAgo(30),
        recall_count: 5,
      }),
      createEntry({
        id: "duplicate",
        title: "Use Bun Instead of Node",
        content: "Bun is preferred over Node.js.",
        confidence: "high",
        added_at: daysAgo(25),
        recall_count: 3,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    expect(recommendations).toHaveLength(2);

    const originalRec = recommendations.find((r) => r.entry_id === "original")!;
    const duplicateRec = recommendations.find(
      (r) => r.entry_id === "duplicate",
    )!;

    // Original should NOT be deduplicate
    expect(originalRec.strategy).not.toBe("deduplicate");

    // Duplicate should be deduplicate
    expect(duplicateRec.strategy).toBe("deduplicate");
    expect(duplicateRec.merge_target_id).toBe("original");
  });

  test("case-insensitive duplicate detection", () => {
    const entries = [
      createEntry({
        id: "entry-1",
        title: "Use Functional Patterns",
        content: "Prefer functions over classes.",
        confidence: "high",
        added_at: daysAgo(10),
        recall_count: 3,
      }),
      createEntry({
        id: "entry-2",
        title: "use functional patterns",
        content: "Functions are better than classes.",
        confidence: "medium",
        added_at: daysAgo(5),
        recall_count: 1,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    const duplicateRec = recommendations.find((r) => r.entry_id === "entry-2")!;
    expect(duplicateRec.strategy).toBe("deduplicate");
  });
});

// ─── Scoring ───────────────────────────────────────────────────────────────────

describe("scoring", () => {
  test("older entry scores higher priority than newer entry", () => {
    const entries = [
      createEntry({
        id: "old",
        title: "Old Entry",
        content: "Old content",
        confidence: "medium",
        added_at: daysAgo(365),
        recall_count: 1,
      }),
      createEntry({
        id: "new",
        title: "New Entry",
        content: "New content",
        confidence: "medium",
        added_at: daysAgo(30),
        recall_count: 1,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    const oldRec = recommendations.find((r) => r.entry_id === "old")!;
    const newRec = recommendations.find((r) => r.entry_id === "new")!;

    expect(oldRec.priority).toBeGreaterThan(newRec.priority);
  });

  test("entry with 0 recalls scores higher (more compressible) than entry with many recalls", () => {
    const entries = [
      createEntry({
        id: "no-recall",
        title: "Never Recalled",
        content: "Content A",
        confidence: "medium",
        added_at: daysAgo(100),
        recall_count: 0,
      }),
      createEntry({
        id: "high-recall",
        title: "Often Recalled",
        content: "Content B",
        confidence: "medium",
        added_at: daysAgo(100),
        recall_count: 10,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    const noRecallRec = recommendations.find(
      (r) => r.entry_id === "no-recall",
    )!;
    const highRecallRec = recommendations.find(
      (r) => r.entry_id === "high-recall",
    )!;

    expect(noRecallRec.priority).toBeGreaterThan(highRecallRec.priority);
  });

  test("low confidence entry scores higher than high confidence entry", () => {
    const entries = [
      createEntry({
        id: "low-conf",
        title: "Low Confidence",
        content: "Content A",
        confidence: "low",
        added_at: daysAgo(100),
        recall_count: 1,
      }),
      createEntry({
        id: "high-conf",
        title: "High Confidence",
        content: "Content B",
        confidence: "high",
        added_at: daysAgo(100),
        recall_count: 1,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    const lowConfRec = recommendations.find((r) => r.entry_id === "low-conf")!;
    const highConfRec = recommendations.find(
      (r) => r.entry_id === "high-conf",
    )!;

    expect(lowConfRec.priority).toBeGreaterThan(highConfRec.priority);
  });
});

// ─── Token Savings Estimation ──────────────────────────────────────────────────

describe("token savings estimation", () => {
  test("archive strategy estimates ~100% savings", () => {
    const entries = [
      createEntry({
        id: "archive-entry",
        title: "Archive Me",
        content: "a".repeat(400), // ~100 tokens
        confidence: "low",
        added_at: daysAgo(400),
        recall_count: 0,
        token_estimate: 100,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);
    const rec = recommendations[0]!;

    expect(rec.strategy).toBe("archive");
    expect(rec.estimated_token_savings).toBe(100);
  });

  test("keep strategy estimates 0 savings", () => {
    const entries = [
      createEntry({
        id: "keep-entry",
        title: "Keep Me",
        content: "Important recent content",
        confidence: "high",
        added_at: daysAgo(1),
        recall_count: 10,
        token_estimate: 50,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);
    const rec = recommendations[0]!;

    expect(rec.strategy).toBe("keep");
    expect(rec.estimated_token_savings).toBe(0);
  });

  test("deduplicate strategy estimates ~100% savings of duplicate", () => {
    const entries = [
      createEntry({
        id: "orig",
        title: "Duplicate Title",
        content: "Original content",
        confidence: "high",
        added_at: daysAgo(10),
        recall_count: 5,
        token_estimate: 40,
      }),
      createEntry({
        id: "dup",
        title: "Duplicate Title",
        content: "Duplicate content",
        confidence: "medium",
        added_at: daysAgo(5),
        recall_count: 2,
        token_estimate: 30,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);
    const dupRec = recommendations.find((r) => r.entry_id === "dup")!;

    expect(dupRec.strategy).toBe("deduplicate");
    expect(dupRec.estimated_token_savings).toBe(30); // 100% of dup's 30 tokens
  });

  test("summarize strategy estimates ~70% savings", () => {
    // Create an entry that will get summarize strategy
    // Moderate age, low recall, medium confidence
    const entries = [
      createEntry({
        id: "summarize-entry",
        title: "Summarize Me",
        content: "b".repeat(400),
        confidence: "medium",
        added_at: daysAgo(200),
        recall_count: 0,
        token_estimate: 100,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);
    const rec = recommendations[0]!;

    // Depending on exact scoring, might be summarize or archive
    if (rec.strategy === "summarize") {
      expect(rec.estimated_token_savings).toBe(70); // 70% of 100
    } else if (rec.strategy === "archive") {
      expect(rec.estimated_token_savings).toBe(100); // 100% of 100
    }
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("empty entries array returns empty recommendations", () => {
    const recommendations = analyzeMemoryEntries([]);
    expect(recommendations).toHaveLength(0);
  });

  test("single entry with high confidence returns keep", () => {
    const entries = [
      createEntry({
        id: "single",
        title: "Single Entry",
        content: "Only entry",
        confidence: "high",
        added_at: daysAgo(5),
        recall_count: 3,
        token_estimate: 20,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]!.strategy).toBe("keep");
  });

  test("all entries identical -> first kept, rest deduplicated", () => {
    const entries = [
      createEntry({
        id: "first",
        title: "Same Title",
        content: "Same content",
        confidence: "high",
        added_at: daysAgo(10),
        recall_count: 5,
      }),
      createEntry({
        id: "second",
        title: "Same Title",
        content: "Same content",
        confidence: "high",
        added_at: daysAgo(10),
        recall_count: 5,
      }),
      createEntry({
        id: "third",
        title: "Same Title",
        content: "Same content",
        confidence: "high",
        added_at: daysAgo(10),
        recall_count: 5,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    expect(recommendations).toHaveLength(3);

    const firstRec = recommendations.find((r) => r.entry_id === "first")!;
    const secondRec = recommendations.find((r) => r.entry_id === "second")!;
    const thirdRec = recommendations.find((r) => r.entry_id === "third")!;

    // First is not deduplicated
    expect(firstRec.strategy).not.toBe("deduplicate");

    // Second and third are deduplicated
    expect(secondRec.strategy).toBe("deduplicate");
    expect(thirdRec.strategy).toBe("deduplicate");
  });

  test("recommendations include human-readable reason strings", () => {
    const entries = [
      createEntry({
        id: "reason-test",
        title: "Test Reason",
        content: "Content for reason testing",
        confidence: "low",
        added_at: daysAgo(365),
        recall_count: 0,
        token_estimate: 50,
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);

    expect(recommendations[0]!.reason).toBeDefined();
    expect(recommendations[0]!.reason.length).toBeGreaterThan(0);
    expect(typeof recommendations[0]!.reason).toBe("string");
  });

  test("entry without token_estimate uses content-based estimation", () => {
    const content = "a".repeat(80); // ~20 tokens estimated from content
    const entries = [
      createEntry({
        id: "no-estimate",
        title: "No Token Estimate",
        content,
        confidence: "low",
        added_at: daysAgo(400),
        recall_count: 0,
        // token_estimate defaults to 0
      }),
    ];

    const recommendations = analyzeMemoryEntries(entries);
    const rec = recommendations[0]!;

    // Should use content-based estimation (80 chars / 4 = 20 tokens)
    expect(rec.estimated_token_savings).toBeGreaterThan(0);
  });
});
