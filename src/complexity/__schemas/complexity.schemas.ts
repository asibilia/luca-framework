/**
 * Type definitions for the Luca complexity gating system.
 *
 * Complexity levels control per-agent model routing (via MODEL_ROUTING_TABLE),
 * iteration limits, and verification depth. Five levels exist but behavior
 * groups into three tiers:
 * - Group A (lightweight): TRIVIAL, SIMPLE
 * - Group B (standard): MODERATE
 * - Group C (thorough): COMPLEX, CRITICAL
 *
 * All data-shape types are derived from Zod schemas via z.infer.
 */
import { z } from "zod";

/**
 * Local tier schema for complexity gating promotion maps.
 *
 * Both cognition tiers (agents) and context tiers share the same T0-T3
 * enum. Defined locally to avoid an upward dependency from complexity
 * (a leaf/config module) into agents or context (consumer modules).
 */
const tierSchema = z.enum(["T0", "T1", "T2", "T3"]);

/**
 * Model identifier for routing decisions.
 *
 * Defined in the complexity domain (T0) so both complexity gates
 * and agent schemas (T2) can reference it without upward imports.
 */
export const ModelIdSchema = z.enum(["opus", "sonnet", "haiku"]);
export type ModelId = z.infer<typeof ModelIdSchema>;

/**
 * High-level model tier for per-agent categorization.
 *
 * Agents declare a tier based on their compute needs:
 * - **fast**: Lightweight agents (classifiers, routers) → maps to haiku
 * - **balanced**: Standard agents (planners, executors) → maps to sonnet
 * - **capable**: Deep-analysis agents (architects, auditors) → maps to opus
 */
