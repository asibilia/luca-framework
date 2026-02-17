import { describe, test, expect } from "bun:test";
import {
  generateSnapshot,
  extractSection,
  extractPreservableSections,
} from "../snapshot";
import { workflowContextSchema } from "../types";
import type { WorkflowContext } from "../types";

// ─── Test Helpers ───────────────────────────────────────────────────────────

/**
 * Create a minimal workflow context for testing.
 *
 * Uses workflowContextSchema.parse directly to ensure all fields
 * (including current_milestone, phase_results, etc.) are included.
 */
function createTestContext(
  overrides?: Partial<WorkflowContext>,
): WorkflowContext {
  return workflowContextSchema.parse({
    session_id: "test-session-00000000-0000-0000-0000-000000000001",
    ticket_id: "TEST-42",
    complexity: "MODERATE",
    oversight: "milestone",
    branch: "feat/test-branch",
    base_branch: "main",
    started_at: "2026-02-14T00:00:00Z",
    ...overrides,
  });
}

// ─── extractSection ─────────────────────────────────────────────────────────

describe("extractSection", () => {
  test("extracts a section between two headings", () => {
    const content = `# Title

## First Section

Content of first section.

## Second Section

Content of second section.

## Third Section

Content of third.
`;
    const result = extractSection(content, "Second Section");
    expect(result).toBeDefined();
    expect(result).toContain("## Second Section");
    expect(result).toContain("Content of second section.");
    expect(result).not.toContain("## Third Section");
    expect(result).not.toContain("Content of first section.");
  });

  test("extracts the last section to end of file", () => {
    const content = `## First

Some content.

## Last Section

Final content here.
`;
    const result = extractSection(content, "Last Section");
    expect(result).toBeDefined();
    expect(result).toContain("## Last Section");
    expect(result).toContain("Final content here.");
  });

  test("returns undefined for missing section", () => {
    const content = `## First Section

Content.
`;
    const result = extractSection(content, "Nonexistent Section");
    expect(result).toBeUndefined();
  });

  test("handles sections with special regex characters", () => {
    const content = `## Section (v1.0)

Content about version 1.0.

## Next
`;
    const result = extractSection(content, "Section (v1.0)");
    expect(result).toBeDefined();
    expect(result).toContain("Content about version 1.0.");
  });

  test("handles empty section", () => {
    const content = `## Empty Section

## Next Section

Content.
`;
    const result = extractSection(content, "Empty Section");
    expect(result).toBeDefined();
    expect(result).toContain("## Empty Section");
    expect(result).not.toContain("## Next Section");
  });
});

// ─── extractPreservableSections ─────────────────────────────────────────────

describe("extractPreservableSections", () => {
  test("extracts all preservable sections from STATE.md", () => {
    const content = `# Project State

## Current Position

Status info here.

## Previous Milestones

### v1.0.0

Milestone content.

## Pending Todos

- Todo item 1
- Todo item 2

## Next Actions

1. Do something
2. Do something else

## Project Reference

See: .planning/PROJECT.md

## Session Continuity

Session info.
`;
    const sections = extractPreservableSections(content);

    expect(sections.has("Previous Milestones")).toBe(true);
    expect(sections.has("Pending Todos")).toBe(true);
    expect(sections.has("Next Actions")).toBe(true);
    expect(sections.has("Project Reference")).toBe(true);

    expect(sections.get("Previous Milestones")).toContain("### v1.0.0");
    expect(sections.get("Pending Todos")).toContain("Todo item 1");
    expect(sections.get("Next Actions")).toContain("Do something");
  });

  test("returns empty map for content without preservable sections", () => {
    const content = `# Project State

## Current Position

Just status info.
`;
    const sections = extractPreservableSections(content);
    expect(sections.size).toBe(0);
  });

  test("extracts only present sections", () => {
    const content = `# Project State

## Pending Todos

- One todo

## Other Section

Not preservable.
`;
    const sections = extractPreservableSections(content);
    expect(sections.size).toBe(1);
    expect(sections.has("Pending Todos")).toBe(true);
    expect(sections.has("Other Section")).toBe(false);
  });
});

// ─── generateSnapshot ───────────────────────────────────────────────────────

