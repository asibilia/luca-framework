import { z } from "zod";

/**
 * Quality zones based on context usage percentage.
 *
 * Zones are advisory labels that inform scheduling decisions.
 * They correspond to the quality degradation curve:
 * - peak: 0-30% context -- best for complex work
 * - good: 30-50% context -- solid for moderate work
 * - degrading: 50-70% context -- simple/quick tasks only
 * - stop: 70%+ context -- halt, quality too low
 */
export const QUALITY_ZONES = ["peak", "good", "degrading", "stop"] as const;
export const qualityZoneSchema = z.enum(QUALITY_ZONES);
export type QualityZone = z.infer<typeof qualityZoneSchema>;

/**
 * Defines the context percentage boundaries for a quality zone.
 *
 * Uses snake_case for data schema compatibility.
 */
export const zoneBoundarySchema = z.object({
  /** Zone name */
  zone: qualityZoneSchema,
  /** Start percentage (inclusive) */
  start_percent: z.number().min(0).max(100),
  /** End percentage (exclusive, except for 'stop' which has no end) */
  end_percent: z.number().min(0).max(100),
  /** Human-readable description of zone suitability */
  description: z.string(),
});
export type ZoneBoundary = z.infer<typeof zoneBoundarySchema>;

/**
 * Effort point values mapped from complexity levels.
 *
 * Uses the Fibonacci-like proxy from 18-CONTEXT.md Decision 2:
 * TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8
 */
export const EFFORT_POINTS = [1, 2, 3, 5, 8] as const;
export const effortPointsSchema = z.number().int().positive();
export type EffortPoints = z.infer<typeof effortPointsSchema>;

/**
 * WSJF (Weighted Shortest Job First) input components.
 *
 * Each factor is scored 1-10 by the PM agent.
 * Final WSJF = (business_value + time_criticality + risk_reduction) / effort_points.
 *
 * Uses snake_case for data schema compatibility.
 */
export const wsjfInputSchema = z.object({
  /** Business value if completed (1-10) */
  business_value: z.number().int().min(1).max(10),
  /** Time sensitivity -- how much value decays with delay (1-10) */
  time_criticality: z.number().int().min(1).max(10),
  /** Risk or opportunity cost if not done (1-10) */
  risk_reduction: z.number().int().min(1).max(10),
  /** Effort proxy derived from complexity level */
  effort_points: effortPointsSchema,
});
export type WSJFInput = z.infer<typeof wsjfInputSchema>;

/**
 * A todo item with computed WSJF score and metadata.
 *
 * Uses snake_case for data schema compatibility.
 */
export const wsjfScoredItemSchema = z.object({
  /** Path to the todo markdown file */
  todo_path: z.string(),
  /** Title extracted from YAML frontmatter */
  title: z.string(),
  /** Area/category from YAML frontmatter */
  area: z.string(),
  /** WSJF input scores */
  wsjf_inputs: wsjfInputSchema,
  /** Computed WSJF score: (BV + TC + RR) / effort */
  wsjf_score: z.number().nonnegative(),
  /** Inferred complexity level */
  complexity: z.string(),
  /** Whether this item has no unresolved dependencies */
  dependency_free: z.boolean(),
  /** Advisory quality zone assignment */
  assigned_zone: qualityZoneSchema.optional(),
});
export type WSJFScoredItem = z.infer<typeof wsjfScoredItemSchema>;

/**
 * A session plan: ordered list of todos for a single 3-hour window.
 *
 * The plan includes a Big Rock first item, WSJF-ordered tail,
 * quality zone assignments, and a Mermaid gantt chart.
 *
 * Uses snake_case for data schema compatibility.
 */
export const sessionPlanSchema = z.object({
  /** ISO 8601 timestamp when the plan was generated */
  generated_at: z.string(),
  /** Session duration cap in minutes (default 180) */
  session_cap_minutes: z.number().int().positive().default(180),
  /** Total estimated effort points in this session */
  total_effort_points: z.number().int().nonnegative(),
  /** Ordered list of items to execute */
  items: z.array(wsjfScoredItemSchema),
  /** Index of the Big Rock item (always 0 if present) */
  big_rock_index: z.number().int().nonnegative().optional(),
  /** Mermaid gantt chart source */
  mermaid_gantt: z.string().optional(),
  /** Human-readable rationale for the ordering */
  rationale: z.string(),
});
export type SessionPlan = z.infer<typeof sessionPlanSchema>;

/**
 * Weekly allocation buckets for distributing work across sessions.
 *
 * From 18-CONTEXT.md Decision 5:
 * - needle_movers: 60% (high-impact, dependency-free)
 * - quick_wins: 25% (small, fast to complete)
 * - maintenance: 10% (tech debt, docs, cleanup)
 * - reserve: 5% (buffer for unexpected work)
 */
