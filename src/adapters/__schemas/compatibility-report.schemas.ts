/**
 * Zod schemas and types for adapter compatibility reports.
 *
 * Defines the structured format for reporting how well compiled adapter
 * output conforms to each IDE's known constraints. Used by per-adapter
 * validators to produce machine-readable compatibility assessments.
 *
 * Property names use `snake_case` per API conventions. The report schema
 * is intended for developer consumption -- answering "What does Luca
 * support in my IDE?" with concrete per-feature breakdowns.
 *
 * @module
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Feature mapping status
// ---------------------------------------------------------------------------

/**
 * Feature mapping status in a compatibility report.
 *
 * - `fully_mapped`: All items for this feature compiled without issues
 * - `partially_mapped`: Some items degraded (truncated, dropped, or warned)
 * - `unsupported`: The target IDE does not support this feature at all
 */
export const featureMappingStatusSchema = z.enum([
  "fully_mapped",
  "partially_mapped",
  "unsupported",
]);
export type FeatureMappingStatus = z.infer<typeof featureMappingStatusSchema>;

// ---------------------------------------------------------------------------
// Feature mapping (per-feature status)
// ---------------------------------------------------------------------------

/**
 * A single feature's compatibility status within an adapter report.
 *
 * Captures the feature name (e.g., "rules", "skills", "hooks", "agents"),
 * its mapping status, item counts, degradation counts, and specific warnings.
 *
 * @example
 * ```typescript
 * const rulesMapping: FeatureMapping = {
 *   feature: "rules",
 *   status: "partially_mapped",
 *   notes: "3 rules truncated due to 12K character limit",
 *   item_count: 15,
 *   degraded_count: 3,
 *   warnings: [
 *     "Rule 'large-rule' truncated: removed 2400 chars to fit 12000 char budget",
 *   ],
 * };
 * ```
 */
export const featureMappingSchema = z.object({
  /** Feature name (e.g., "rules", "skills", "hooks", "agents") */
  feature: z.string(),
  /** Mapping status */
  status: featureMappingStatusSchema,
  /** Human-readable notes about the mapping */
  notes: z.string().default(""),
  /** Number of items compiled for this feature */
  item_count: z.number().int().nonnegative().default(0),
  /** Number of items that were truncated or degraded */
  degraded_count: z.number().int().nonnegative().default(0),
  /** Specific warnings (e.g., "3 rules truncated due to 12K limit") */
  warnings: z.array(z.string()).default([]),
});
export type FeatureMapping = z.infer<typeof featureMappingSchema>;

// ---------------------------------------------------------------------------
// Per-adapter compatibility report
// ---------------------------------------------------------------------------

/**
 * Per-adapter compatibility report.
 *
 * Contains the adapter identity, a timestamp, per-feature mapping status,
 * and summary fields for quick compatibility assessment.
 *
 * @example
 * ```typescript
 * const report: CompatibilityReport = {
 *   adapter_id: "windsurf",
 *   adapter_name: "Windsurf / Codeium",
 *   adapter_version: "2026.03",
 *   target_ide: "Windsurf",
 *   generated_at: "2026-03-24T12:00:00Z",
 *   features: [
 *     { feature: "rules", status: "partially_mapped", item_count: 15, degraded_count: 3, ... },
 *     { feature: "skills", status: "fully_mapped", item_count: 5, degraded_count: 0, ... },
 *   ],
 *   fully_compatible: false,
 *   total_warnings: 3,
 * };
 * ```
 */
export const compatibilityReportSchema = z.object({
  /** Adapter ID (e.g., "cursor", "windsurf", "vscode") */
  adapter_id: z.string(),
  /** Adapter name (human-readable) */
  adapter_name: z.string(),
  /** Adapter version */
  adapter_version: z.string(),
  /** Target IDE */
  target_ide: z.string(),
  /** Timestamp of report generation */
  generated_at: z.string().datetime(),
  /** Per-feature mapping status */
  features: z.array(featureMappingSchema),
  /** Overall summary: all features fully mapped? */
  fully_compatible: z.boolean(),
  /** Total warnings across all features */
  total_warnings: z.number().int().nonnegative(),
});
export type CompatibilityReport = z.infer<typeof compatibilityReportSchema>;

// ---------------------------------------------------------------------------
// Aggregated report (across all adapters)
// ---------------------------------------------------------------------------

/**
 * Aggregated report across all adapters.
 *
 * Wraps multiple per-adapter reports with a shared generation timestamp.
 * Produced by `aggregateReports()` after running all per-adapter validators.
 *
 * @example
 * ```typescript
 * const aggregated: AggregatedReport = {
 *   generated_at: "2026-03-24T12:00:00Z",
 *   adapters: [cursorReport, windsurfReport, vscodeReport],
 * };
 * ```
 */
export const aggregatedReportSchema = z.object({
  /** Timestamp of aggregated report generation */
  generated_at: z.string().datetime(),
  /** Per-adapter compatibility reports */
  adapters: z.array(compatibilityReportSchema),
});
export type AggregatedReport = z.infer<typeof aggregatedReportSchema>;
