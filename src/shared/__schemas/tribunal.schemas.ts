import { z } from "zod";

import { ConsensusResultSchema } from "./consensus.schemas";

/**
 * A single finding from a code reviewer agent.
 *
 * Matches the YAML output format used by code review agents
 * (dx-advocate, code-simplifier, code-architect, etc.).
 *
 * Uses snake_case for data schema compatibility.
 */
export const reviewFindingSchema = z.object({
  /** Unique finding identifier (generated during normalization) */
  id: z.string(),
  /** Severity level */
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  /** File path where the issue was found */
  file: z.string(),
  /** Line number in the file (0 if not specified) */
  line: z.number().int().nonnegative().default(0),
  /** Description of the issue */
  issue: z.string(),
  /** Suggested fix */
  suggestion: z.string().default(""),
  /** Name of the agent that produced this finding */
  source_agent: z.string(),
});
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

/**
 * Types of conflicts between reviewer findings.
 *
 * - contradictory: Two agents disagree on whether something is an issue
 * - severity_mismatch: Same issue identified at different severity levels
 * - scope_overlap: Multiple agents flag the same location with different issues
 */
export const CONFLICT_TYPES = [
  "contradictory",
  "severity_mismatch",
  "scope_overlap",
] as const;

export const conflictTypeSchema = z.enum(CONFLICT_TYPES);
export type ConflictType = z.infer<typeof conflictTypeSchema>;

/**
 * A detected disagreement between two or more reviewer findings.
 *
 * Created when multiple agents flag the same file:line with
 * conflicting assessments.
 *
 * Uses snake_case for data schema compatibility.
 */
export const disagreementSchema = z.object({
  /** Unique disagreement identifier */
  id: z.string(),
  /** File where the disagreement occurs */
  file: z.string(),
  /** Line number where the disagreement occurs */
  line: z.number().int().nonnegative(),
  /** The conflicting findings from different agents */
  conflicting_findings: z.array(reviewFindingSchema).min(2),
  /** Type of conflict detected */
  conflict_type: conflictTypeSchema,
});
export type Disagreement = z.infer<typeof disagreementSchema>;

/**
 * Resolution status for a rebuttal.
 *
 * - upheld: The original finding stands after challenge
 * - withdrawn: The finding is withdrawn after challenge
 * - modified: The finding is modified (e.g., severity adjusted)
 */
export const REBUTTAL_RESOLUTIONS = [
  "upheld",
  "withdrawn",
  "modified",
] as const;

export const rebuttalResolutionSchema = z.enum(REBUTTAL_RESOLUTIONS);
export type RebuttalResolution = z.infer<typeof rebuttalResolutionSchema>;

/**
 * A rebuttal record from a debate round.
 *
 * Represents a challenger questioning a finding and
 * the defender's response, with a final resolution.
 *
 * Uses snake_case for data schema compatibility.
 */
export const rebuttalSchema = z.object({
  /** ID of the finding being challenged */
  finding_id: z.string(),
  /** Name of the challenging agent */
  challenger_agent: z.string(),
  /** The challenge argument */
  challenge: z.string(),
  /** The defender's response */
  defender_response: z.string(),
  /** How the rebuttal was resolved */
  resolution: rebuttalResolutionSchema,
});
export type Rebuttal = z.infer<typeof rebuttalSchema>;

/**
 * A unified recommendation after debate resolution.
 *
 * Combines the original finding with confidence scores
 * and debate history for informed decision-making.
 *
 * Uses snake_case for data schema compatibility.
 */
export const unifiedRecommendationSchema = z.object({
  /** The finding (potentially modified after debate) */
  finding: reviewFindingSchema,
  /** Confidence in this recommendation (0.0 = uncertain, 1.0 = unanimous) */
  confidence: z.number().min(0).max(1),
  /** Number of agents that agree with this finding */
  agreement_count: z.number().int().nonnegative(),
  /** Number of agents that dissent from this finding */
  dissent_count: z.number().int().nonnegative(),
  /** Rebuttals that involved this finding */
  debate_history: z.array(rebuttalSchema).default([]),
});
export type UnifiedRecommendation = z.infer<typeof unifiedRecommendationSchema>;

/**
 * Complete result of a Design Tribunal session.
 *
 * Aggregates all findings, disagreements, rebuttals, and
 * unified recommendations with cost tracking.
 *
 * Uses snake_case for data schema compatibility.
 */
export const tribunalResultSchema = z.object({
  /** Phase number */
  phase: z.number().int().positive(),
  /** Total findings from all reviewers before tribunal */
  total_findings: z.number().int().nonnegative(),
  /** Number of disagreements detected between reviewers */
  disagreements_detected: z.number().int().nonnegative(),
  /** Number of rebuttals conducted */
  rebuttals_conducted: z.number().int().nonnegative(),
  /** Number of findings withdrawn after debate */
  findings_withdrawn: z.number().int().nonnegative(),
  /** Number of findings modified after debate */
  findings_modified: z.number().int().nonnegative(),
  /** Final unified recommendations */
  unified_recommendations: z.array(unifiedRecommendationSchema),
  /** Estimated token cost for debate rounds */
  debate_token_cost: z.number().int().nonnegative().default(0),
  /** Consensus resolution result (present when formal consensus was computed) */
  consensus: ConsensusResultSchema.optional(),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});
export type TribunalResult = z.infer<typeof tribunalResultSchema>;
