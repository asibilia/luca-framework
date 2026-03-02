import { describe, test, expect } from "bun:test";
import {
  digestStaleEnvelopes,
  applySectionRetention,
  preserveCriticalContext,
  logPruningEvents,
  pruneWorkingMemory,
} from "../../../src/memory/__helpers/context-pruning.ts";
import { estimateTokens } from "../../../src/memory/__helpers/token-estimator.ts";
import type {
  WorkingMemory,
  WorkingMemorySection,
  PruningConfig,
  PruningEvent,
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

const ENVELOPE_JSON = `\`\`\`json
{
  "status": "success",
  "summary": "Found 3 issues in the codebase",
  "artifacts": [{"path": "src/foo.ts", "action": "modified"}],
  "issues": [],
  "metadata": {"agent_name": "lu-executor", "context_tier": "T2"}
}
\`\`\``;

// ─── R8.1: Stale ResultEnvelope Digestion ────────────────────────────────────

describe("digestStaleEnvelopes", () => {
  test("digests JSON ResultEnvelope blocks in non-critical sections", () => {
    const wm = makeWm({
      sections: [
        makeSection(
          "findings",
          `Some finding\n\n${ENVELOPE_JSON}\n\nMore findings`,
        ),
        makeSection("session_info", "Session data"),
      ],
      total_tokens: 500,
    });

    const { workingMemory, events } = digestStaleEnvelopes(wm);

    // Envelope should be replaced with digest
    const findings = workingMemory.sections.find((s) => s.name === "findings");
    expect(findings?.content).toContain("[Digested:");
    expect(findings?.content).toContain("lu-executor");
    expect(findings?.content).not.toContain('"artifacts"');

    // Should have at least one digest event
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.action).toBe("digest");
    expect(events[0]!.tokens_freed).toBeGreaterThan(0);
  });

  test("preserves critical sections from digestion", () => {
    const wm = makeWm({
      sections: [makeSection("session_info", `Info\n\n${ENVELOPE_JSON}`)],
      total_tokens: 200,
    });

    const { workingMemory, events } = digestStaleEnvelopes(wm);

    // session_info is critical by default — should not be digested
    const sessionInfo = workingMemory.sections.find(
      (s) => s.name === "session_info",
    );
    expect(sessionInfo?.content).toContain('"status"');
    expect(events.length).toBe(0);
  });

  test("handles sections with no envelopes gracefully", () => {
    const wm = makeWm({
      sections: [
        makeSection("findings", "Plain text findings with no envelopes"),
      ],
      total_tokens: 50,
    });

    const { workingMemory, events } = digestStaleEnvelopes(wm);

    expect(events.length).toBe(0);
    const findings = workingMemory.sections.find((s) => s.name === "findings");
    expect(findings?.content).toBe("Plain text findings with no envelopes");
  });

  test("reduces token count after digestion", () => {
    const wm = makeWm({
      sections: [
        makeSection(
          "findings",
          `Finding 1\n\n${ENVELOPE_JSON}\n\nFinding 2\n\n${ENVELOPE_JSON}`,
        ),
      ],
      total_tokens: 1000,
    });

    const { workingMemory } = digestStaleEnvelopes(wm);

    const findings = workingMemory.sections.find((s) => s.name === "findings");
    expect(findings!.token_estimate).toBeLessThan(
      wm.sections[0]!.token_estimate,
    );
  });
});

// ─── R8.2: Section-Level Retention ───────────────────────────────────────────

describe("applySectionRetention", () => {
  test("truncates sections exceeding max_tokens policy", () => {
    // Create a section with ~500 tokens of content
    const longContent = Array.from(
      { length: 100 },
      (_, i) =>
        `Line ${i}: This is a test line with some content to generate tokens`,
    ).join("\n");

    const wm = makeWm({
      sections: [makeSection("findings", longContent)],
      total_tokens: estimateTokens(longContent),
    });

    const config: Partial<PruningConfig> = {
      retention_policies: [
        {
          section: "findings",
          max_tokens: 100,
          max_age_ms: 3600000,
          priority: 3,
        },
      ],
    };

    const { workingMemory, events } = applySectionRetention(wm, config);

    const findings = workingMemory.sections.find((s) => s.name === "findings");
    expect(findings!.token_estimate).toBeLessThanOrEqual(110); // ~100 + marker overhead
    expect(findings!.content).toContain("[Pruned:");
    expect(events.length).toBe(1);
    expect(events[0]!.action).toBe("truncate");
    expect(events[0]!.tokens_freed).toBeGreaterThan(0);
  });

  test("skips sections within their token budget", () => {
    const wm = makeWm({
      sections: [makeSection("findings", "Short content")],
      total_tokens: 10,
    });

    const config: Partial<PruningConfig> = {
      retention_policies: [
        {
          section: "findings",
          max_tokens: 1000,
          max_age_ms: 3600000,
          priority: 3,
        },
      ],
    };

    const { events } = applySectionRetention(wm, config);
    expect(events.length).toBe(0);
  });

  test("skips critical sections even if over budget", () => {
    const longContent = Array.from(
      { length: 100 },
      (_, i) => `Line ${i}: content`,
    ).join("\n");

    const wm = makeWm({
      sections: [makeSection("session_info", longContent)],
      total_tokens: estimateTokens(longContent),
    });

    const config: Partial<PruningConfig> = {
      retention_policies: [
        {
          section: "session_info",
          max_tokens: 50,
          max_age_ms: 3600000,
          priority: 10,
        },
      ],
      critical_sections: ["session_info"],
    };

    const { events } = applySectionRetention(wm, config);
    expect(events.length).toBe(0);
  });
});

