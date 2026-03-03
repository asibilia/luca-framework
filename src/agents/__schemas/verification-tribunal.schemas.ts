import { z } from "zod";

/**
 * T1 (harness/test) signal status values.
 *
 * Uses snake_case for data schema compatibility.
 */
export const T1_STATUSES = [
  "strong_pass",
  "partial",
  "fail",
  "absent",
] as const;

export const t1StatusSchema = z.enum(T1_STATUSES);
export type T1Status = z.infer<typeof t1StatusSchema>;

/**
 * T3 (goal-backward analysis) signal status values.
 *
 * Uses snake_case for data schema compatibility.
 */
export const T3_STATUSES = ["pass", "partial", "fail", "skip"] as const;

export const t3StatusSchema = z.enum(T3_STATUSES);
export type T3Status = z.infer<typeof t3StatusSchema>;

/**
 * Conflict type between T1 and T3 signals.
 *
 * Uses snake_case for data schema compatibility.
 */
export const VERIFICATION_CONFLICT_TYPES = [
  "t1_pass_t3_partial",
  "t1_pass_t3_fail",
  "t1_partial_t3_partial",
] as const;

export const verificationConflictTypeSchema = z.enum(
  VERIFICATION_CONFLICT_TYPES,
);
export type VerificationConflictType = z.infer<
  typeof verificationConflictTypeSchema
>;

/**
 * A detected conflict between T1 (harness/test) and T3 (goal-backward) signals.
 *
 * Created when lu-verifier detects that T1 passes but T3 reports partial or fail,
 * indicating a discrepancy between mechanical test results and semantic goal analysis.
 *
 * Uses snake_case for data schema compatibility.
 */
export const conflictSignalSchema = z.object({
  /** Phase number where the conflict was detected */
  phase: z.number().int().positive(),
  /** T1 (harness/test) signal status */
  t1_status: t1StatusSchema,
  /** Evidence supporting the T1 signal status */
  t1_evidence: z.string(),
  /** T3 (goal-backward analysis) signal status */
  t3_status: t3StatusSchema,
  /** Evidence supporting the T3 signal status */
  t3_evidence: z.string(),
  /** Classification of the conflict between T1 and T3 */
  conflict_type: verificationConflictTypeSchema,
});
export type ConflictSignal = z.infer<typeof conflictSignalSchema>;

/**
 * Diagnostic category for a T1/T3 conflict.
 *
 * - tests_incomplete: Tests pass but don't cover the full goal specification
 * - goal_over_specified: T3 goal analysis expects more than the plan intended
 * - wiring_issue: Artifacts exist and tests pass but cross-component wiring is broken
 */
export const CONFLICT_CATEGORIES = [
  "tests_incomplete",
  "goal_over_specified",
  "wiring_issue",
] as const;

export const conflictCategorySchema = z.enum(CONFLICT_CATEGORIES);
export type ConflictCategory = z.infer<typeof conflictCategorySchema>;

/**
 * A diagnostic perspective from one of the three tribunal agents.
 *
 * Each agent (lu-test-writer, lu-verifier, lu-integration-checker) provides
 * their assessment of the conflict root cause.
 *
 * Uses snake_case for data schema compatibility.
 */
export const diagnosticPerspectiveSchema = z.object({
  /** Name of the agent providing this perspective */
  agent: z.string(),
  /** The agent's assessment of the conflict category */
  category_assessment: conflictCategorySchema,
  /** Confidence in the assessment (0.0 = uncertain, 1.0 = certain) */
  confidence: z.number().min(0).max(1),
  /** Evidence supporting the assessment */
  evidence: z.string(),
  /** Recommended action to resolve the conflict */
  recommended_action: z.string(),
});
export type DiagnosticPerspective = z.infer<typeof diagnosticPerspectiveSchema>;

/**
 * Complete result of a Verification Tribunal session.
 *
 * Aggregates perspectives from three diagnostic agents, determines consensus,
 * and provides actionable remediation guidance.
 *
 * Uses snake_case for data schema compatibility.
 */
export const verificationTribunalResultSchema = z.object({
  /** Phase number */
  phase: z.number().int().positive(),
  /** The conflict signal that triggered the tribunal */
  conflict_signal: conflictSignalSchema,
  /** Diagnostic perspectives from the three tribunal agents (exactly 3) */
  perspectives: z.array(diagnosticPerspectiveSchema).length(3),
  /** Consensus category determined by majority vote */
  consensus_category: conflictCategorySchema,
  /** Confidence in the consensus (average of agreeing perspectives) */
  consensus_confidence: z.number().min(0).max(1),
  /** Dissenting perspective, if any agent disagreed with the consensus */
  dissenting_perspective: diagnosticPerspectiveSchema.optional(),
  /** Recommended remediation based on the consensus category */
  recommended_remediation: z.string(),
  /** Estimated token cost for the tribunal session */
  estimated_token_cost: z.number().int().nonnegative(),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});
export type VerificationTribunalResult = z.infer<
  typeof verificationTribunalResultSchema
>;
