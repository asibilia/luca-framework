/**
 * Audit findings persistence helpers.
 *
 * Stubbed as no-ops pending future MuninnDB integration.
 * Write functions log to stderr for debugging. Read functions
 * return empty results.
 *
 * @module luca-state/audit-findings
 */

import type {
  AuditFinding,
  PersistFindingParams,
  FindingFilters,
  FindingsSummary,
} from "../__schemas/audit-findings.schemas";
import {
  persistFindingParamsSchema,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
} from "../__schemas/audit-findings.schemas";

// ─── Internal Factories ─────────────────────────────────────────────────────

/**
 * Create a zeroed record from a readonly string tuple (e.g. FINDING_SEVERITIES).
 */
function createEnumMap<T extends string>(
  keys: readonly T[],
): Record<T, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
}

/**
 * Create a zeroed-out findings summary with all severity/status keys.
 */
function createEmptySummary(): FindingsSummary {
  return {
    total: 0,
    by_severity: createEnumMap(
      FINDING_SEVERITIES,
    ) as FindingsSummary["by_severity"],
    by_category: {},
    by_status: createEnumMap(FINDING_STATUSES) as FindingsSummary["by_status"],
  };
}

// ─── Write Helpers ──────────────────────────────────────────────────────────

/**
 * Persist a review agent finding.
 *
 * Currently a no-op (logs to stderr in debug mode). Will be replaced
 * by MuninnDB emission in a future phase.
 *
 * @param params - The finding data to persist
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

  if (process.env.LUCA_DEBUG) {
    console.error(
      "[audit-findings] Finding recorded (no persistence backend):",
      parseResult.data.finding,
    );
  }
}

/**
 * Mark an audit finding as resolved.
 *
 * Currently a no-op until MuninnDB emission layer is implemented.
 *
 * @param findingId - The finding ID to update
 * @param resolutionNotes - Optional notes about the resolution
 */
export function markFindingResolved(
  findingId: number,
  resolutionNotes?: string,
): void {
  if (process.env.LUCA_DEBUG) {
    console.error(
      `[audit-findings] Finding ${findingId} marked resolved: ${resolutionNotes ?? ""}`,
    );
  }
}

/**
 * Mark an audit finding as dismissed.
 *
 * Currently a no-op until MuninnDB emission layer is implemented.
 *
 * @param findingId - The finding ID to dismiss
 * @param reason - Reason for dismissal
 */
export function markFindingDismissed(findingId: number, reason: string): void {
  if (process.env.LUCA_DEBUG) {
    console.error(`[audit-findings] Finding ${findingId} dismissed: ${reason}`);
  }
}

// ─── Query Helpers ──────────────────────────────────────────────────────────

/**
 * Query pending audit findings for a session.
 *
 * Returns empty array (no persistence backend available).
 *
 * @param sessionId - The session ID to query
 * @param filters - Optional additional filters
 * @returns Empty array
 */
export async function queryPendingFindings(
  sessionId: string,
  filters?: FindingFilters,
): Promise<AuditFinding[]> {
  return [];
}

/**
 * Query audit findings for a specific file.
 *
 * Returns empty array (no persistence backend available).
 *
 * @param filePath - The file path to query
 * @param sessionId - Optional session ID filter
 * @returns Empty array
 */
export async function queryFindingsForFile(
  filePath: string,
  sessionId?: string,
): Promise<AuditFinding[]> {
  return [];
}

/**
 * Get an aggregated summary of audit findings for a session.
 *
 * Returns zeroed summary (no persistence backend available).
 *
 * @param sessionId - The session ID to summarize
 * @returns Zeroed findings summary
 */
export async function getFindingsSummary(
  sessionId: string,
): Promise<FindingsSummary> {
  return createEmptySummary();
}
