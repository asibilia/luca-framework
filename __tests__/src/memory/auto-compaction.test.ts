import { describe, test, expect } from "bun:test";
import {
  shouldTriggerCompaction,
  scoreSections,
  compactSection,
  compactWorkingMemory,
} from "../../../src/memory/__helpers/auto-compaction.ts";
import { estimateTokens } from "../../../src/memory/__helpers/token-estimator.ts";
import type {
  WorkingMemory,
  CompactionConfig,
  WorkingMemorySection,
} from "../../../src/memory/__schemas/memory.schemas";

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

function makeWm(overrides: Partial<WorkingMemory> = {}): WorkingMemory {
  return {
    sections: [],
    total_tokens: 0,
    status: "active",
    ...overrides,
  };
}

function makeSection(name: WorkingMemorySection["name"], content: string, lastUpdated?: string) {
  return {
    name,
    content,
    token_estimate: estimateTokens(content),
    last_updated_at: lastUpdated ?? new Date().toISOString(),
  };
}

/** Generate a long content string of approximately N tokens. */
function longContent(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) =>
      `Line ${i}: This is test content with enough words to generate reasonable token estimates`,
  ).join("\n");
}

// ─── R9.1: shouldTriggerCompaction ──────────────────────────────────────────

describe("shouldTriggerCompaction", () => {
  test("triggers at degrading zone (default trigger)", () => {
    expect(shouldTriggerCompaction("degrading")).toBe(true);
  });

  test("triggers at stop zone (worse than default trigger)", () => {
    expect(shouldTriggerCompaction("stop")).toBe(true);
  });

  test("does not trigger at good zone", () => {
    expect(shouldTriggerCompaction("good")).toBe(false);
  });

  test("does not trigger at peak zone", () => {
    expect(shouldTriggerCompaction("peak")).toBe(false);
  });

  test("respects custom trigger_zone config", () => {
    const config: Partial<CompactionConfig> = { trigger_zone: "good" };
    expect(shouldTriggerCompaction("good", config)).toBe(true);
    expect(shouldTriggerCompaction("peak", config)).toBe(false);
  });
});

// ─── R9.2: scoreSections ────────────────────────────────────────────────────

describe("scoreSections", () => {
  test("returns scores for all sections", () => {
    const wm = makeWm({
      sections: [
        makeSection("session_info", "Session data"),
        makeSection("findings", "Some findings"),
        makeSection("hypotheses", "A hypothesis"),
      ],
      total_tokens: 100,
    });

    const scores = scoreSections(wm);
    expect(scores.length).toBe(3);
  });

  test("exempt sections receive composite score 0", () => {
    const wm = makeWm({
      sections: [
        makeSection("session_info", "Session data"),
        makeSection("findings", "Some findings"),
      ],
      total_tokens: 100,
    });

    // session_info is exempt by default
    const scores = scoreSections(wm);
    const sessionScore = scores.find((s) => s.section === "session_info");
    expect(sessionScore?.composite_score).toBe(0);
  });

  test("hypotheses score higher than planning_notes (less relevant)", () => {
    // Use old timestamps to ensure age score is similar
    const oldTime = new Date(Date.now() - 3600000).toISOString();
    const wm = makeWm({
      sections: [
        makeSection("planning_notes", longContent(20), oldTime),
        makeSection("hypotheses", longContent(20), oldTime),
      ],
      total_tokens: 1000,
      session_started_at: new Date(Date.now() - 7200000).toISOString(),
    });

    const scores = scoreSections(wm);
    const hypothesesScore = scores.find((s) => s.section === "hypotheses");
    const planningScore = scores.find((s) => s.section === "planning_notes");

    // hypotheses relevance_score = 0.7, planning_notes = 0.2
    expect(hypothesesScore!.relevance_score).toBeGreaterThan(
      planningScore!.relevance_score,
    );
  });

  test("sorted descending by composite score", () => {
    const oldTime = new Date(Date.now() - 3600000).toISOString();
    const wm = makeWm({
      sections: [
        makeSection("session_info", "Short", oldTime),
        makeSection("findings", longContent(30), oldTime),
        makeSection("hypotheses", longContent(30), oldTime),
      ],
      total_tokens: 2000,
      session_started_at: new Date(Date.now() - 7200000).toISOString(),
    });

    const scores = scoreSections(wm);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]!.composite_score).toBeGreaterThanOrEqual(
        scores[i + 1]!.composite_score,
      );
    }
  });

  test("empty sections receive composite score 0", () => {
    const wm = makeWm({
      sections: [
        {
          name: "findings",
          content: "",
          token_estimate: 0,
          last_updated_at: new Date().toISOString(),
        },
      ],
      total_tokens: 0,
    });

    const scores = scoreSections(wm);
    expect(scores[0]!.composite_score).toBe(0);
  });
});

// ─── R9.3: compactSection ───────────────────────────────────────────────────