export const ALLOCATION_BUCKETS = [
  "needle_movers",
  "quick_wins",
  "maintenance",
  "reserve",
] as const;
export const allocationBucketSchema = z.enum(ALLOCATION_BUCKETS);
export type AllocationBucket = z.infer<typeof allocationBucketSchema>;

/**
 * A weekly plan distributing work across multiple sessions.
 *
 * Uses snake_case for data schema compatibility.
 */
export const weeklyPlanSchema = z.object({
  /** ISO 8601 timestamp when the plan was generated */
  generated_at: z.string(),
  /** Number of sessions planned for this week */
  sessions_planned: z.number().int().positive(),
  /** Per-bucket allocation as percentage */
  allocation: z.object({
    needle_movers: z.number().min(0).max(100),
    quick_wins: z.number().min(0).max(100),
    maintenance: z.number().min(0).max(100),
    reserve: z.number().min(0).max(100),
  }),
  /** Per-session plans (ordered by priority) */
  sessions: z.array(sessionPlanSchema),
  /** Items deferred beyond this week */
  deferred: z.array(wsjfScoredItemSchema),
  /** Total effort points across all sessions */
  total_effort_points: z.number().int().nonnegative(),
});
export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>;

/**
 * Token cost estimation entry for a task type.
 *
 * Tracks estimated vs actual context percentage consumed,
 * allowing calibration over time via MEMORY.md entries.
 *
 * Uses snake_case for data schema compatibility.
 */
export const tokenCostEstimateSchema = z.object({
  /** Complexity level this estimate applies to */
  complexity: z.string(),
  /** Estimated context percentage consumed */
  estimated_context_percent: z.number().min(0).max(100),
  /** Actual context percentage consumed (filled after execution) */
  actual_context_percent: z.number().min(0).max(100).optional(),
  /** Number of observations for this complexity level */
  sample_count: z.number().int().nonnegative().default(0),
  /** Source of the estimate: "cold_start" for defaults, "calibrated" for learned values */
  source: z.enum(["cold_start", "calibrated"]).default("cold_start"),
});
export type TokenCostEstimate = z.infer<typeof tokenCostEstimateSchema>;

/** Weekly allocation schema with per-field defaults. */
const weeklyAllocationConfigSchema = z.object({
  needle_movers: z.number().min(0).max(100).default(60),
  quick_wins: z.number().min(0).max(100).default(25),
  maintenance: z.number().min(0).max(100).default(10),
  reserve: z.number().min(0).max(100).default(5),
});

/** Zone boundaries schema with per-field defaults. */
const zoneBoundariesConfigSchema = z.object({
  peak_end: z.number().min(0).max(100).default(30),
  good_end: z.number().min(0).max(100).default(50),
  degrading_end: z.number().min(0).max(100).default(70),
});

/** Cold-start costs schema with per-field defaults. */
const coldStartCostsConfigSchema = z.object({
  TRIVIAL: z.number().min(0).max(100).default(5),
  SIMPLE: z.number().min(0).max(100).default(10),
  MODERATE: z.number().min(0).max(100).default(20),
  COMPLEX: z.number().min(0).max(100).default(35),
  CRITICAL: z.number().min(0).max(100).default(50),
});

/**
 * Configuration section for planner behavior in .planning/config.json.
 *
 * Uses snake_case for config file compatibility.
 */
export const plannerConfigSchema = z.object({
  /** Session duration cap in minutes */
  session_cap_minutes: z.number().int().positive().default(180),
  /** Weekly allocation percentages */
  weekly_allocation: weeklyAllocationConfigSchema.default(() => weeklyAllocationConfigSchema.parse({})),
  /** Quality zone boundaries (context percentage thresholds) */
  zone_boundaries: zoneBoundariesConfigSchema.default(() => zoneBoundariesConfigSchema.parse({})),
  /** Cold-start token cost estimates (context percentage per complexity level) */
  cold_start_costs: coldStartCostsConfigSchema.default(() => coldStartCostsConfigSchema.parse({})),
});
export type PlannerConfig = z.infer<typeof plannerConfigSchema>;

/**
 * Parsed metadata from a todo markdown file's YAML frontmatter.
 *
 * Todo files have 4 YAML frontmatter fields:
 * title, area, created, source.
 *
 * Uses snake_case for data schema compatibility.
 */
export const todoMetadataSchema = z.object({
  /** Title of the todo item */
  title: z.string(),
  /** Area/category (e.g., "workflow", "performance", "security") */
  area: z.string(),
  /** ISO date when the todo was created */
  created: z.string(),
  /** Origin of the todo (e.g., "conversation", "retrospective") */
  source: z.string(),
  /** File path of the todo markdown file */
  file_path: z.string(),
  /** Raw body content of the todo (below frontmatter) */
  body: z.string().optional(),
});
export type TodoMetadata = z.infer<typeof todoMetadataSchema>;
