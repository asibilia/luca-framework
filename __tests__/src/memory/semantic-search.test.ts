import { describe, test, expect } from "bun:test";
import {
  tokenize,
  computeTfIdf,
  cosineSimilarity,
  semanticRecall,
} from "../../../src/memory/__helpers/semantic-search";
import type { MemoryEntry } from "../../../src/memory/__schemas/memory.schemas";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<MemoryEntry> & { title: string; content: string },
): MemoryEntry {
  return {
    id: `test-${overrides.title.slice(0, 10)}`,
    category: "pattern",
    tags: [],
    agent: "general",
    confidence: "medium",
    added_at: new Date().toISOString(),
    recall_count: 0,
    token_estimate: 0,
    ...overrides,
  };
}

// ─── tokenize ──────────────────────────────────────────────────────────────────

describe("tokenize", () => {
  test("splits text into lowercase tokens", () => {
    const tokens = tokenize("Hello World Foo");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).toContain("foo");
  });

  test("removes stop words", () => {
    const tokens = tokenize("the quick brown fox is a very fast animal");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("very");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
    expect(tokens).toContain("fast");
    expect(tokens).toContain("animal");
  });

  test("removes single-character tokens", () => {
    const tokens = tokenize("I am a b c developer");
    expect(tokens).not.toContain("b");
    expect(tokens).not.toContain("c");
    expect(tokens).toContain("developer");
  });

  test("splits on non-alphanumeric boundaries", () => {
    const tokens = tokenize("state-machine/workflow.test");
    expect(tokens).toContain("state");
    expect(tokens).toContain("machine");
    expect(tokens).toContain("workflow");
    expect(tokens).toContain("test");
  });

  test("returns empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  test("returns empty array for only stop words", () => {
    expect(tokenize("the and or is")).toEqual([]);
  });
});

// ─── computeTfIdf ──────────────────────────────────────────────────────────────

describe("computeTfIdf", () => {
  test("returns empty map for empty tokens", () => {
    const result = computeTfIdf([], [["foo", "bar"]]);
    expect(result.size).toBe(0);
  });

  test("returns empty map for empty corpus", () => {
    const result = computeTfIdf(["foo"], []);
    expect(result.size).toBe(0);
  });

  test("common terms get lower weights than rare terms", () => {
    const corpus = [
      ["state", "machine", "workflow"],
      ["state", "management", "redux"],
      ["database", "query", "optimization"],
    ];

    const doc1Vector = computeTfIdf(corpus[0]!, corpus);
    // "state" appears in 2/3 docs, "machine" in 1/3
    // "machine" should have higher weight than "state"
    const stateWeight = doc1Vector.get("state") ?? 0;
    const machineWeight = doc1Vector.get("machine") ?? 0;
    expect(machineWeight).toBeGreaterThan(stateWeight);
  });

  test("all weights are positive", () => {
    const tokens = ["foo", "bar", "baz"];
    const corpus = [tokens, ["foo", "qux"]];

    const result = computeTfIdf(tokens, corpus);
    for (const [, weight] of result) {
      expect(weight).toBeGreaterThan(0);
    }
  });
});

// ─── cosineSimilarity ──────────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  test("identical vectors have similarity 1.0", () => {
    const v = new Map([
      ["foo", 1],
      ["bar", 2],
    ]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  test("orthogonal vectors have similarity 0.0", () => {
    const a = new Map([["foo", 1]]);
    const b = new Map([["bar", 1]]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  test("empty vectors return 0", () => {
    expect(cosineSimilarity(new Map(), new Map())).toBe(0);
    expect(cosineSimilarity(new Map([["foo", 1]]), new Map())).toBe(0);
  });

  test("partially overlapping vectors have 0 < similarity < 1", () => {
    const a = new Map([
      ["foo", 1],
      ["bar", 1],
    ]);
    const b = new Map([
      ["foo", 1],
      ["baz", 1],
    ]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

// ─── semanticRecall ────────────────────────────────────────────────────────────

describe("semanticRecall", () => {
  const memories: MemoryEntry[] = [
    makeEntry({
      title: "XState v5 state machine",
      content: "Use XState v5 for workflow state management with snapshots",
      tags: ["state-machine", "xstate", "architecture"],
    }),
    makeEntry({
      title: "Bun runtime requirement",
      content: "Always use bun instead of node for running scripts and tests",
      tags: ["bun", "runtime", "tooling"],
    }),
    makeEntry({
      title: "Wave-based parallel execution",
      content:
        "Execute independent plans in parallel waves for better throughput",
      tags: ["performance", "planning", "execution"],
    }),
    makeEntry({
      title: "Zod safeParse at API boundaries",
      content:
        "Use safeParse over parse to prevent runtime crashes at boundaries",
      tags: ["validation", "zod", "safety"],
    }),
  ];

  test("returns entries ranked by relevance", () => {
    const results = semanticRecall("state machine workflow xstate", memories);
    expect(results.length).toBeGreaterThan(0);
    // The XState entry should rank highest
    expect(results[0]!.entry.title).toContain("XState");
  });

  test("filters out zero-similarity entries", () => {
    const results = semanticRecall("state machine", memories);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  test("respects limit parameter", () => {
    const results = semanticRecall("execution runtime", memories, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test("returns empty array for empty query", () => {
    expect(semanticRecall("", memories)).toEqual([]);
    expect(semanticRecall("   ", memories)).toEqual([]);
  });

  test("returns empty array for empty memories", () => {
    expect(semanticRecall("test query", [])).toEqual([]);
  });

  test("returns empty array for stop-words-only query", () => {
    expect(semanticRecall("the and or is", memories)).toEqual([]);
  });

  test("scores are between 0 and 1", () => {
    const results = semanticRecall("state machine validation", memories);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  test("includes tags in similarity computation", () => {
    const results = semanticRecall("zod validation safety", memories);
    expect(results.length).toBeGreaterThan(0);
    // The Zod entry has matching tags
    expect(results[0]!.entry.title).toContain("Zod");
  });

  test("scores are rounded to 3 decimal places", () => {
    const results = semanticRecall("state machine", memories);
    for (const r of results) {
      const str = r.score.toString();
      const decimals = str.includes(".") ? str.split(".")[1]!.length : 0;
      expect(decimals).toBeLessThanOrEqual(3);
    }
  });
});