describe("generateSnapshot", () => {
  test("generates valid markdown with all required sections", () => {
    const context = createTestContext();
    const result = generateSnapshot({
      state: "idle",
      context,
    });

    expect(result).toContain("# Project State");
    expect(result).toContain("## Current Position");
    expect(result).toContain("## Session Identity");
    expect(result).toContain("## Progress");
    expect(result).toContain("## Git Context");
    expect(result).toContain("## Session Continuity");
  });

  test("includes state and complexity in Current Position", () => {
    const context = createTestContext({ complexity: "COMPLEX" });
    const result = generateSnapshot({
      state: "executing",
      context,
    });

    expect(result).toContain("**Status:** Executing");
    expect(result).toContain("**Task Complexity:** COMPLEX");
  });

  test("includes oversight level", () => {
    const context = createTestContext({ oversight: "full-auto" });
    const result = generateSnapshot({
      state: "idle",
      context,
    });

    expect(result).toContain("**Oversight:** full-auto");
  });

  test("includes session identity fields", () => {
    const context = createTestContext({
      ticket_id: "PROJ-999",
      github_issue: 42,
    });
    const result = generateSnapshot({
      state: "idle",
      context,
    });

    expect(result).toContain("**Session ID:**");
    expect(result).toContain("**Ticket:** PROJ-999");
    expect(result).toContain("**GitHub Issue:** #42");
  });

  test("includes current milestone when set", () => {
    const context = createTestContext({
      current_milestone: "v2.0.0 -- Major Release",
    });
    const result = generateSnapshot({
      state: "executing",
      context,
    });

    expect(result).toContain("**Current Milestone:** v2.0.0 -- Major Release");
  });

  test("includes current phase when set", () => {
    const context = createTestContext({ current_phase: 35 });
    const result = generateSnapshot({
      state: "executing",
      context,
    });

    expect(result).toContain("**Current Phase:** Phase 35");
  });

  test("shows phase results in progress block", () => {
    const context = createTestContext({
      phase_results: [
        {
          phase_id: 34,
          status: "passed",
          summary: "XState core machine",
          errors: [],
          duration_ms: 5000,
          timestamp: "2026-02-14T00:00:00Z",
        },
        {
          phase_id: 35,
          status: "failed",
          summary: "Integration failed",
          errors: ["type error"],
          duration_ms: 3000,
          timestamp: "2026-02-14T01:00:00Z",
        },
      ],
    });
    const result = generateSnapshot({
      state: "verifying",
      context,
    });

    expect(result).toContain("Phase 34: complete");
    expect(result).toContain("XState core machine");
    expect(result).toContain("Phase 35: failed");
    expect(result).toContain("Integration failed");
  });

  test("shows verification section when attempts > 0", () => {
    const context = createTestContext({
      verification_attempts: 2,
      max_verification_attempts: 3,
    });
    const result = generateSnapshot({
      state: "verifying",
      context,
    });

    expect(result).toContain("## Verification");
    expect(result).toContain("**Attempts:** 2 / 3");
  });

  test("shows harness result in verification section", () => {
    const context = createTestContext({
      verification_attempts: 1,
      harness_result: {
        status: "failed",
        total_errors: 3,
        total_warnings: 1,
        duration_ms: 2500,
        timestamp: "2026-02-14T00:00:00Z",
      },
    });
    const result = generateSnapshot({
      state: "verifying",
      context,
    });

    expect(result).toContain("**Harness Status:** failed");
    expect(result).toContain("**Errors:** 3");
    expect(result).toContain("**Warnings:** 1");
  });

  test("shows errors section when last_error is set", () => {
    const context = createTestContext({
      last_error: "Build failed with 5 type errors",
    });
    const result = generateSnapshot({
      state: "failed",
      context,
    });

    expect(result).toContain("## Errors");
    expect(result).toContain("**Last Error:** Build failed with 5 type errors");
  });

  test("omits errors section when no error", () => {
    const context = createTestContext();
    const result = generateSnapshot({
      state: "idle",
      context,
    });

    expect(result).not.toContain("## Errors");
  });

  test("includes git context with branch info", () => {
    const context = createTestContext({
      branch: "feat/state-machine",
      base_branch: "main",
      ticket_id: "PROJ-42",
    });
    const result = generateSnapshot({
      state: "idle",
      context,
    });

    expect(result).toContain("## Git Context");
    expect(result).toContain("**Branch:** feat/state-machine");
    expect(result).toContain("**Base Branch:** main");
  });

  test("includes allowed events when provided", () => {
    const context = createTestContext();
    const result = generateSnapshot({
      state: "idle",
      context,
      allowed_events: ["START"],
    });

    expect(result).toContain("## Allowed Events");
    expect(result).toContain("`START`");
  });

  test("omits allowed events section when empty", () => {
    const context = createTestContext();
    const result = generateSnapshot({
      state: "idle",
      context,
      allowed_events: [],
    });

    expect(result).not.toContain("## Allowed Events");
  });

  test("includes intuition flags in session continuity", () => {
    const context = createTestContext({
      intuition_flags: ["RISK", "CAUTION"],
    });
    const result = generateSnapshot({
      state: "executing",
      context,
    });

    expect(result).toContain("**Intuition Flags:** RISK, CAUTION");
  });

  test("includes memory tags in session continuity", () => {
    const context = createTestContext({
      memory_tags: ["state-machine", "xstate"],
    });
    const result = generateSnapshot({
      state: "executing",
      context,
    });

    expect(result).toContain("**Memory Tags:** state-machine, xstate");
  });

  test("includes footer with timestamp", () => {
    const context = createTestContext();
    const result = generateSnapshot({
      state: "idle",
      context,
    });

    expect(result).toContain("---");
    expect(result).toContain("_State generated from machine snapshot at");
  });

  test("shows (no phases completed yet) when no phase results", () => {
    const context = createTestContext();
    const result = generateSnapshot({
      state: "idle",
      context,
    });

    expect(result).toContain("(no phases completed yet)");
  });
});

