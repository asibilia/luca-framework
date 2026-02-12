/**
 * Planner module for the Luca usage-aware sprint planning system.
 *
 * Provides session and weekly planning utilities that optimize todo
 * backlog execution within Claude Code's usage constraints.
 * The PM agent produces plans; it cannot execute changes (read-only).
 *
 * Sub-modules:
 * - types: Zod schemas and TypeScript types
 * - defaults: Effort mappings, zone boundaries, weekly ratios
 * - scoring: WSJF scoring engine (added in Plan 18-02)
 * - scheduler: Session scheduling (added in Plan 18-03)
 * - weekly: Weekly planner (added in Plan 18-05)
 */

// Types and schemas
export {
  // Quality zones
  QUALITY_ZONES,
  qualityZoneSchema,
  zoneBoundarySchema,
  // Effort
  EFFORT_POINTS,
  effortPointsSchema,
  // WSJF
  wsjfInputSchema,
  wsjfScoredItemSchema,
  // Session plan
  sessionPlanSchema,
  // Weekly plan
  ALLOCATION_BUCKETS,
  allocationBucketSchema,
  weeklyPlanSchema,
  // Token cost
  tokenCostEstimateSchema,
  // Configuration
  plannerConfigSchema,
  // Todo metadata
  todoMetadataSchema,
} from "./types";

export type {
  QualityZone,
  ZoneBoundary,
  EffortPoints,
  WSJFInput,
  WSJFScoredItem,
  SessionPlan,
  AllocationBucket,
  WeeklyPlan,
  TokenCostEstimate,
  PlannerConfig,
  TodoMetadata,
} from "./types";

// Defaults
export {
  EFFORT_MAP,
  DEFAULT_ZONE_BOUNDARIES,
  COMPLEXITY_ZONE_MAP,
  DEFAULT_WEEKLY_ALLOCATION,
  COLD_START_COSTS,
  DEFAULT_PLANNER_CONFIG,
  DEFAULT_SESSION_CAP_MINUTES,
  MAX_CONTEXT_PERCENT,
} from "./defaults";
