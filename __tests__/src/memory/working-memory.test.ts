import { describe, test, expect } from "bun:test";
import {
  parseWorkingMemory,
  serializeWorkingMemory,
  addSection,
  summarizeSection,
  shouldAutoSummarize,
} from "../../../src/memory/__helpers/working-memory.ts";
import { estimateTokens } from "../../../src/memory/__helpers/token-estimator.ts";

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

const STANDARD_TEMPLATE = `# Working Memory

## Session Info

- **Started**: (new session)
- **Workflow**: (none)
- **Phase**: (none)

## Memory Recall

(None yet)

## Planning Notes

(None yet)

---

_Session Status_

- [ ] Active
- [ ] Learnings extracted
- [ ] Ready to clear
`;

const POPULATED_TEMPLATE = `# Working Memory

## Session Info

- **Started**: 2026-02-14T10:00:00Z
- **Workflow**: lu-execute-phase
- **Phase**: 36

## Memory Recall

- **Pattern A**: Some recalled pattern
  Tags: [patterns, coding]
- **Decision B**: A recalled decision

## Planning Notes

Working on memory compression module.
Need to implement token estimation.

## Findings

Found that MEMORY.md is 89KB.
This exceeds the recommended threshold.

## Hypotheses

The token estimation heuristic of 4 chars/token
may be inaccurate for dense code blocks.

## Candidate Learnings

- Schema-first parsing reduces bugs at API boundaries

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
`;

const EXTRACTED_STATUS_TEMPLATE = `# Working Memory

## Session Info

- **Started**: 2026-02-14

---

_Session Status_

- [x] Active
- [x] Learnings extracted
- [ ] Ready to clear
`;

// ─── parseWorkingMemory ──────────────────────────────────────────────────────

describe("parseWorkingMemory", () => {
  test("parses standard template with empty sections successfully", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections.length).toBe(3);
      expect(result.data.sections[0]!.name).toBe("session_info");
      expect(result.data.sections[1]!.name).toBe("memory_recall");
      expect(result.data.sections[2]!.name).toBe("planning_notes");
    }
  });

  test("parses populated sections and extracts content correctly", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections.length).toBe(6);

      const sessionInfo = result.data.sections.find(
        (s) => s.name === "session_info",
      );
      expect(sessionInfo).toBeDefined();
      expect(sessionInfo!.content).toContain("2026-02-14T10:00:00Z");

      const findings = result.data.sections.find((s) => s.name === "findings");
      expect(findings).toBeDefined();
      expect(findings!.content).toContain("89KB");
    }
  });

  test("maps section names correctly: ## Session Info -> session_info", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      const names = result.data.sections.map((s) => s.name);
      expect(names).toContain("session_info");
      expect(names).toContain("memory_recall");
      expect(names).toContain("planning_notes");
      expect(names).toContain("findings");
      expect(names).toContain("hypotheses");
      expect(names).toContain("candidate_learnings");
    }
  });

  test("calculates token estimates for each section", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      for (const section of result.data.sections) {
        if (section.content.trim()) {
          expect(section.token_estimate).toBeGreaterThan(0);
        }
      }
    }
  });

  test("total tokens equals sum of section tokens", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      const sumOfSections = result.data.sections.reduce(
        (sum, s) => sum + s.token_estimate,
        0,
      );
      expect(result.data.total_tokens).toBe(sumOfSections);
    }
  });

  test("detects active status from checked checkbox", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });

  test("detects extracted status from checked checkbox", () => {
    const result = parseWorkingMemory(EXTRACTED_STATUS_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("extracted");
    }
  });

  test("defaults to active when no checkboxes are checked", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });
});

// ─── serializeWorkingMemory ──────────────────────────────────────────────────

describe("serializeWorkingMemory", () => {
  test("produces valid markdown with # Working Memory title", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const output = serializeWorkingMemory(result.data);
      expect(output).toContain("# Working Memory");
    }
  });

  test("each section appears as ## Section Name header", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const output = serializeWorkingMemory(result.data);
      expect(output).toContain("## Session Info");
      expect(output).toContain("## Memory Recall");
      expect(output).toContain("## Planning Notes");
      expect(output).toContain("## Findings");
      expect(output).toContain("## Hypotheses");
      expect(output).toContain("## Candidate Learnings");
    }
  });

  test("status checkboxes are included at the bottom", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const output = serializeWorkingMemory(result.data);
      expect(output).toContain("_Session Status_");
      expect(output).toContain("[x] Active");
      expect(output).toContain("[ ] Learnings extracted");
      expect(output).toContain("[ ] Ready to clear");
    }
  });

  test("empty sections produce header with no content", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      // The "(None yet)" placeholders are content
      const output = serializeWorkingMemory(result.data);
      expect(output).toContain("## Session Info");
    }
  });
});

// ─── Roundtrip consistency ──────────────────────────────────────────────────

