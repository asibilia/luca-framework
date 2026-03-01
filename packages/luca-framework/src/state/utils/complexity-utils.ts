/**
 * Complexity level types and utilities for luca-state.
 *
 * Self-contained copy of complexity types used by guards and defaults.
 * No external dependencies beyond TypeScript.
 *
 * @module luca-state/utils/complexity-utils
 */

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

/** Model identifier for routing decisions. */
export type ModelId = "opus" | "sonnet" | "haiku";

/**
 * High-level model tier for per-agent categorization.
 *
 * - **fast**: Lightweight agents (classifiers, routers) → maps to haiku
 * - **balanced**: Standard agents (planners, executors) → maps to sonnet
 * - **capable**: Deep-analysis agents (architects, auditors) → maps to opus
 */
export type ModelTier = "fast" | "balanced" | "capable";

/** Maps each model tier to its default ModelId. */
export const MODEL_TIER_TO_MODEL: Record<ModelTier, ModelId> = {
  fast: "haiku",
  balanced: "sonnet",
  capable: "opus",
};

/** Step activation status */
export type StepActivation =
  | "skip"
  | "optional"
  | "run"
  | "required"
  | "required+thorough";

/** Verification mode mapped from complexity */
export type VerificationMode = "quick" | "standard" | "full" | "full+human";

/**
 * Check if a complexity level meets or exceeds a threshold.
 *
 * @param level - The current complexity level
 * @param threshold - The minimum required level
 * @returns true if level >= threshold in COMPLEXITY_ORDER
 *
 * @example
 * ```typescript
 * meetsThreshold("COMPLEX", "MODERATE"); // true
 * meetsThreshold("SIMPLE", "COMPLEX");   // false
 * ```
 */
export function meetsThreshold(
  level: ComplexityLevel,
  threshold: ComplexityLevel,
): boolean {
  return COMPLEXITY_ORDER[level] >= COMPLEXITY_ORDER[threshold];
}
