/**
 * Audit findings persistence helpers for SpacetimeDB.
 *
 * Provides fire-and-forget persistence and query functions for review
 * agent findings. Follows the same patterns as observer-emitter.ts:
 * - callReducer for writes (fire-and-forget)
 * - queryTable for reads (with empty-array fallback)
 *
 * @module luca-state/audit-findings
 */
import orderBy from "lodash/orderBy";

import { callReducer } from "./observer-emitter";
import { queryTable } from "./spacetimedb-client";

import type {
  AuditFinding,
  PersistFindingParams,
  FindingFilters,
  FindingsSummary,
} from "../__schemas/audit-findings.schemas";
import {
  persistFindingParamsSchema,
  findingFiltersSchema,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
} from "../__schemas/audit-findings.schemas";

// ─── Validation ─────────────────────────────────────────────────────────────

/** Regex for safe string values — alphanumeric, hyphens, underscores, dots, slashes. */
const SAFE_STRING_RE = /^[a-zA-Z0-9_\-./: ]+$/;

/**
 * Validate a string filter value for safe SQL interpolation.
 *
 * @param value - The value to validate
 * @param fieldName - The field name for error messages
 * @returns The validated string
 * @throws If the value contains unsafe characters
 */
function validateFilterString(value: string, fieldName: string): string {
  if (value.length > 512 || !SAFE_STRING_RE.test(value)) {
    throw new Error(
      `Invalid ${fieldName} format: ${value.slice(0, 50)}${value.length > 50 ? "..." : ""}`,
    );
  }
  return value;
}

// ─── Internal Factories ─────────────────────────────────────────────────────

/**
 * Create a zeroed-out findings summary with all severity/status keys.
 */
function createEmptySummary(): FindingsSummary {
  return {
    total: 0,
    by_severity: Object.fromEntries(
      FINDING_SEVERITIES.map((s) => [s, 0]),
    ) as FindingsSummary["by_severity"],
    by_category: {},
    by_status: Object.fromEntries(
      FINDING_STATUSES.map((s) => [s, 0]),
    ) as FindingsSummary["by_status"],
  };
}

/**
 * Update the status of an audit finding.
 * Shared implementation for markFindingResolved and markFindingDismissed.
 */
function updateFindingStatus(
  findingId: number,
  status: string,
  resolutionNotes: string,
): void {
  if (!Number.isFinite(findingId) || findingId < 0) {
    console.error("[audit-findings] Invalid findingId:", findingId);
    return;
  }

  callReducer("update_finding_status", {
    findingId,
    status,
    resolutionNotes,
    resolvedAt: Date.now(),
  });
}

// ─── Write Helpers ──────────────────────────────────────────────────────────

/**
 * Persist a review agent finding to SpacetimeDB.
 *
 * Fire-and-forget: calls the append_audit_finding reducer.
 * Validates params with Zod before sending.
 *
 * @param params - The finding data to persist
 *
 * @example
 * ```typescript
 * persistFinding({
 *   session_id: "session-abc-123",
 *   phase: "Phase 120",
 *   source_agent: "code-simplifier",
 *   severity: "medium",
 *   category: "complexity",
 *   file_path: "src/state/bridge.ts",
 *   line_start: 42,
 *   line_end: 58,
 *   finding: "Function exceeds 50 lines",
 *   suggested_fix: "Extract helper function",
 *   context_snippet: "function longFunction() { ... }",
 *   created_at: Date.now(),
 * });
 * ```
 */
export function persistFinding(params: PersistFindingParams): void {
  const parseResult = persistFindingParamsSchema.safeParse(params);
  if (!parseResult.success) {
    console.error(
      "[audit-findings] Invalid finding params:",
      parseResult.error.message,
    );
    return;
  }

  const data = parseResult.data;

  callReducer("append_audit_finding", {
    sessionId: data.session_id,
    phase: data.phase,
    sourceAgent: data.source_agent,
    severity: data.severity,
    category: data.category,
    filePath: data.file_path,
    lineStart: data.line_start,
    lineEnd: data.line_end,
    finding: data.finding,
    suggestedFix: data.suggested_fix,
    contextSnippet: data.context_snippet,
    createdAt: data.created_at || Date.now(),
  });
}

/**
 * Mark an audit finding as resolved.
 *
 * Fire-and-forget: calls the update_finding_status reducer.
 *
 * @param findingId - The finding ID to update
 * @param resolutionNotes - Optional notes about the resolution
 *
 * @example
 * ```typescript
 * markFindingResolved(42, "Fixed in commit abc123");
 * ```
 */
export function markFindingResolved(
  findingId: number,
  resolutionNotes?: string,
): void {
  updateFindingStatus(findingId, "resolved", resolutionNotes ?? "");
}

/**
 * Mark an audit finding as dismissed.
 *
 * Fire-and-forget: calls the update_finding_status reducer.
 *
 * @param findingId - The finding ID to dismiss
 * @param reason - Reason for dismissal
 *
 * @example
 * ```typescript
 * markFindingDismissed(42, "False positive - intentional pattern");
 * ```
 */
export function markFindingDismissed(findingId: number, reason: string): void {
  updateFindingStatus(findingId, "dismissed", reason);
}

// ─── Query Helpers ──────────────────────────────────────────────────────────

