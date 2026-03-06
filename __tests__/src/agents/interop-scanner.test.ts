/**
 * Tests for cross-agent interop scanner.
 */
import { test, expect, describe } from "bun:test";
import {
  InteropReportSchema,
  scanAgentInterop,
} from "../../../src/agents/__helpers/interop-scanner";

import type { AgentConfig } from "../../../src/agents/__schemas/agent.schemas";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeAgent = (
  overrides: Partial<AgentConfig["frontmatter"]> = {},
): AgentConfig => ({
  frontmatter: {
    name: "test-agent",
    description: "A test agent",
    tools: ["Read", "Glob"],
    purpose: "general",
    ...overrides,
  },
  sections: [{ title: "role", content: "Test role" }],
});

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe("InteropReportSchema", () => {
  test("validates a well-formed report", () => {
    const result = InteropReportSchema.safeParse({
      agents_scanned: 2,
      findings: [],
      overlap_count: 0,
      gap_count: 0,
      warning_count: 0,
      scanned_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

// ─── scanAgentInterop Tests ──────────────────────────────────────────────────

describe("scanAgentInterop", () => {
  test("returns empty findings for a well-formed registry", () => {
    const agents = [
      makeAgent({
        name: "researcher",
        purpose: "researcher",
        tools: ["Read", "WebSearch"],
      }),
      makeAgent({
        name: "planner",
        purpose: "planner",
        tools: ["Read", "Write"],
      }),
      makeAgent({
        name: "executor",
        purpose: "executor",
        tools: ["Bash", "Edit"],
      }),
      makeAgent({
        name: "verifier",
        purpose: "verifier",
        tools: ["Bash", "Read"],
      }),
      makeAgent({
        name: "reviewer",
        purpose: "reviewer",
        tools: ["Read", "Grep"],
      }),
    ];

    const report = scanAgentInterop(agents);
    expect(report.agents_scanned).toBe(5);
    expect(report.gap_count).toBe(0);
    // may have some overlap but no high-severity ones
  });

  test("detects missing purpose categories", () => {
    const agents = [
      makeAgent({ name: "agent-1", purpose: "researcher" }),
      makeAgent({ name: "agent-2", purpose: "executor" }),
    ];

    const report = scanAgentInterop(agents);
    expect(report.gap_count).toBeGreaterThan(0);
    const gapFindings = report.findings.filter((f) => f.type === "gap");
    const missingPurposes = gapFindings.map((f) => f.description);
    expect(missingPurposes.some((d) => d.includes("planner"))).toBe(true);
    expect(missingPurposes.some((d) => d.includes("verifier"))).toBe(true);
    expect(missingPurposes.some((d) => d.includes("reviewer"))).toBe(true);
  });

  test("detects high tool overlap within same purpose", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        purpose: "executor",
        tools: ["Read", "Write", "Edit", "Bash", "Glob"],
      }),
      makeAgent({
        name: "agent-b",
        purpose: "executor",
        tools: ["Read", "Write", "Edit", "Bash", "Grep"],
      }),
    ];

    const report = scanAgentInterop(agents);
    expect(report.overlap_count).toBeGreaterThan(0);
    const overlaps = report.findings.filter((f) => f.type === "overlap");
    expect(overlaps.some((f) => f.severity === "high")).toBe(true);
  });

  test("does not flag overlap across different purposes", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        purpose: "researcher",
        tools: ["Read", "Glob", "Grep"],
      }),
      makeAgent({
        name: "agent-b",
        purpose: "verifier",
        tools: ["Read", "Glob", "Grep"],
      }),
      // fill expected purposes to avoid gap findings polluting overlap check
      makeAgent({ name: "p", purpose: "planner", tools: ["Write"] }),
      makeAgent({ name: "e", purpose: "executor", tools: ["Bash"] }),
      makeAgent({ name: "r", purpose: "reviewer", tools: ["Read"] }),
    ];

    const report = scanAgentInterop(agents);
    expect(report.overlap_count).toBe(0);
  });

  test("warns about agents with no tools", () => {
    const agents = [makeAgent({ name: "no-tools", tools: undefined })];

    const report = scanAgentInterop(agents);
    const warnings = report.findings.filter((f) => f.type === "warning");
    expect(warnings.some((w) => w.description.includes("no tools"))).toBe(true);
  });

  test("warns about agents with no sections", () => {
    const agent: AgentConfig = {
      frontmatter: {
        name: "empty-agent",
        description: "No sections",
        tools: ["Read"],
      },
      sections: [],
    };

    const report = scanAgentInterop([agent]);
    const warnings = report.findings.filter((f) => f.type === "warning");
    expect(warnings.some((w) => w.description.includes("no sections"))).toBe(
      true,
    );
  });

  test("handles empty agent list", () => {
    const report = scanAgentInterop([]);
    expect(report.agents_scanned).toBe(0);
    // Should still report missing purposes
    expect(report.gap_count).toBe(5);
  });

  test("schema validates the generated report", () => {
    const agents = [
      makeAgent({ name: "a", purpose: "researcher" }),
      makeAgent({ name: "b", purpose: "executor" }),
    ];

    const report = scanAgentInterop(agents);
    const result = InteropReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });
});
