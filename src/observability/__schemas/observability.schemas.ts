/**
 * Observability schemas for agent effectiveness tracking.
 *
 * Provides Zod schemas for per-agent telemetry, scorecard persistence,
 * query filtering, and report generation.
 *
 * @module
 */
import { z } from "zod";

// ─── R12.1: Scorecard Entry ─────────────────────────────────────────────────

/**
 * Per-agent telemetry record.
 *
 * Tracks invocation count, success/failure rates, and timing for a single agent.
 */
export const scorecardEntrySchema = z.object({
  agent_name: z.string(),
  invocation_count: z.number().int().nonnegative().default(0),
  success_count: z.number().int().nonnegative().default(0),
  failure_count: z.number().int().nonnegative().default(0),
  total_duration_ms: z.number().nonnegative().default(0),
  avg_duration_ms: z.number().nonnegative().default(0),
  last_invoked: z.string().nullable().default(null),
});

export type ScorecardEntry = z.infer<typeof scorecardEntrySchema>;

// ─── R12.2: Scorecard (collection) ──────────────────────────────────────────

/**
 * Full scorecard: keyed collection of entries plus metadata.
 */
export const scorecardSchema = z.object({
  entries: z.record(z.string(), scorecardEntrySchema),
  updated_at: z.string(),
});

export type Scorecard = z.infer<typeof scorecardSchema>;

// ─── R12.3: Scorecard Query ─────────────────────────────────────────────────

/** Sortable fields for scorecard queries. */
export const SCORECARD_SORT_FIELDS = [
  "invocation_count",
  "success_rate",
  "avg_duration_ms",
  "last_invoked",
] as const;

export const scorecardSortFieldSchema = z.enum(SCORECARD_SORT_FIELDS);
export type ScorecardSortField = z.infer<typeof scorecardSortFieldSchema>;

/**
 * Query interface for filtering and sorting scorecard entries.
 *
 * Used by model routing to query agent effectiveness for routing decisions.
 */
export const scorecardQuerySchema = z.object({
  agent_name: z.string().optional(),
  min_invocations: z.number().int().nonnegative().optional(),
  sort_by: scorecardSortFieldSchema.optional(),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().positive().optional(),
});

export type ScorecardQuery = z.infer<typeof scorecardQuerySchema>;

// ─── R12.4: Scorecard Report ────────────────────────────────────────────────

/**
 * Report entry for dashboard/display output.
 */
export const scorecardReportEntrySchema = z.object({
  agent_name: z.string(),
  invocations: z.number().int().nonnegative(),
  success_rate: z.number().min(0).max(1),
  avg_duration_ms: z.number().nonnegative(),
  last_invoked: z.string().nullable(),
});

export type ScorecardReportEntry = z.infer<typeof scorecardReportEntrySchema>;

export const scorecardReportSchema = z.object({
  generated_at: z.string(),
  total_agents: z.number().int().nonnegative(),
  total_invocations: z.number().int().nonnegative(),
  entries: z.array(scorecardReportEntrySchema),
});

export type ScorecardReport = z.infer<typeof scorecardReportSchema>;
