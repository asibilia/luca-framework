/**
 * Milestone debate schemas for adversarial debate rounds in milestone audits.
 *
 * Extends the tribunal infrastructure from ~/shared with milestone-specific
 * metadata for cross-phase disagreement tracking and consensus reporting.
 *
 * Uses snake_case for all schema properties per API conventions.
 *
 * @module milestone-debate.schemas
 */
import { z } from "zod";

import { COMPLEXITY_LEVELS } from "~/complexity/__schemas/complexity.schemas";
import { tribunalResultSchema } from "~/shared/__schemas/tribunal.schemas";

/**
 * Configuration for the milestone audit debate round.
 *
 * Controls whether debate runs, the complexity threshold, iteration
 * caps, and token budget. Designed to be embedded in the workflow
 * config (e.g., .planning/config.json).
 *
 * Uses snake_case for data schema compatibility.
 *
 * @example
 * ```typescript
 * const config = milestoneDebateConfigSchema.parse({
 *   enabled: true,
 *   min_complexity: "COMPLEX",
 *   max_rebuttal_rounds: 1,
 *   token_budget: 40000,
 * });
 * ```
 */
export const milestoneDebateConfigSchema = z.object({
  /** Whether the debate round is enabled (opt-in) */
  enabled: z.boolean().default(false),
  /** Minimum complexity level required to activate debate */
  min_complexity: z.enum(COMPLEXITY_LEVELS).default("COMPLEX"),
  /** Maximum number of rebuttal iterations per disagreement */
  max_rebuttal_rounds: z.number().int().positive().default(1),
  /** Maximum token cost budget for the entire debate round */
  token_budget: z.number().int().positive().default(40000),
});
export type MilestoneDebateConfig = z.infer<typeof milestoneDebateConfigSchema>;

/**
 * Complete result of a milestone audit debate round.
 *
 * Wraps the core tribunal result with milestone-specific metadata
 * including version tracking, reviewer counts, cross-phase
 * disagreement tallies, and a human-readable consensus summary.
 *
 * Uses snake_case for data schema compatibility.
 *
 * @example
 * ```typescript
 * const result = milestoneDebateResultSchema.parse({
 *   milestone_version: "v2.5.1",
 *   reviewer_count: 5,
 *   cross_phase_disagreements: 2,
 *   tribunal_result: tribunalData,
 *   consensus_summary: "Architecture and simplification reviewers agreed on module extraction after debate.",
 * });
 * ```
 */
export const milestoneDebateResultSchema = z.object({
  /** Milestone version being audited (e.g., "v2.5.1") */
  milestone_version: z.string(),
  /** Number of reviewers that participated in the audit */
  reviewer_count: z.number().int().nonnegative(),
  /** Number of disagreements that span multiple phases */
  cross_phase_disagreements: z.number().int().nonnegative(),
  /** Core tribunal result with findings, rebuttals, and recommendations */
  tribunal_result: tribunalResultSchema,
  /** Human-readable 1-3 sentence synthesis of debate outcomes */
  consensus_summary: z.string(),
});
export type MilestoneDebateResult = z.infer<typeof milestoneDebateResultSchema>;
