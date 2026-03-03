/**
 * Zod schemas for PR verdict split detection and rebuttal debate.
 *
 * When the pr-address skill's parallel validator agents produce a split
 * verdict on a PR comment (e.g., 3-3 tie or narrow 4-2 split), these
 * schemas structure the detection, rebuttal, and resolution flow.
 *
 * Uses snake_case for all properties per API conventions.
 */
import { z } from "zod";

/**
 * Severity levels for PR validation verdicts.
 *
 * Matches the output format of pr-address validator agents.
 */
export const VERDICT_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

export const verdictSeveritySchema = z.enum(VERDICT_SEVERITIES);
export type VerdictSeverity = z.infer<typeof verdictSeveritySchema>;

/**
 * Normalized output from a single validator agent for a PR comment.
 *
 * Each validator agent (security-auditor, code-architect, dx-advocate, etc.)
 * returns a verdict on whether a PR review comment raises a valid concern.
 *
 * Uses snake_case for data schema compatibility.
 */
export const validatorVerdictSchema = z.object({
  /** The PR comment being validated */
  comment_id: z.string(),
  /** Which validator agent produced this verdict */
  agent: z.string(),
  /** Is the concern legitimate */
  valid: z.boolean(),
  /** Why valid or invalid */
  reasoning: z.string(),
  /** Severity of the concern */
  severity: verdictSeveritySchema,
  /** How to address the concern (when valid) */
  suggested_fix: z.string().optional(),
  /** Response explaining disagreement (when invalid) */
  disagree_response: z.string().optional(),
});
export type ValidatorVerdict = z.infer<typeof validatorVerdictSchema>;

/**
 * A detected split verdict for a single PR comment.
 *
 * Created when validator agents disagree on whether a PR review comment
 * raises a valid concern. A split occurs when the majority ratio is
 * at or below a configurable threshold (default 0.6).
 *
 * Uses snake_case for data schema compatibility.
 */
export const verdictSplitSchema = z.object({
  /** The PR comment that produced a split */
  comment_id: z.string(),
  /** Original PR comment text */
  comment_text: z.string(),
  /** Number of validators saying the concern is valid */
  valid_count: z.number().int().nonnegative(),
  /** Number of validators saying the concern is invalid */
  invalid_count: z.number().int().nonnegative(),
  /** Verdicts from validators who say valid */
  valid_verdicts: z.array(validatorVerdictSchema),
  /** Verdicts from validators who say invalid */
  invalid_verdicts: z.array(validatorVerdictSchema),
  /** Human-readable split ratio (e.g., "3-3", "4-2") */
  split_ratio: z.string(),
  /** Whether the split is an exact tie */
  is_tie: z.boolean(),
});
export type VerdictSplit = z.infer<typeof verdictSplitSchema>;

/**
 * Resolution outcomes for a verdict rebuttal.
 *
 * - majority_upheld: The majority position stands after debate
 * - dissent_acknowledged: The dissent has merit; both perspectives valid
 * - escalate_to_human: The disagreement requires human judgment
 */
export const VERDICT_REBUTTAL_RESOLUTIONS = [
  "majority_upheld",
  "dissent_acknowledged",
  "escalate_to_human",
] as const;

export const verdictRebuttalResolutionSchema = z.enum(
  VERDICT_REBUTTAL_RESOLUTIONS,
);
export type VerdictRebuttalResolution = z.infer<
  typeof verdictRebuttalResolutionSchema
>;

/**
 * A rebuttal exchange on a split verdict.
 *
 * Represents a single round where the dissenting side articulates their
 * argument and the majority side responds with a counter-argument.
 *
 * Uses snake_case for data schema compatibility.
 */
export const verdictRebuttalSchema = z.object({
  /** The PR comment being debated */
  comment_id: z.string(),
  /** The agent representing the dissenting position */
  dissenter_agent: z.string(),
  /** The dissenter's stance on the concern */
  dissenter_position: z.enum(["valid", "invalid"]),
  /** The dissenter's argument for their position */
  dissent_argument: z.string(),
  /** The majority side's counter-argument */
  majority_response: z.string(),
  /** How the rebuttal was resolved */
  resolution: verdictRebuttalResolutionSchema,
});
export type VerdictRebuttal = z.infer<typeof verdictRebuttalSchema>;

/**
 * Final recommendation outcomes for a split verdict.
 *
 * - fix: Majority says valid and is upheld; fix the concern
 * - disagree: Majority says invalid and is upheld; disagree with comment
 * - defer_to_human: Disagreement requires human judgment
 */
export const SPLIT_VERDICT_RECOMMENDATIONS = [
  "fix",
  "disagree",
  "defer_to_human",
] as const;

export const splitVerdictRecommendationSchema = z.enum(
  SPLIT_VERDICT_RECOMMENDATIONS,
);
export type SplitVerdictRecommendation = z.infer<
  typeof splitVerdictRecommendationSchema
>;

/**
 * Complete result for a split verdict debate on one PR comment.
 *
 * Aggregates the split detection, rebuttal exchanges, final
 * recommendation, and a summary presenting both perspectives.
 *
 * Uses snake_case for data schema compatibility.
 */
export const splitVerdictResultSchema = z.object({
  /** The PR comment that produced a split */
  comment_id: z.string(),
  /** Original PR comment text */
  comment_text: z.string(),
  /** Human-readable split ratio (e.g., "3-3", "4-2") */
  split_ratio: z.string(),
  /** Rebuttal exchanges conducted for this split */
  rebuttals: z.array(verdictRebuttalSchema),
  /** Final recommendation after debate */
  final_recommendation: splitVerdictRecommendationSchema,
  /** Confidence in the recommendation (0.0-1.0) */
  confidence: z.number().min(0).max(1),
  /** 2-3 sentence summary presenting both sides of the debate */
  both_perspectives_summary: z.string(),
});
export type SplitVerdictResult = z.infer<typeof splitVerdictResultSchema>;
