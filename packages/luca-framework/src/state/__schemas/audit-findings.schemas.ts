/**
 * Zod schemas for audit findings persistence.
 *
 * Defines the shape and validation for review agent findings that
 * survive context compaction and can be retrieved later.
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @module luca-state/audit-findings-schemas
 */
import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Valid severity levels for audit findings. */
export const FINDING_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

/** Valid status values for audit findings. */
export const FINDING_STATUSES = [
  "pending",
  "in_progress",
  "resolved",
  "dismissed",
  "wont_fix",
] as const;

// ─── Schemas ────────────────────────────────────────────────────────────────

/**
 * Schema for a single audit finding.
 *
 * Represents a review agent's finding about a code issue,
 * persisted for retrieval across sessions.
 *
 * Uses snake_case for all properties per API conventions.
 */
export const auditFindingSchema = z.object({
  id: z.number().int().nonnegative().optional(),
  session_id: z.string().min(1),
  phase: z.string().default(""),
  source_agent: z.string().min(1),
  severity: z.enum(FINDING_SEVERITIES),
  category: z.string().min(1),
  file_path: z.string().default(""),
  line_start: z.number().int().nonnegative().default(0),
  line_end: z.number().int().nonnegative().default(0),
  finding: z.string().min(1),
  suggested_fix: z.string().default(""),
  context_snippet: z.string().default(""),
  status: z.enum(FINDING_STATUSES).default("pending"),
  resolution_notes: z.string().default(""),
  created_at: z.number().int().nonnegative().default(0),
  resolved_at: z.number().int().nonnegative().default(0),
});
export type AuditFinding = z.infer<typeof auditFindingSchema>;

/**
 * Schema for the params passed to persistFinding().
 *
 * Omits id (auto-generated), status (defaults to pending),
 * resolution_notes, and resolved_at.
 */
export const persistFindingParamsSchema = auditFindingSchema.omit({
  id: true,
  status: true,
  resolution_notes: true,
  resolved_at: true,
});
export type PersistFindingParams = z.infer<typeof persistFindingParamsSchema>;

/**
 * Schema for query filters when retrieving findings.
 *
 * All filters are optional and combined with AND logic.
 */
export const findingFiltersSchema = z.object({
  severity: z.enum(FINDING_SEVERITIES).optional(),
  category: z.string().optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  source_agent: z.string().optional(),
});
export type FindingFilters = z.infer<typeof findingFiltersSchema>;

/**
 * Schema for the aggregated findings summary.
 */
export const findingsSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  by_severity: z.record(
    z.enum(FINDING_SEVERITIES),
    z.number().int().nonnegative(),
  ),
  by_category: z.record(z.string(), z.number().int().nonnegative()),
  by_status: z.record(z.enum(FINDING_STATUSES), z.number().int().nonnegative()),
});
export type FindingsSummary = z.infer<typeof findingsSummarySchema>;
