import { describe, test, expect } from "bun:test";
import {
  RESULT_STATUSES,
  resultStatusSchema,
  ISSUE_SEVERITIES,
  issueSeveritySchema,
  resultArtifactSchema,
  resultIssueSchema,
  resultMetadataSchema,
  resultEnvelopeSchema,
  parseResultEnvelope,
} from "../../../src/context/__helpers/result-envelope";

// ---------------------------------------------------------------------------
// resultStatusSchema
// ---------------------------------------------------------------------------

describe("resultStatusSchema", () => {
  test("has exactly 4 statuses", () => {
    expect(RESULT_STATUSES).toHaveLength(4);
  });

  test("statuses are success, partial, failed, timeout", () => {
    expect(RESULT_STATUSES).toEqual([
      "success",
      "partial",
      "failed",
      "timeout",
    ]);
  });

  test("accepts all valid statuses", () => {
    for (const s of RESULT_STATUSES) {
      expect(resultStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  test("rejects invalid status", () => {
    expect(resultStatusSchema.safeParse("error").success).toBe(false);
    expect(resultStatusSchema.safeParse("SUCCESS").success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// issueSeveritySchema
// ---------------------------------------------------------------------------

describe("issueSeveritySchema", () => {
  test("has exactly 5 severities", () => {
    expect(ISSUE_SEVERITIES).toHaveLength(5);
  });

  test("severities are critical, high, medium, low, info", () => {
    expect(ISSUE_SEVERITIES).toEqual([
      "critical",
      "high",
      "medium",
      "low",
      "info",
    ]);
  });

  test("accepts all valid severities", () => {
    for (const s of ISSUE_SEVERITIES) {
      expect(issueSeveritySchema.safeParse(s).success).toBe(true);
    }
  });

  test("rejects invalid severity", () => {
    expect(issueSeveritySchema.safeParse("CRITICAL").success).toBe(false);
    expect(issueSeveritySchema.safeParse("warning").success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resultArtifactSchema
// ---------------------------------------------------------------------------

describe("resultArtifactSchema", () => {
  test("parses a valid artifact with all fields", () => {
    const result = resultArtifactSchema.safeParse({
      path: "src/index.ts",
      action: "modified",
      description: "Updated imports",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.path).toBe("src/index.ts");
      expect(result.data.action).toBe("modified");
      expect(result.data.description).toBe("Updated imports");
    }
  });

  test("parses a valid artifact without description", () => {
    const result = resultArtifactSchema.safeParse({
      path: "new-file.ts",
      action: "created",
    });
    expect(result.success).toBe(true);
  });

  test("accepts all valid actions", () => {
    for (const action of ["created", "modified", "deleted"]) {
      const result = resultArtifactSchema.safeParse({ path: "f.ts", action });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid action", () => {
    const result = resultArtifactSchema.safeParse({
      path: "f.ts",
      action: "renamed",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resultIssueSchema
// ---------------------------------------------------------------------------

describe("resultIssueSchema", () => {
  test("parses a valid issue with all fields", () => {
    const result = resultIssueSchema.safeParse({
      severity: "high",
      message: "Missing null check",
      file: "src/utils.ts",
      line: 42,
      source_agent: "lu-verifier",
      source_plan: "PLAN-001",
      suggestion: "Add null guard before access",
    });
    expect(result.success).toBe(true);
  });

  test("parses a minimal issue (required fields only)", () => {
    const result = resultIssueSchema.safeParse({
      severity: "info",
      message: "Consider using const",
      source_agent: "dx-advocate",
    });
    expect(result.success).toBe(true);
  });

  test("rejects issue without required source_agent", () => {
    const result = resultIssueSchema.safeParse({
      severity: "medium",
      message: "Some issue",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resultMetadataSchema
// ---------------------------------------------------------------------------

describe("resultMetadataSchema", () => {
  test("parses metadata with all fields", () => {
    const result = resultMetadataSchema.safeParse({
      agent_name: "lu-executor",
      duration_ms: 1500,
      context_tier: "T2",
      isolation_mode: "none",
    });
    expect(result.success).toBe(true);
  });

  test("parses metadata with required fields only", () => {
    const result = resultMetadataSchema.safeParse({
      agent_name: "lu-verifier",
      context_tier: "T1",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing agent_name", () => {
    const result = resultMetadataSchema.safeParse({
      context_tier: "T0",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseResultEnvelope — valid JSON
// ---------------------------------------------------------------------------

describe("parseResultEnvelope — valid JSON", () => {
  test("parses a valid JSON envelope", () => {
    const raw = JSON.stringify({
      status: "success",
      summary: "All tasks completed",
      artifacts: [{ path: "src/a.ts", action: "modified" }],
      issues: [],
      metadata: { agent_name: "lu-executor", context_tier: "T2" },
    });
    const envelope = parseResultEnvelope(raw, "lu-executor", "T2");
    expect(envelope.status).toBe("success");
    expect(envelope.summary).toBe("All tasks completed");
    expect(envelope.artifacts).toHaveLength(1);
    expect(envelope.metadata.agent_name).toBe("lu-executor");
  });

  test("parses envelope with issues", () => {
    const raw = JSON.stringify({
      status: "partial",
      summary: "Found issues",
      artifacts: [],
      issues: [
        {
          severity: "medium",
          message: "Type mismatch",
          source_agent: "lu-verifier",
        },
      ],
      metadata: { agent_name: "lu-verifier", context_tier: "T1" },
    });
    const envelope = parseResultEnvelope(raw, "lu-verifier");
    expect(envelope.status).toBe("partial");
    expect(envelope.issues).toHaveLength(1);
    expect(envelope.issues[0]!.severity).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// parseResultEnvelope — fallback
// ---------------------------------------------------------------------------

describe("parseResultEnvelope — fallback", () => {
  test("returns partial envelope for non-JSON text", () => {
    const raw = "This is plain text output from the agent";
    const envelope = parseResultEnvelope(raw, "lu-executor", "T1");
    expect(envelope.status).toBe("partial");
    expect(envelope.summary).toBe(raw);
    expect(envelope.artifacts).toEqual([]);
    expect(envelope.issues).toEqual([]);
    expect(envelope.metadata.agent_name).toBe("lu-executor");
    expect(envelope.metadata.context_tier).toBe("T1");
  });

  test("returns partial for invalid JSON structure", () => {
    const raw = JSON.stringify({ not_a_valid: "envelope" });
    const envelope = parseResultEnvelope(raw, "test-agent");
    expect(envelope.status).toBe("partial");
  });

  test("truncates long text to 2000 characters in fallback", () => {
    const raw = "x".repeat(5000);
    const envelope = parseResultEnvelope(raw, "test-agent");
    expect(envelope.summary).toHaveLength(2000);
  });

  test("handles empty string input", () => {
    const envelope = parseResultEnvelope("", "test-agent");
    expect(envelope.status).toBe("partial");
    expect(envelope.summary).toBe("");
  });

  test("uses default context tier T0 when not specified", () => {
    const envelope = parseResultEnvelope("raw text", "test-agent");
    expect(envelope.metadata.context_tier).toBe("T0");
  });
});

// ---------------------------------------------------------------------------
// resultEnvelopeSchema
// ---------------------------------------------------------------------------

describe("resultEnvelopeSchema", () => {
  test("applies default empty arrays for artifacts and issues", () => {
    const result = resultEnvelopeSchema.safeParse({
      status: "success",
      summary: "Done",
      metadata: { agent_name: "test", context_tier: "T0" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.artifacts).toEqual([]);
      expect(result.data.issues).toEqual([]);
    }
  });
});
