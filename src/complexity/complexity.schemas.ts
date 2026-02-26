/**
 * Type definitions for the Luca complexity gating system.
 *
 * Complexity levels control which workflow steps activate, how many
 * agents are spawned, iteration limits, and verification depth.
 * Five levels exist but behavior groups into three tiers:
 * - Group A (lightweight): TRIVIAL, SIMPLE
 * - Group B (standard): MODERATE
 * - Group C (thorough): COMPLEX, CRITICAL
 *
 * All data-shape types are derived from Zod schemas via z.infer.
 */
import { z } from "zod";
import { CognitionTierSchema } from "~/agents/__schemas/agent.schemas";
import { contextTierSchema } from "~/context/context.schemas";

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

/** Step activation status */
export const StepActivationSchema = z.enum([
  "skip",
  "optional",
  "run",
  "required",
  "required+thorough",
]);
export type StepActivation = z.infer<typeof StepActivationSchema>;

/** Per-level workflow gating configuration */
export const ComplexityGateSchema = z.object({
  /** Cognitive pre-flight depth */
  cognitivePreflight: z.enum(["lite", "full"]),
  /** Whether research (lu-phase-researcher) runs */
  research: StepActivationSchema,
  /** Whether discussion (phase-discuss) runs */
  discussion: StepActivationSchema,
  /** Plan verification iterations (lu-plan-checker loop count) */
  planVerificationIterations: z.number().int().nonnegative(),
  /** Harness fix iterations (Loop A: mechanical failure fix loop max) */
  harnessFixIterations: z.number().int().positive(),
  /** Verify fix iterations (Loop B: semantic gap fix loop max) */
  verifyFixIterations: z.number().int().nonnegative(),
  /** Verification mode for lu-verifier */
  verificationMode: VerificationModeSchema,
  /** Code review agents to spawn (by agent name) */
  codeReviewAgents: z.array(z.string()),
  /** UAT step activation */
  uat: StepActivationSchema,
  /** Learning capture depth */
  learningCapture: z.enum([
    "skip",
    "brief",
    "standard",
    "full",
    "full+debrief",
  ]),
  /** Optional cognition tier promotions at this complexity level.
   *  Maps a default tier to a promoted tier (e.g., T1 -> T2 at COMPLEX). */
  cognitionPromotions: z
    .object({
      T0: CognitionTierSchema.optional(),
      T1: CognitionTierSchema.optional(),
      T2: CognitionTierSchema.optional(),
      T3: CognitionTierSchema.optional(),
    })
    .optional(),
  /** Optional context tier promotions at this complexity level.
   *  Maps a default context tier to a promoted tier. Context promotes one
   *  level earlier than cognition in the default matrix. */
  contextPromotions: z
    .object({
      T0: contextTierSchema.optional(),
      T1: contextTierSchema.optional(),
      T2: contextTierSchema.optional(),
      T3: contextTierSchema.optional(),
    })
    .optional(),
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