export const ModelTierSchema = z.enum(["fast", "balanced", "capable"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

/** Maps each model tier to its default ModelId */
export const MODEL_TIER_TO_MODEL: Record<ModelTier, ModelId> = {
  fast: "haiku",
  balanced: "sonnet",
  capable: "opus",
};

/** The five complexity levels, ordered from least to most complex */
export const COMPLEXITY_LEVELS = [
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "CRITICAL",
] as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

/** Numeric index for comparison (TRIVIAL=0, CRITICAL=4) */
export const COMPLEXITY_ORDER: Record<ComplexityLevel, number> = {
  TRIVIAL: 0,
  SIMPLE: 1,
  MODERATE: 2,
  COMPLEX: 3,
  CRITICAL: 4,
};

/** Behavioral tier grouping */
export const ComplexityTierSchema = z.enum([
  "lightweight",
  "standard",
  "thorough",
]);
export type ComplexityTier = z.infer<typeof ComplexityTierSchema>;

export const COMPLEXITY_TIER: Record<ComplexityLevel, ComplexityTier> = {
  TRIVIAL: "lightweight",
  SIMPLE: "lightweight",
  MODERATE: "standard",
  COMPLEX: "thorough",
  CRITICAL: "thorough",
};

/** Classification criteria for a complexity level */
export const ComplexityClassificationSchema = z.object({
  level: z.enum(COMPLEXITY_LEVELS),
  fileCount: z.string(),
  scope: z.string(),
  risk: z.string(),
  estimatedTime: z.string(),
  examples: z.array(z.string()),
});
export type ComplexityClassification = z.infer<
  typeof ComplexityClassificationSchema
>;

/** Verification mode mapped from complexity */
export const VerificationModeSchema = z.enum([
  "quick",
  "standard",
  "full",
  "full+human",
]);
export type VerificationMode = z.infer<typeof VerificationModeSchema>;

/**
 * Per-level workflow gating configuration.
 *
 * All workflow steps now run at every complexity level. Complexity controls
 * model tier (via MODEL_ROUTING_TABLE) and iteration counts (below).
 * Use `resolveModelForAgent(agentName, complexity)` to determine the
 * appropriate model for any agent at any complexity level.
 */
export const ComplexityGateSchema = z.object({
  /** Cognitive pre-flight depth */
  cognitivePreflight: z.enum(["lite", "full"]),
  /** Plan verification iterations (lu-plan-checker loop count) */
  planVerificationIterations: z.number().int().positive(),
  /** Harness fix iterations (Loop A: mechanical failure fix loop max) */
  harnessFixIterations: z.number().int().positive(),
  /** Verify fix iterations (Loop B: semantic gap fix loop max) */
  verifyFixIterations: z.number().int().positive(),
  /** Verification mode for lu-verifier */
  verificationMode: VerificationModeSchema,
  /**
   * Recall depth cap for complexity-gated memory recall.
   *
   * - Positive integer (e.g., 1, 3): hard cap on the number of recall entries
   * - null: use tier-scaled defaults (no hard cap)
   * - Omitted (undefined): no cap applied
   */
  recallDepth: z.number().int().min(1).nullable().optional(),
  /** Optional cognition tier promotions at this complexity level.
   *  Maps a default tier to a promoted tier (e.g., T1 -> T2 at COMPLEX). */
  cognitionPromotions: z
    .object({
      T0: tierSchema.optional(),
      T1: tierSchema.optional(),
      T2: tierSchema.optional(),
      T3: tierSchema.optional(),
    })
    .optional(),
  /** Optional context tier promotions at this complexity level.
   *  Maps a default context tier to a promoted tier. Context promotes one
   *  level earlier than cognition in the default matrix. */
  contextPromotions: z
    .object({
      T0: tierSchema.optional(),
      T1: tierSchema.optional(),
      T2: tierSchema.optional(),
      T3: tierSchema.optional(),
    })
    .optional(),
  /** Optional default model for this complexity level.
   *  Used as a fallback when an agent has no model_routing config. */
  default_model: ModelIdSchema.optional(),
});
export type ComplexityGate = z.infer<typeof ComplexityGateSchema>;

/** The complete complexity matrix: maps each level to its gate configuration */
export type ComplexityMatrix = Record<ComplexityLevel, ComplexityGate>;

/** Top-level complexity configuration (maps to config.json "complexity" section) */
export const ComplexityConfigSchema = z.object({
  /** Default level when no override is set. "auto" means lu-router infers. */
  defaultLevel: z.union([z.enum(COMPLEXITY_LEVELS), z.literal("auto")]),
  /** The full gating matrix */
  matrix: z.record(z.enum(COMPLEXITY_LEVELS), ComplexityGateSchema),
});
export type ComplexityConfig = z.infer<typeof ComplexityConfigSchema>;

/**
 * Purpose category type for role-based model routing.
 *
 * Defined in the complexity domain (T0) to avoid upward dependency
 * into agents (T2). Must be kept in sync with PurposeCategorySchema
 * in agents/__schemas/agent.schemas.ts.
 */
export type RolePurpose =
  | "researcher"
  | "planner"
  | "executor"
  | "verifier"
  | "reviewer"
  | "synthesizer"
  | "auditor"
  | "general";

/**
 * Default model assignment per purpose category.
 *
 * Maps each agent purpose (role) to a recommended ModelId. This
 * provides a sensible default when an agent has no explicit
 * model_routing or model_tier, before falling back to the
 * complexity gate default.
 *
 * Rationale:
 * - researcher/planner/auditor: Deep analysis benefits from opus
 * - executor/verifier/reviewer/synthesizer: Balanced throughput via sonnet
 * - general: Lightweight classification via haiku
 */
export const ROLE_MODEL_DEFAULTS: Record<RolePurpose, ModelId> = {
  researcher: "opus",
  planner: "opus",
  auditor: "opus",
  executor: "sonnet",
  verifier: "sonnet",
  reviewer: "sonnet",
  synthesizer: "sonnet",
  general: "haiku",
};

/**
 * Quality zone type for zone-aware model adjustments.
 *
 * Defined locally to avoid upward dependency into planner (T1).
 * Must be kept in sync with QUALITY_ZONES in planner/__schemas/planner.schemas.ts.
 */
type ZoneLabel = "peak" | "good" | "degrading" | "stop";

/**
 * Zone-based model adjustments for quality-aware routing.
 *
 * When context usage enters degrading or stop zones, models are
 * downgraded to conserve remaining context budget. In peak/good
 * zones, no adjustment is needed (null = use resolved model as-is).
 *
 * Adjustment semantics:
 * - null: No change, use the role/tier-resolved model
 * - ModelId: Override to this model regardless of role resolution
 */
export const ZONE_MODEL_ADJUSTMENTS: Record<ZoneLabel, ModelId | null> = {
  peak: null,
  good: null,
  degrading: "sonnet",
  stop: "haiku",
};

// ─── Reassessment Schemas ─────────────────────────────────────────────────

/**
 * Signals collected at a wave or harness boundary for complexity reassessment.
 *
 * These signals are compared against REASSESSMENT_THRESHOLDS to determine
 * whether the current complexity level should be promoted mid-execution.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ReassessmentSignalsSchema = z.object({
  /** Cumulative files touched since phase start */
  files_touched: z.number().int().nonnegative(),
  /** Consumed / max iteration budget ratio (0.0-1.0) */
  iteration_budget_ratio: z.number().min(0).max(1),
  /** Convergence failure flagged by stall detector */
  stall_detected: z.boolean(),
  /** Total errors from most recent harness run */
  error_count: z.number().int().nonnegative(),
  /** Current complexity level */
  current_level: z.enum(COMPLEXITY_LEVELS),
});

/** Signals collected at a wave or harness boundary for reassessment. */
export type ReassessmentSignals = z.infer<typeof ReassessmentSignalsSchema>;

/**
 * Result of a complexity reassessment check.
 *
 * Describes whether promotion was triggered, which signals exceeded
 * thresholds, the target level, and a human-readable explanation.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ReassessmentResultSchema = z.object({
  /** Whether the complexity level should be promoted */
  should_promote: z.boolean(),
  /** Signal names that triggered promotion */
  triggered_by: z.array(z.string()),
  /** New complexity level (same as current if no promotion) */
  promoted_to: z.enum(COMPLEXITY_LEVELS),
  /** Human-readable explanation of the reassessment decision */
  reason: z.string(),
});

/** Result of a complexity reassessment check. */
export type ReassessmentResult = z.infer<typeof ReassessmentResultSchema>;

// ─── Utilities ────────────────────────────────────────────────────────────

/** Utility: check if a level meets or exceeds a threshold */
export function meetsThreshold(
  level: ComplexityLevel,
  threshold: ComplexityLevel,
): boolean {
  return COMPLEXITY_ORDER[level] >= COMPLEXITY_ORDER[threshold];
}

/** Utility: get the behavioral tier for a level */
export function getTier(level: ComplexityLevel): ComplexityTier {
  return COMPLEXITY_TIER[level];
}
