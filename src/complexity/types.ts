/**
 * Type definitions for the Luca complexity gating system.
 *
 * Complexity levels control which workflow steps activate, how many
 * agents are spawned, iteration limits, and verification depth.
 * Five levels exist but behavior groups into three tiers:
 * - Group A (lightweight): TRIVIAL, SIMPLE
 * - Group B (standard): MODERATE
 * - Group C (thorough): COMPLEX, CRITICAL
 */
import type { CognitionTier } from "../agents/types/agent.types";
import type { ContextTier } from "../context/types";

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
export type ComplexityTier = "lightweight" | "standard" | "thorough";

export const COMPLEXITY_TIER: Record<ComplexityLevel, ComplexityTier> = {
  TRIVIAL: "lightweight",
  SIMPLE: "lightweight",
  MODERATE: "standard",
  COMPLEX: "thorough",
  CRITICAL: "thorough",
};

/** Classification criteria for a complexity level */
export interface ComplexityClassification {
  level: ComplexityLevel;
  fileCount: string; // e.g., "1", "2-3", "3-5", "5-10", "10+"
  scope: string; // e.g., "single component", "feature-scoped"
  risk: string; // e.g., "low", "medium", "high", "very high"
  estimatedTime: string; // e.g., "< 15 min", "15-30 min"
  examples: string[];
}

/** Verification mode mapped from complexity */
export type VerificationMode = "quick" | "standard" | "full" | "full+human";

/** Step activation status */
export type StepActivation =
  | "skip"
  | "optional"
  | "run"
  | "required"
  | "required+thorough";

/** Per-level workflow gating configuration */
export interface ComplexityGate {
  /** Cognitive pre-flight depth */
  cognitivePreflight: "lite" | "full";
  /** Whether research (lu-phase-researcher) runs */
  research: StepActivation;
  /** Whether discussion (phase-discuss) runs */
  discussion: StepActivation;
  /** Plan verification iterations (lu-plan-checker loop count) */
  planVerificationIterations: number;
  /** Harness fix iterations (Loop A: mechanical failure fix loop max) */
  harnessFixIterations: number;
  /** Verify fix iterations (Loop B: semantic gap fix loop max) */
  verifyFixIterations: number;
  /** Verification mode for lu-verifier */
  verificationMode: VerificationMode;
  /** Code review agents to spawn (by agent name) */
  codeReviewAgents: string[];
  /** UAT step activation */
  uat: StepActivation;
  /** Learning capture depth */
  learningCapture: "skip" | "brief" | "standard" | "full" | "full+debrief";
  /** Optional cognition tier promotions at this complexity level.
   *  Maps a default tier to a promoted tier (e.g., T1 -> T2 at COMPLEX). */
  cognitionPromotions?: Partial<Record<CognitionTier, CognitionTier>>;
  /** Optional context tier promotions at this complexity level.
   *  Maps a default context tier to a promoted tier. Context promotes one
   *  level earlier than cognition in the default matrix. */
  contextPromotions?: Partial<Record<ContextTier, ContextTier>>;
}

/** The complete complexity matrix: maps each level to its gate configuration */
export type ComplexityMatrix = Record<ComplexityLevel, ComplexityGate>;

/** Top-level complexity configuration (maps to config.json "complexity" section) */
export interface ComplexityConfig {
  /** Default level when no override is set. "auto" means lu-router infers. */
  defaultLevel: ComplexityLevel | "auto";
  /** The full gating matrix */
  matrix: ComplexityMatrix;
}

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
