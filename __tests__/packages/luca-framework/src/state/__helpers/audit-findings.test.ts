/**
 * Tests for audit-findings.ts -- review agent findings persistence.
 *
 * Validates persistFinding, query helpers, summary aggregation,
 * schema validation, and graceful degradation when SpacetimeDB is unavailable.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import {
  persistFinding,
  markFindingResolved,
  markFindingDismissed,
  queryPendingFindings,
  queryFindingsForFile,
  getFindingsSummary,
} from "../../../../../../packages/luca-framework/src/state/__helpers/audit-findings";

import {
  auditFindingSchema,
  persistFindingParamsSchema,
  findingFiltersSchema,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
} from "../../../../../../packages/luca-framework/src/state/__schemas/audit-findings.schemas";

// --- Test State ----------------------------------------------------------------

interface CapturedCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: CapturedCall[] = [];
const originalFetch = globalThis.fetch;
let envBackup: Record<string, string | undefined> = {};

// --- Setup / Teardown ----------------------------------------------------------

beforeEach(() => {
  fetchCalls = [];
  envBackup = {
    LUCA_SPACETIMEDB_URL: process.env.LUCA_SPACETIMEDB_URL,
    LUCA_OBSERVER_URL: process.env.LUCA_OBSERVER_URL,
  };

  // Default mock: capture calls and resolve successfully
  globalThis.fetch = ((url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    return Promise.resolve(new Response("ok"));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// --- Schema Validation Tests ---------------------------------------------------

describe("auditFindingSchema", () => {
  test("accepts a valid audit finding", () => {
    const result = auditFindingSchema.safeParse({
      session_id: "session-abc-123",
      phase: "Phase 120",
      source_agent: "code-simplifier",
      severity: "medium",
      category: "complexity",
      file_path: "src/state/bridge.ts",
      line_start: 42,
      line_end: 58,
      finding: "Function exceeds 50 lines",
      suggested_fix: "Extract helper function",
      context_snippet: "function longFunction() { ... }",
      status: "pending",
      resolution_notes: "",
      created_at: 1700000000000,
      resolved_at: 0,
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid severity", () => {
    const result = auditFindingSchema.safeParse({
      session_id: "abc",
      source_agent: "test",
      severity: "super-critical",
      category: "test",
      finding: "test finding",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid status", () => {
    const result = auditFindingSchema.safeParse({
      session_id: "abc",
      source_agent: "test",
      severity: "high",
      category: "test",
      finding: "test finding",
      status: "invalid-status",
    });
    expect(result.success).toBe(false);
  });

  test("applies defaults for optional fields", () => {
    const result = auditFindingSchema.safeParse({
      session_id: "abc",
      source_agent: "test",
      severity: "low",
      category: "test",
      finding: "test finding",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("pending");
      expect(result.data.phase).toBe("");
      expect(result.data.file_path).toBe("");
      expect(result.data.line_start).toBe(0);
      expect(result.data.line_end).toBe(0);
      expect(result.data.suggested_fix).toBe("");
      expect(result.data.context_snippet).toBe("");
      expect(result.data.resolution_notes).toBe("");
      expect(result.data.created_at).toBe(0);
      expect(result.data.resolved_at).toBe(0);
    }
  });

  test("rejects empty session_id", () => {
    const result = auditFindingSchema.safeParse({
      session_id: "",
      source_agent: "test",
      severity: "low",
      category: "test",
      finding: "test finding",
    });
    expect(result.success).toBe(false);
  });
});

describe("persistFindingParamsSchema", () => {
  test("omits id, status, resolution_notes, resolved_at", () => {
    const result = persistFindingParamsSchema.safeParse({
      session_id: "abc",
      source_agent: "test",
      severity: "high",
      category: "bugs",
      finding: "found a bug",
    });
    expect(result.success).toBe(true);
  });
});

describe("findingFiltersSchema", () => {
  test("accepts empty object", () => {
    const result = findingFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("accepts valid severity filter", () => {
    const result = findingFiltersSchema.safeParse({ severity: "critical" });
    expect(result.success).toBe(true);
  });

  test("rejects invalid severity filter", () => {
    const result = findingFiltersSchema.safeParse({ severity: "urgent" });
    expect(result.success).toBe(false);
  });
});

describe("FINDING_SEVERITIES / FINDING_STATUSES", () => {
  test("contains expected severity levels", () => {
    expect(FINDING_SEVERITIES).toContain("critical");
    expect(FINDING_SEVERITIES).toContain("high");
    expect(FINDING_SEVERITIES).toContain("medium");
    expect(FINDING_SEVERITIES).toContain("low");
    expect(FINDING_SEVERITIES).toContain("info");
    expect(FINDING_SEVERITIES).toHaveLength(5);
  });

  test("contains expected status values", () => {
    expect(FINDING_STATUSES).toContain("pending");
    expect(FINDING_STATUSES).toContain("in_progress");
    expect(FINDING_STATUSES).toContain("resolved");
    expect(FINDING_STATUSES).toContain("dismissed");
    expect(FINDING_STATUSES).toContain("wont_fix");
    expect(FINDING_STATUSES).toHaveLength(5);
  });
});

// --- persistFinding Tests ------------------------------------------------------

describe("persistFinding", () => {
  test("calls callReducer with correct reducer name and args", () => {
    delete process.env.LUCA_SPACETIMEDB_URL;

    persistFinding({
      session_id: "session-abc",
      phase: "Phase 120",
      source_agent: "code-simplifier",
      severity: "medium",
      category: "complexity",
      file_path: "src/state/bridge.ts",
      line_start: 42,
      line_end: 58,
      finding: "Function exceeds 50 lines",
      suggested_fix: "Extract helper",
      context_snippet: "function long() {}",
      created_at: 1700000000000,
    });

    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0]!;
    expect(call.url).toContain("/call/append_audit_finding");

    const body = JSON.parse(call.init?.body as string);
    expect(body.sessionId).toBe("session-abc");
    expect(body.phase).toBe("Phase 120");
    expect(body.sourceAgent).toBe("code-simplifier");
    expect(body.severity).toBe("medium");
    expect(body.category).toBe("complexity");
    expect(body.filePath).toBe("src/state/bridge.ts");
    expect(body.lineStart).toBe(42);
    expect(body.lineEnd).toBe(58);
    expect(body.finding).toBe("Function exceeds 50 lines");
    expect(body.suggestedFix).toBe("Extract helper");
    expect(body.contextSnippet).toBe("function long() {}");
    expect(body.createdAt).toBe(1700000000000);
  });

  test("does not call reducer when params are invalid", () => {
    persistFinding({
      session_id: "",
      source_agent: "",
      severity: "invalid" as any,
      category: "",
      finding: "",
    } as any);

    expect(fetchCalls).toHaveLength(0);
  });
});

// --- markFindingResolved Tests -------------------------------------------------

describe("markFindingResolved", () => {
  test("calls update_finding_status reducer with resolved status", () => {
    delete process.env.LUCA_SPACETIMEDB_URL;

    markFindingResolved(42, "Fixed in commit abc123");

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0]!.init?.body as string);
    expect(body.findingId).toBe(42);
    expect(body.status).toBe("resolved");
    expect(body.resolutionNotes).toBe("Fixed in commit abc123");
    expect(typeof body.resolvedAt).toBe("number");
  });

  test("does not call reducer with negative findingId", () => {
    markFindingResolved(-1);
    expect(fetchCalls).toHaveLength(0);
  });
});

// --- markFindingDismissed Tests ------------------------------------------------

describe("markFindingDismissed", () => {
  test("calls update_finding_status reducer with dismissed status", () => {
    delete process.env.LUCA_SPACETIMEDB_URL;

    markFindingDismissed(7, "False positive");

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0]!.init?.body as string);
    expect(body.findingId).toBe(7);
    expect(body.status).toBe("dismissed");
    expect(body.resolutionNotes).toBe("False positive");
  });
});

// --- queryPendingFindings Tests ------------------------------------------------

describe("queryPendingFindings", () => {
  test("returns empty array when SpacetimeDB is unavailable", async () => {
    globalThis.fetch = ((_url: any, _init?: any) =>
      Promise.reject(
        new Error("Connection refused"),
      )) as unknown as typeof fetch;

    const result = await queryPendingFindings("session-abc");
    expect(result).toEqual([]);
  });

  test("returns empty array when fetch throws", async () => {
    globalThis.fetch = ((_url: any, _init?: any) => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;

    const result = await queryPendingFindings("session-abc");
    expect(result).toEqual([]);
  });
});

// --- queryFindingsForFile Tests ------------------------------------------------

describe("queryFindingsForFile", () => {
  test("returns empty array when SpacetimeDB is unavailable", async () => {
    globalThis.fetch = ((_url: any, _init?: any) =>
      Promise.reject(
        new Error("Connection refused"),
      )) as unknown as typeof fetch;

    const result = await queryFindingsForFile("src/state/bridge.ts");
    expect(result).toEqual([]);
  });
});

// --- getFindingsSummary Tests --------------------------------------------------

describe("getFindingsSummary", () => {
  test("returns zeroed summary when SpacetimeDB is unavailable", async () => {
    globalThis.fetch = ((_url: any, _init?: any) =>
      Promise.reject(new Error("Connection refused"))) as typeof fetch;

    const summary = await getFindingsSummary("session-abc");
    expect(summary.total).toBe(0);
    expect(summary.by_severity.critical).toBe(0);
    expect(summary.by_severity.high).toBe(0);
    expect(summary.by_severity.medium).toBe(0);
    expect(summary.by_severity.low).toBe(0);
    expect(summary.by_severity.info).toBe(0);
    expect(summary.by_status.pending).toBe(0);
    expect(summary.by_status.resolved).toBe(0);
    expect(summary.by_status.dismissed).toBe(0);
    expect(Object.keys(summary.by_category)).toHaveLength(0);
  });

  test("correctly aggregates findings from SpacetimeDB response", async () => {
    // Mock SpacetimeDB SQL API response
    const mockRows = [
      {
        id: 1,
        sessionId: "session-abc",
        severity: "critical",
        category: "security",
        status: "pending",
      },
      {
        id: 2,
        sessionId: "session-abc",
        severity: "critical",
        category: "security",
        status: "resolved",
      },
      {
        id: 3,
        sessionId: "session-abc",
        severity: "medium",
        category: "complexity",
        status: "pending",
      },
      {
        id: 4,
        sessionId: "session-abc",
        severity: "low",
        category: "complexity",
        status: "dismissed",
      },
    ];

    // SpacetimeDB v2 SQL returns [{ schema: { elements: [...] }, rows: [...] }]
    const fields = Object.keys(mockRows[0]!);
    const positionalRows = mockRows.map((row) =>
      fields.map((f) => (row as Record<string, unknown>)[f]),
    );

    globalThis.fetch = ((url: any, init?: any) => {
      fetchCalls.push({ url: String(url), init });
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              schema: {
                elements: fields.map((name) => ({ name: { some: name } })),
              },
              rows: positionalRows,
            },
          ]),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    }) as typeof fetch;

    const summary = await getFindingsSummary("session-abc");

    expect(summary.total).toBe(4);
    expect(summary.by_severity.critical).toBe(2);
    expect(summary.by_severity.medium).toBe(1);
    expect(summary.by_severity.low).toBe(1);
    expect(summary.by_severity.high).toBe(0);
    expect(summary.by_severity.info).toBe(0);
    expect(summary.by_status.pending).toBe(2);
    expect(summary.by_status.resolved).toBe(1);
    expect(summary.by_status.dismissed).toBe(1);
    expect(summary.by_category.security).toBe(2);
    expect(summary.by_category.complexity).toBe(2);
  });
});
