/**
 * Default complexity configuration.
 * Defines the standard gating matrix used when no custom config exists.
 *
 * Design principle: 5 levels, 3 behavioral tiers.
 * - Group A (lightweight): TRIVIAL, SIMPLE — lightweight model routing
 * - Group B (standard): MODERATE — standard workflow
 * - Group C (thorough): COMPLEX, CRITICAL — full workflow with scaling
 *
 * Per-agent model routing is handled by MODEL_ROUTING_TABLE in model-routing.ts.
 * This matrix controls iteration counts, verification depth, and tier promotions.
 */
import type {
  ComplexityConfig,
  ComplexityLevel,
  ComplexityMatrix,
  ComplexityClassification,
} from "../__schemas/complexity.schemas";

/** Classification criteria for each level (used by lu-router) */
export const COMPLEXITY_CLASSIFICATIONS: Record<
  ComplexityLevel,
  ComplexityClassification
> = {
  TRIVIAL: {
    level: "TRIVIAL",
    fileCount: "1",
    scope: "Single component",
    risk: "Low",
    estimatedTime: "< 15 min",
    examples: [
      "Fix typo",
      "Update config value",
      "Add simple field",
      "Rename variable",
    ],
  },
  SIMPLE: {
    level: "SIMPLE",
    fileCount: "2-3",
    scope: "Related components",
    risk: "Low-Medium",
    estimatedTime: "15-30 min",
    examples: [
      "Add utility function + tests",
      "Update component + styles",
      "Add new route handler",
    ],
  },
  MODERATE: {
    level: "MODERATE",
    fileCount: "3-5",
    scope: "Feature-scoped",
    risk: "Medium",
    estimatedTime: "30-60 min",
    examples: [
      "Add new component with API",
      "Create new schema + migration",
      "Implement feature flag",
    ],
  },
  COMPLEX: {
    level: "COMPLEX",
    fileCount: "5-10",
    scope: "Cross-cutting",
    risk: "High",
    estimatedTime: "1-3 hours",
    examples: [
      "Auth system changes",
      "Multi-file refactor",
      "New integration",
      "Database redesign",
    ],
  },
  CRITICAL: {
    level: "CRITICAL",
    fileCount: "10+ OR architectural",
    scope: "System-wide",
    risk: "Very High",
    estimatedTime: "3+ hours",
    examples: [
      "Major architecture change",
      "Payment integration",
      "Security overhaul",
      "Platform migration",
    ],
  },
};

/**
 * The default gating matrix.
 *
 * Controls iteration counts, verification depth, and tier promotions.
 * Per-agent model routing is handled separately by MODEL_ROUTING_TABLE
 * in `src/complexity/__helpers/model-routing.ts`.
 */
export const DEFAULT_COMPLEXITY_MATRIX: ComplexityMatrix = {
  TRIVIAL: {
    cognitivePreflight: "lite",
    planVerificationIterations: 1,
    harnessFixIterations: 1,
    verifyFixIterations: 1,
    verificationMode: "quick",
    recallDepth: 1,
    default_model: "haiku",
    researchReviewIterations: 1,
    planReviewIterations: 1,
  },
  SIMPLE: {
    cognitivePreflight: "lite",
    planVerificationIterations: 1,
    harnessFixIterations: 2,
    verifyFixIterations: 1,
    verificationMode: "quick",
    recallDepth: 1,
    default_model: "haiku",
    researchReviewIterations: 2,
    planReviewIterations: 1,
  },
  MODERATE: {
    cognitivePreflight: "full",
    planVerificationIterations: 1,
    harnessFixIterations: 2,
    verifyFixIterations: 1,
    verificationMode: "standard",
    recallDepth: 3,
    contextPromotions: { T0: "T1", T1: "T2" },
    default_model: "sonnet",
    researchReviewIterations: 2,
    planReviewIterations: 2,
  },
  COMPLEX: {
    cognitivePreflight: "full",
    planVerificationIterations: 2,
    harnessFixIterations: 2,
    verifyFixIterations: 1,
    verificationMode: "full",
    recallDepth: null,
    cognitionPromotions: { T1: "T2", T2: "T3" },
    contextPromotions: { T0: "T1", T1: "T2", T2: "T3" },
    default_model: "sonnet",
    researchReviewIterations: 3,
    planReviewIterations: 2,
  },
  CRITICAL: {
    cognitivePreflight: "full",
    planVerificationIterations: 3,
    harnessFixIterations: 3,
    verifyFixIterations: 2,
    verificationMode: "full+human",
    recallDepth: null,
    cognitionPromotions: { T0: "T1", T1: "T2", T2: "T3" },
    contextPromotions: { T0: "T1", T1: "T2", T2: "T3" },
    default_model: "opus",
    researchReviewIterations: 3,
    planReviewIterations: 3,
  },
};

/** Default complexity config used when no config.json complexity section exists */
export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  defaultLevel: "auto",
  matrix: DEFAULT_COMPLEXITY_MATRIX,
};

/**
 * Reassessment thresholds for mid-execution complexity promotion.
 *
 * Maps each non-CRITICAL complexity level to the signal thresholds that
 * trigger promotion to the next level. Promotion uses OR logic — any
 * single signal exceeding its threshold triggers promotion.
 *
 * CRITICAL is excluded because there is no higher level to promote to.
 *
 * Threshold rationale (from CONTEXT.md Decision 3):
 * - files_touched_upper_bound: classification's upper bound for that level
 * - iteration_budget_ratio: 50% budget consumed = under-resourced signal
 * - error_count_threshold: ~2x expected error range for that level
 */
export const REASSESSMENT_THRESHOLDS: Record<
  Exclude<ComplexityLevel, "CRITICAL">,
  {
    files_touched_upper_bound: number;
    iteration_budget_ratio: number;
    error_count_threshold: number;
  }
> = {
  TRIVIAL: {
    files_touched_upper_bound: 1,
    iteration_budget_ratio: 0.5,
    error_count_threshold: 4,
  },
  SIMPLE: {
    files_touched_upper_bound: 3,
    iteration_budget_ratio: 0.5,
    error_count_threshold: 8,
  },
  MODERATE: {
    files_touched_upper_bound: 5,
    iteration_budget_ratio: 0.5,
    error_count_threshold: 14,
  },
  COMPLEX: {
    files_touched_upper_bound: 10,
    iteration_budget_ratio: 0.5,
    error_count_threshold: 24,
  },
};
