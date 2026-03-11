/**
 * Zod schemas for the cross-agent interop scanner.
 *
 * Defines the finding and report shapes produced by
 * `scanAgentInterop()` in `__helpers/agent-interop-scanner.ts`.
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @module agents/__schemas/interop-scanner.schemas
 */
import { z } from "zod";

/**
 * A single interop finding (overlap, gap, or warning).
 *
 * Uses snake_case for all field names per API conventions.
 */
export const InteropFindingSchema = z.object({
  /** Finding type */
  type: z.enum(["overlap", "gap", "warning"]),
  /** Severity level */
  severity: z.enum(["low", "medium", "high"]),
  /** Human-readable description */
  description: z.string(),
  /** Agent names involved */
  agents: z.array(z.string()).default([]),
});

export type InteropFinding = z.infer<typeof InteropFindingSchema>;

/**
 * Full interop scan report.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const InteropReportSchema = z.object({
  /** Total number of agents scanned */
  agents_scanned: z.number().int().nonnegative(),
  /** All findings from the scan */
  findings: z.array(InteropFindingSchema).default([]),
  /** Number of overlaps found */
  overlap_count: z.number().int().nonnegative(),
  /** Number of gaps found */
  gap_count: z.number().int().nonnegative(),
  /** Number of warnings found */
  warning_count: z.number().int().nonnegative(),
  /** ISO 8601 timestamp when the scan was performed */
  scanned_at: z.string(),
});

export type InteropReport = z.infer<typeof InteropReportSchema>;