describe("compactSection", () => {
  test("returns content unchanged if within budget", () => {
    const content = "Short content";
    const result = compactSection(content, 1000);

    expect(result.summary).toBe(content);
    expect(result.tokens_before).toBe(result.tokens_after);
  });

  test("produces compacted summary with marker", () => {
    const content = longContent(100);
    const result = compactSection(content, 50);

    expect(result.summary).toContain("[Compacted:");
    expect(result.tokens_after).toBeLessThan(result.tokens_before);
  });

  test("keeps most recent lines (from end of content)", () => {
    const lines = [
      "Old line 1",
      "Old line 2",
      "Old line 3",
      "Recent line A",
      "Recent line B",
    ];
    const content = lines.join("\n");
    const result = compactSection(content, 20);

    // Should contain the most recent lines
    expect(result.summary).toContain("Recent line B");
  });

  test("includes original token count in marker", () => {
    const content = longContent(50);
    const tokensBefore = estimateTokens(content);
    const result = compactSection(content, 50);

    expect(result.summary).toContain(`~${tokensBefore} tokens`);
  });
});

// ─── R9.4: compactWorkingMemory (session_continued) ─────────────────────────

describe("compactWorkingMemory", () => {
  test("always returns session_continued: true", () => {
    const wm = makeWm({
      sections: [makeSection("findings", longContent(50))],
      total_tokens: 1000,
    });

    const { result } = compactWorkingMemory(wm);
    expect(result.session_continued).toBe(true);
  });

  test("compacts eligible sections above threshold and over budget", () => {
    // Use old timestamp and large content to ensure compaction triggers
    const oldTime = new Date(Date.now() - 3600000).toISOString();
    const bigContent = longContent(200);

    const wm = makeWm({
      sections: [
        makeSection("session_info", "Session data", oldTime),
        makeSection("findings", bigContent, oldTime),
        makeSection("hypotheses", bigContent, oldTime),
      ],
      total_tokens:
        estimateTokens("Session data") + estimateTokens(bigContent) * 2,
      session_started_at: new Date(Date.now() - 7200000).toISOString(),
    });

    const config: Partial<CompactionConfig> = {
      score_threshold: 0.1,
      min_section_age_ms: 0, // no minimum age
      summary_max_tokens: 100,
    };

    const { result, workingMemory } = compactWorkingMemory(wm, config);

    // Should have compacted at least one section
    expect(result.sections_compacted.length).toBeGreaterThan(0);
    expect(result.tokens_after).toBeLessThan(result.tokens_before);

    // session_info is exempt — should NOT be compacted
    expect(result.sections_compacted).not.toContain("session_info");

    // Working memory total_tokens should match section sum
    const manualTotal = workingMemory.sections.reduce(
      (sum, s) => sum + s.token_estimate,
      0,
    );
    expect(workingMemory.total_tokens).toBe(manualTotal);
  });

  test("skips exempt sections", () => {
    const oldTime = new Date(Date.now() - 3600000).toISOString();
    const bigContent = longContent(200);

    const wm = makeWm({
      sections: [makeSection("session_info", bigContent, oldTime)],
      total_tokens: estimateTokens(bigContent),
      session_started_at: new Date(Date.now() - 7200000).toISOString(),
    });

    const config: Partial<CompactionConfig> = {
      score_threshold: 0.0,
      min_section_age_ms: 0,
      summary_max_tokens: 50,
    };

    const { result } = compactWorkingMemory(wm, config);

    // session_info is exempt by default
    expect(result.sections_compacted).not.toContain("session_info");
  });

  test("handles empty working memory gracefully", () => {
    const wm = makeWm({ sections: [], total_tokens: 0 });

    const { result } = compactWorkingMemory(wm);

    expect(result.sections_compacted.length).toBe(0);
    expect(result.tokens_before).toBe(0);
    expect(result.tokens_after).toBe(0);
    expect(result.session_continued).toBe(true);
  });

  test("includes section scores in result", () => {
    const wm = makeWm({
      sections: [
        makeSection("findings", "Some findings"),
        makeSection("hypotheses", "A hypothesis"),
      ],
      total_tokens: 50,
    });

    const { result } = compactWorkingMemory(wm);

    expect(result.scores.length).toBe(2);
    expect(result.scores[0]!.section).toBeDefined();
    expect(result.scores[0]!.composite_score).toBeDefined();
  });

  test("respects min_section_age_ms", () => {
    // Use a VERY recent timestamp
    const recentTime = new Date().toISOString();
    const bigContent = longContent(200);

    const wm = makeWm({
      sections: [makeSection("findings", bigContent, recentTime)],
      total_tokens: estimateTokens(bigContent),
      session_started_at: new Date(Date.now() - 7200000).toISOString(),
    });

    const config: Partial<CompactionConfig> = {
      score_threshold: 0.0,
      min_section_age_ms: 86400000, // 24 hours — nothing qualifies
      summary_max_tokens: 50,
    };

    const { result } = compactWorkingMemory(wm, config);

    // Nothing should be compacted because age requirement not met
    expect(result.sections_compacted.length).toBe(0);
  });
});
