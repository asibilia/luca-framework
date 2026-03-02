import { describe, test, expect } from "bun:test";
import { aggregateResults } from "../../../src/context/__helpers/result-aggregator";
import type { ResultEnvelope } from "../../../src/context/__helpers/result-envelope";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnvelope(
  overrides: Partial<ResultEnvelope> & { agent?: string } = {},
): ResultEnvelope {
  const { agent, metadata: metaOverrides, ...rest } = overrides;
  return {
    status: "success",
    summary: "Test summary",
    artifacts: [],
    issues: [],
    ...rest,
    metadata: {
      agent_name: agent ?? "test-agent",
      context_tier: "T0" as const,
      ...(metaOverrides ?? {}),
    },
  };
}

// ---------------------------------------------------------------------------
// aggregateResults — status determination
// ---------------------------------------------------------------------------

describe("aggregateResults — status determination", () => {
  test("all success yields overall success", () => {
    const results = [
      makeEnvelope({ agent: "a" }),
      makeEnvelope({ agent: "b" }),
    ];
    const agg = aggregateResults(results);
    expect(agg.overall_status).toBe("success");
  });

  test("one failed yields overall failed (worst wins)", () => {
    const results = [
      makeEnvelope({ agent: "a", status: "success" }),
      makeEnvelope({ agent: "b", status: "failed" }),
      makeEnvelope({ agent: "c", status: "success" }),
    ];
    const agg = aggregateResults(results);
    expect(agg.overall_status).toBe("failed");
  });

  test("partial without failed yields overall partial", () => {
    const results = [
      makeEnvelope({ agent: "a", status: "success" }),
      makeEnvelope({ agent: "b", status: "partial" }),
    ];
    const agg = aggregateResults(results);
    expect(agg.overall_status).toBe("partial");
  });

  test("timeout without failed yields overall partial", () => {
    const results = [
      makeEnvelope({ agent: "a", status: "success" }),
      makeEnvelope({ agent: "b", status: "timeout" }),
    ];
    const agg = aggregateResults(results);
    expect(agg.overall_status).toBe("partial");
  });

  test("failed takes precedence over partial", () => {
    const results = [
      makeEnvelope({ agent: "a", status: "partial" }),
      makeEnvelope({ agent: "b", status: "failed" }),
    ];
    const agg = aggregateResults(results);
    expect(agg.overall_status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// aggregateResults — summary concatenation
// ---------------------------------------------------------------------------

describe("aggregateResults — summary concatenation", () => {
  test("concatenates summaries with agent headers", () => {
    const results = [
      makeEnvelope({ agent: "agent-one", summary: "Did task A" }),
      makeEnvelope({ agent: "agent-two", summary: "Did task B" }),
    ];
    const agg = aggregateResults(results);
    expect(agg.summary).toContain("### agent-one");
    expect(agg.summary).toContain("Did task A");
    expect(agg.summary).toContain("### agent-two");
    expect(agg.summary).toContain("Did task B");
  });
});

// ---------------------------------------------------------------------------
// aggregateResults — artifact merging
// ---------------------------------------------------------------------------

describe("aggregateResults — artifact merging", () => {
  test("merges artifacts with source_agent attribution", () => {
    const results = [
      makeEnvelope({
        agent: "executor",
        artifacts: [{ path: "a.ts", action: "created" }],
      }),
      makeEnvelope({
        agent: "debugger",
        artifacts: [{ path: "b.ts", action: "modified" }],
      }),
    ];
    const agg = aggregateResults(results);
    expect(agg.artifacts).toHaveLength(2);
    expect(agg.artifacts[0]!.source_agent).toBe("executor");
    expect(agg.artifacts[0]!.path).toBe("a.ts");
    expect(agg.artifacts[1]!.source_agent).toBe("debugger");
    expect(agg.artifacts[1]!.path).toBe("b.ts");
  });
});

// ---------------------------------------------------------------------------
// aggregateResults — issue deduplication
// ---------------------------------------------------------------------------

describe("aggregateResults — issue deduplication", () => {
  test("deduplicates issues by file:line:message", () => {
    const dupIssue = {
      severity: "high" as const,
      message: "Missing null check",
      file: "src/a.ts",
      line: 10,
      source_agent: "agent-1",
    };
    const results = [
      makeEnvelope({ agent: "agent-1", issues: [dupIssue] }),
      makeEnvelope({
        agent: "agent-2",
        issues: [{ ...dupIssue, source_agent: "agent-2" }],
      }),
    ];
    const agg = aggregateResults(results);
    // Same file:line:message should be deduplicated
    expect(agg.issues).toHaveLength(1);
  });

  test("keeps issues with different messages", () => {
    const results = [
      makeEnvelope({
        agent: "a",
        issues: [
          { severity: "high" as const, message: "Issue A", source_agent: "a" },
        ],
      }),
      makeEnvelope({
        agent: "b",
        issues: [
          { severity: "high" as const, message: "Issue B", source_agent: "b" },
        ],
      }),
    ];
    const agg = aggregateResults(results);
    expect(agg.issues).toHaveLength(2);
  });

  test("keeps issues with same message but different files", () => {
    const results = [
      makeEnvelope({
        agent: "a",
        issues: [
          {
            severity: "medium" as const,
            message: "Same msg",
            file: "a.ts",
            source_agent: "a",
          },
        ],
      }),
      makeEnvelope({
        agent: "b",
        issues: [
          {
            severity: "medium" as const,
            message: "Same msg",
            file: "b.ts",
            source_agent: "b",
          },
        ],
      }),
    ];
    const agg = aggregateResults(results);
    expect(agg.issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// aggregateResults — issue counts
// ---------------------------------------------------------------------------

describe("aggregateResults — issue counts", () => {
  test("tallies issue counts by severity", () => {
    const results = [
      makeEnvelope({
        agent: "a",
        issues: [
          { severity: "critical" as const, message: "c1", source_agent: "a" },
          { severity: "high" as const, message: "h1", source_agent: "a" },
          { severity: "medium" as const, message: "m1", source_agent: "a" },
        ],
      }),
      makeEnvelope({
        agent: "b",
        issues: [
          { severity: "low" as const, message: "l1", source_agent: "b" },
          { severity: "info" as const, message: "i1", source_agent: "b" },
          { severity: "info" as const, message: "i2", source_agent: "b" },
        ],
      }),
    ];
    const agg = aggregateResults(results);
    expect(agg.issue_counts.critical).toBe(1);
    expect(agg.issue_counts.high).toBe(1);
    expect(agg.issue_counts.medium).toBe(1);
    expect(agg.issue_counts.low).toBe(1);
    expect(agg.issue_counts.info).toBe(2);
  });

  test("all counts are zero when there are no issues", () => {
    const agg = aggregateResults([makeEnvelope()]);
    expect(agg.issue_counts).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// aggregateResults — duration summing
// ---------------------------------------------------------------------------

describe("aggregateResults — duration summing", () => {
  test("sums durations across agents", () => {
    const results = [
      makeEnvelope({
        agent: "a",
        metadata: { agent_name: "a", context_tier: "T0", duration_ms: 1000 },
      }),
      makeEnvelope({
        agent: "b",
        metadata: { agent_name: "b", context_tier: "T1", duration_ms: 2500 },
      }),
    ];
    const agg = aggregateResults(results);
    expect(agg.total_duration_ms).toBe(3500);
  });

  test("treats missing duration as 0", () => {
    const results = [
      makeEnvelope({
        agent: "a",
        metadata: { agent_name: "a", context_tier: "T0", duration_ms: 1000 },
      }),
      makeEnvelope({
        agent: "b",
        metadata: { agent_name: "b", context_tier: "T0" },
      }),
    ];
    const agg = aggregateResults(results);
    expect(agg.total_duration_ms).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// aggregateResults — agent statuses
// ---------------------------------------------------------------------------

describe("aggregateResults — agent statuses", () => {
  test("tracks per-agent statuses", () => {
    const results = [
      makeEnvelope({ agent: "a", status: "success" }),
      makeEnvelope({ agent: "b", status: "failed" }),
    ];
    const agg = aggregateResults(results);
    expect(agg.agent_statuses).toHaveLength(2);
    expect(agg.agent_statuses[0]!.agent_name).toBe("a");
    expect(agg.agent_statuses[0]!.status).toBe("success");
    expect(agg.agent_statuses[1]!.agent_name).toBe("b");
    expect(agg.agent_statuses[1]!.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// aggregateResults — edge cases
// ---------------------------------------------------------------------------

describe("aggregateResults — edge cases", () => {
  test("empty array returns success with empty collections", () => {
    const agg = aggregateResults([]);
    expect(agg.overall_status).toBe("success");
    expect(agg.summary).toBe("");
    expect(agg.artifacts).toEqual([]);
    expect(agg.issues).toEqual([]);
    expect(agg.agent_statuses).toEqual([]);
    expect(agg.total_duration_ms).toBe(0);
  });

  test("single successful result", () => {
    const results = [
      makeEnvelope({
        agent: "solo",
        summary: "All done",
        metadata: { agent_name: "solo", context_tier: "T2", duration_ms: 500 },
      }),
    ];
    const agg = aggregateResults(results);
    expect(agg.overall_status).toBe("success");
    expect(agg.agent_statuses).toHaveLength(1);
    expect(agg.total_duration_ms).toBe(500);
  });
});