/**
 * Query pending audit findings for a session.
 *
 * Queries SpacetimeDB for findings with status='pending' or 'in_progress'.
 * Falls back to empty array if SpacetimeDB is unavailable.
 *
 * @param sessionId - The session ID to query
 * @param filters - Optional additional filters
 * @returns Array of matching audit findings
 *
 * @example
 * ```typescript
 * const pending = await queryPendingFindings("session-abc-123");
 * const criticalOnly = await queryPendingFindings("session-abc-123", {
 *   severity: "critical",
 * });
 * ```
 */
export async function queryPendingFindings(
  sessionId: string,
  filters?: FindingFilters,
): Promise<AuditFinding[]> {
  try {
    const validatedSessionId = validateFilterString(sessionId, "session_id");
    const escapedSessionId = validatedSessionId.replace(/'/g, "''");

    const whereClauses: string[] = [
      `sessionId = '${escapedSessionId}'`,
      `(status = 'pending' OR status = 'in_progress')`,
    ];

    if (filters) {
      const validatedFilters = findingFiltersSchema.safeParse(filters);
      if (validatedFilters.success) {
        const f = validatedFilters.data;
        if (f.severity) {
          const safeSeverity = validateFilterString(f.severity, "severity");
          whereClauses.push(`severity = '${safeSeverity.replace(/'/g, "''")}'`);
        }
        if (f.category) {
          const safeCategory = validateFilterString(f.category, "category");
          whereClauses.push(`category = '${safeCategory.replace(/'/g, "''")}'`);
        }
        if (f.source_agent) {
          const safeAgent = validateFilterString(
            f.source_agent,
            "source_agent",
          );
          whereClauses.push(`sourceAgent = '${safeAgent.replace(/'/g, "''")}'`);
        }
      }
    }

    const sql = `SELECT * FROM audit_findings WHERE ${whereClauses.join(" AND ")}`;
    return await queryTable<AuditFinding>(sql);
  } catch {
    // SpacetimeDB unavailable — return empty array
    return [];
  }
}

/**
 * Query audit findings for a specific file.
 *
 * Returns findings ordered by severity (critical first).
 * Falls back to empty array if SpacetimeDB is unavailable.
 *
 * @param filePath - The file path to query
 * @param sessionId - Optional session ID filter
 * @returns Array of matching audit findings, ordered by severity
 *
 * @example
 * ```typescript
 * const findings = await queryFindingsForFile("src/state/bridge.ts");
 * ```
 */
export async function queryFindingsForFile(
  filePath: string,
  sessionId?: string,
): Promise<AuditFinding[]> {
  try {
    const safeFilePath = validateFilterString(filePath, "file_path");
    const escapedFilePath = safeFilePath.replace(/'/g, "''");

    const whereClauses: string[] = [`filePath = '${escapedFilePath}'`];

    if (sessionId) {
      const safeSessionId = validateFilterString(sessionId, "session_id");
      whereClauses.push(`sessionId = '${safeSessionId.replace(/'/g, "''")}'`);
    }

    const sql = `SELECT * FROM audit_findings WHERE ${whereClauses.join(" AND ")}`;
    const rows = await queryTable<AuditFinding>(sql);

    // Sort client-side by severity (ORDER BY not supported in SpacetimeDB v2 SQL)
    const severityOrder: Record<string, number> = Object.fromEntries(
      FINDING_SEVERITIES.map((s, i) => [s, i]),
    );

    return orderBy(rows, [(r) => severityOrder[r.severity] ?? 5], ["asc"]);
  } catch {
    // SpacetimeDB unavailable — return empty array
    return [];
  }
}

/**
 * Get an aggregated summary of audit findings for a session.
 *
 * Computes counts by severity, category, and status.
 * Falls back to zeroed summary if SpacetimeDB is unavailable.
 *
 * @param sessionId - The session ID to summarize
 * @returns Aggregated findings summary
 *
 * @example
 * ```typescript
 * const summary = await getFindingsSummary("session-abc-123");
 * console.log(`Total: ${summary.total}, Critical: ${summary.by_severity.critical}`);
 * ```
 */
export async function getFindingsSummary(
  sessionId: string,
): Promise<FindingsSummary> {
  const emptySummary = createEmptySummary();

  try {
    const safeSessionId = validateFilterString(sessionId, "session_id");
    const escapedSessionId = safeSessionId.replace(/'/g, "''");

    const sql = `SELECT * FROM audit_findings WHERE sessionId = '${escapedSessionId}'`;
    const rows = await queryTable<AuditFinding>(sql);

    if (rows.length === 0) return emptySummary;

    const summary = createEmptySummary();
    summary.total = rows.length;

    for (const row of rows) {
      const severity = row.severity as keyof FindingsSummary["by_severity"];
      if (severity in summary.by_severity) {
        summary.by_severity[severity]++;
      }

      const status = row.status as keyof FindingsSummary["by_status"];
      if (status in summary.by_status) {
        summary.by_status[status]++;
      }

      const category = String(row.category || "uncategorized");
      summary.by_category[category] = (summary.by_category[category] ?? 0) + 1;
    }

    return summary;
  } catch {
    // SpacetimeDB unavailable — return empty summary
    return emptySummary;
  }
}