// ─── R8.3: Critical Context Preservation ─────────────────────────────────────

describe("preserveCriticalContext", () => {
  test("returns default critical sections", () => {
    const critical = preserveCriticalContext();
    expect(critical.has("session_info")).toBe(true);
    expect(critical.has("planning_notes")).toBe(true);
  });

  test("returns configured critical sections", () => {
    const critical = preserveCriticalContext({
      critical_sections: ["session_info", "findings"],
    });
    expect(critical.has("session_info")).toBe(true);
    expect(critical.has("findings")).toBe(true);
    expect(critical.has("hypotheses")).toBe(false);
  });
});

// ─── R8.4: Pruning Event Logging ─────────────────────────────────────────────

describe("logPruningEvents", () => {
  test("appends pruning events to session_info section", () => {
    const wm = makeWm({
      sections: [makeSection("session_info", "Initial info")],
      total_tokens: 20,
    });

    const events: PruningEvent[] = [
      {
        timestamp: new Date().toISOString(),
        section: "findings",
        action: "digest",
        tokens_freed: 150,
        reason: "Digested 1 stale ResultEnvelope(s) in findings",
      },
    ];

    const updated = logPruningEvents(wm, events);

    const sessionInfo = updated.sections.find((s) => s.name === "session_info");
    expect(sessionInfo?.content).toContain("**Pruning:**");
    expect(sessionInfo?.content).toContain("150 tokens freed");
    expect(sessionInfo?.content).toContain("[digest] findings");
  });

  test("returns unchanged working memory when no events", () => {
    const wm = makeWm({
      sections: [makeSection("session_info", "Info")],
      total_tokens: 10,
    });

    const updated = logPruningEvents(wm, []);
    expect(updated).toBe(wm); // same reference when no events
  });
});

// ─── pruneWorkingMemory (Orchestrator) ───────────────────────────────────────

describe("pruneWorkingMemory", () => {
  test("orchestrates digest + retention + preservation + logging", () => {
    const longContent = Array.from(
      { length: 50 },
      (_, i) => `Line ${i}: Some finding data here`,
    ).join("\n");

    const wm = makeWm({
      sections: [
        makeSection("session_info", "Session data"),
        makeSection("findings", `${longContent}\n\n${ENVELOPE_JSON}`),
        makeSection("planning_notes", "Current plan details"),
        makeSection("hypotheses", "Test hypothesis"),
      ],
      total_tokens: 2000,
    });

    const config: Partial<PruningConfig> = {
      retention_policies: [
        {
          section: "findings",
          max_tokens: 200,
          max_age_ms: 3600000,
          priority: 3,
        },
      ],
      critical_sections: ["session_info", "planning_notes"],
    };

    const { result, workingMemory } = pruneWorkingMemory(wm, config);

    // Should have events
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.total_tokens_freed).toBeGreaterThan(0);

    // Critical sections preserved
    expect(result.preserved_sections).toContain("session_info");
    expect(result.preserved_sections).toContain("planning_notes");

    // Findings should be pruned
    expect(result.sections_pruned.length).toBeGreaterThan(0);

    // Working memory token count should be recalculated
    const manualTotal = workingMemory.sections.reduce(
      (sum, s) => sum + s.token_estimate,
      0,
    );
    expect(workingMemory.total_tokens).toBe(manualTotal);
  });

  test("handles empty working memory gracefully", () => {
    const wm = makeWm({ sections: [], total_tokens: 0 });
    const { result } = pruneWorkingMemory(wm);

    expect(result.events.length).toBe(0);
    expect(result.total_tokens_freed).toBe(0);
    expect(result.sections_pruned.length).toBe(0);
  });
});