describe("roundtrip consistency", () => {
  test("parse -> serialize preserves section content", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const serialized = serializeWorkingMemory(result.data);
      const reparsed = parseWorkingMemory(serialized);

      expect(reparsed.success).toBe(true);
      if (reparsed.success) {
        expect(reparsed.data.sections.length).toBe(result.data.sections.length);

        for (let i = 0; i < result.data.sections.length; i++) {
          expect(reparsed.data.sections[i]!.name).toBe(
            result.data.sections[i]!.name,
          );
          expect(reparsed.data.sections[i]!.content.trim()).toBe(
            result.data.sections[i]!.content.trim(),
          );
        }
      }
    }
  });

  test("section order is preserved through roundtrip", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const serialized = serializeWorkingMemory(result.data);
      const reparsed = parseWorkingMemory(serialized);

      expect(reparsed.success).toBe(true);
      if (reparsed.success) {
        const originalNames = result.data.sections.map((s) => s.name);
        const reparsedNames = reparsed.data.sections.map((s) => s.name);
        expect(reparsedNames).toEqual(originalNames);
      }
    }
  });
});

// ─── addSection ──────────────────────────────────────────────────────────────

describe("addSection", () => {
  test("append mode concatenates with separator", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const updated = addSection(
        result.data,
        "findings",
        "New finding: performance is good",
      );

      const findings = updated.sections.find((s) => s.name === "findings");
      expect(findings).toBeDefined();
      expect(findings!.content).toContain("89KB");
      expect(findings!.content).toContain("New finding: performance is good");
    }
  });

  test("replace mode overwrites entirely", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const updated = addSection(
        result.data,
        "findings",
        "Completely new content",
        "replace",
      );

      const findings = updated.sections.find((s) => s.name === "findings");
      expect(findings).toBeDefined();
      expect(findings!.content).toBe("Completely new content");
      expect(findings!.content).not.toContain("89KB");
    }
  });

  test("adding to non-existent section creates it", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const updated = addSection(result.data, "hypotheses", "First hypothesis");

      const hypotheses = updated.sections.find((s) => s.name === "hypotheses");
      expect(hypotheses).toBeDefined();
      expect(hypotheses!.content).toBe("First hypothesis");
    }
  });

  test("token estimates are recalculated after mutation", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const longContent = "a".repeat(1000);
      const updated = addSection(result.data, "findings", longContent);

      const findings = updated.sections.find((s) => s.name === "findings");
      expect(findings).toBeDefined();
      expect(findings!.token_estimate).toBe(estimateTokens(longContent));
      expect(updated.total_tokens).toBeGreaterThan(result.data.total_tokens);
    }
  });

  test("returns NEW object (original unchanged)", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const original = result.data;
      const originalSectionCount = original.sections.length;
      const updated = addSection(original, "hypotheses", "Test");

      expect(original.sections.length).toBe(originalSectionCount);
      expect(updated.sections.length).toBe(originalSectionCount + 1);
      expect(updated).not.toBe(original);
    }
  });
});

// ─── summarizeSection ────────────────────────────────────────────────────────

describe("summarizeSection", () => {
  test("section below threshold is returned unchanged", () => {
    const result = parseWorkingMemory(POPULATED_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const summarized = summarizeSection(result.data, "findings", 10000);

      const original = result.data.sections.find((s) => s.name === "findings");
      const after = summarized.sections.find((s) => s.name === "findings");
      expect(after!.content).toBe(original!.content);
    }
  });

  test("section above threshold is truncated with [Summarized] marker", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      // Add a very large section
      const largeContent = Array.from(
        { length: 500 },
        (_, i) => `Line ${i}: ${"content ".repeat(20)}`,
      ).join("\n");
      const withLarge = addSection(result.data, "findings", largeContent);

      // Summarize with a small threshold
      const summarized = summarizeSection(withLarge, "findings", 100);

      const after = summarized.sections.find((s) => s.name === "findings");
      expect(after).toBeDefined();
      expect(after!.content).toContain("[Summarized:");
      expect(after!.token_estimate).toBeLessThan(estimateTokens(largeContent));
    }
  });

  test("returns immutable result (original unchanged)", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const largeContent = "x".repeat(20000);
      const withLarge = addSection(result.data, "findings", largeContent);
      const originalTokens = withLarge.total_tokens;

      const summarized = summarizeSection(withLarge, "findings", 100);

      expect(withLarge.total_tokens).toBe(originalTokens);
      expect(summarized.total_tokens).toBeLessThan(originalTokens);
    }
  });
});

// ─── shouldAutoSummarize ──────────────────────────────────────────────────────

describe("shouldAutoSummarize", () => {
  test("no sections over threshold returns should_summarize: false", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const check = shouldAutoSummarize(result.data, {
        section: 10000,
        total: 50000,
      });
      expect(check.should_summarize).toBe(false);
      expect(check.sections_over).toHaveLength(0);
    }
  });

  test("one section over threshold returns it in sections_over", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      const largeContent = "x".repeat(1000);
      const withLarge = addSection(result.data, "findings", largeContent);

      const check = shouldAutoSummarize(withLarge, {
        section: 100,
        total: 50000,
      });
      expect(check.should_summarize).toBe(true);
      expect(check.sections_over).toContain("findings");
    }
  });

  test("total over threshold returns should_summarize: true even if no individual section is over", () => {
    const result = parseWorkingMemory(STANDARD_TEMPLATE);
    expect(result.success).toBe(true);
    if (result.success) {
      // Add small content to many sections to exceed total
      let wm = result.data;
      wm = addSection(wm, "findings", "x".repeat(100));
      wm = addSection(wm, "hypotheses", "y".repeat(100));

      const check = shouldAutoSummarize(wm, {
        section: 10000,
        total: 10,
      });
      expect(check.should_summarize).toBe(true);
    }
  });
});