// ─── Section Preservation ───────────────────────────────────────────────────

describe("section preservation", () => {
  test("preserves Previous Milestones from existing content", () => {
    const context = createTestContext();
    const existingContent = `# Project State

## Current Position

Old position info.

## Previous Milestones

### v1.4.0 -- Developer Experience

- Feature A
- Feature B

### v1.3.0 -- Audit

- Cleanup

## Session Continuity

Old session.
`;
    const result = generateSnapshot({
      state: "idle",
      context,
      existing_content: existingContent,
    });

    expect(result).toContain("## Previous Milestones");
    expect(result).toContain("### v1.4.0 -- Developer Experience");
    expect(result).toContain("Feature A");
    expect(result).toContain("### v1.3.0 -- Audit");
  });

  test("preserves Pending Todos from existing content", () => {
    const context = createTestContext();
    const existingContent = `# Project State

## Current Position

Position.

## Pending Todos

- Important todo item
- Another todo

## Other Section

Other content.
`;
    const result = generateSnapshot({
      state: "executing",
      context,
      existing_content: existingContent,
    });

    expect(result).toContain("## Pending Todos");
    expect(result).toContain("Important todo item");
    expect(result).toContain("Another todo");
  });

  test("preserves Next Actions from existing content", () => {
    const context = createTestContext();
    const existingContent = `# Project State

## Next Actions

1. Execute Phase 35
2. Complete milestone
`;
    const result = generateSnapshot({
      state: "idle",
      context,
      existing_content: existingContent,
    });

    expect(result).toContain("## Next Actions");
    expect(result).toContain("Execute Phase 35");
  });

  test("preserves Project Reference from existing content", () => {
    const context = createTestContext();
    const existingContent = `# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Zero-friction adoption
`;
    const result = generateSnapshot({
      state: "idle",
      context,
      existing_content: existingContent,
    });

    expect(result).toContain("## Project Reference");
    expect(result).toContain("Zero-friction adoption");
  });

  test("preserves Blockers from existing content", () => {
    const context = createTestContext();
    const existingContent = `# Project State

## Blockers

- Waiting on API team for v2 endpoint
`;
    const result = generateSnapshot({
      state: "idle",
      context,
      existing_content: existingContent,
    });

    expect(result).toContain("## Blockers");
    expect(result).toContain("Waiting on API team");
  });

  test("generates without preservation when no existing content", () => {
    const context = createTestContext();
    const result = generateSnapshot({
      state: "idle",
      context,
    });

    // Should still generate a valid snapshot
    expect(result).toContain("# Project State");
    expect(result).toContain("## Current Position");
    expect(result).not.toContain("## Previous Milestones");
    expect(result).not.toContain("## Pending Todos");
  });

  test("preserves multiple sections simultaneously", () => {
    const context = createTestContext();
    const existingContent = `# Project State

## Current Position

Old.

## Previous Milestones

### v1.0.0

Done.

## Pending Todos

- Todo 1

## Next Actions

1. Action 1

## Project Reference

Ref info.

## Blockers

- Blocker 1

## Session Continuity

Old session.
`;
    const result = generateSnapshot({
      state: "executing",
      context,
      existing_content: existingContent,
    });

    expect(result).toContain("## Previous Milestones");
    expect(result).toContain("### v1.0.0");
    expect(result).toContain("## Pending Todos");
    expect(result).toContain("Todo 1");
    expect(result).toContain("## Next Actions");
    expect(result).toContain("Action 1");
    expect(result).toContain("## Project Reference");
    expect(result).toContain("Ref info.");
    expect(result).toContain("## Blockers");
    expect(result).toContain("Blocker 1");
  });
});

// ─── State Label Formatting ─────────────────────────────────────────────────

describe("state label formatting", () => {
  const stateLabels: Array<[string, string]> = [
    ["idle", "Idle"],
    ["preflight", "Pre-flight"],
    ["routing", "Routing"],
    ["discussing", "Discussing"],
    ["planning", "Planning"],
    ["executing", "Executing"],
    ["verifying", "Verifying"],
    ["learning", "Learning"],
    ["committing", "Committing"],
    ["complete", "Complete"],
    ["paused", "Paused"],
    ["failed", "Failed"],
  ];

  for (const [state, label] of stateLabels) {
    test(`formats "${state}" as "${label}"`, () => {
      const context = createTestContext();
      const result = generateSnapshot({ state, context });
      expect(result).toContain(`**Status:** ${label}`);
    });
  }
});
