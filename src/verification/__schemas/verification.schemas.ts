/**
 * Zod schemas for the structured verification result contract.
 *
 * These schemas define the machine-readable output that lu-verifier writes
 * as `verification-result.json` in each phase directory. The milestone
 * validator and orchestrator consume this JSON without prose parsing.
 *
 * **Convention**: Uses snake_case field names since these schemas define
 * the serialized JSON format (the file IS the API payload). This matches
 * the harness pattern where internal schemas use camelCase but serialized
 * output uses snake_case. Here the schema directly describes the JSON
 * file format, so snake_case is used throughout.
 *
 * @module verification.schemas
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*  Per-criterion result                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Result for a single success criterion evaluated by lu-verifier.
 *
 * Each criterion has a stable ID (SC-1, SC-2, ...) assigned by lu-planner
 * and carried through execution and verification unchanged.
 *
 * @example
 * ```typescript
 * const criterion: CriterionResult = {
 *   criterion_id: "SC-1",
 *   description: "Schema exports PhaseVerificationResultSchema",
 *   met: true,
 *   evidence: "src/verification/__schemas/verification.schemas.ts exports it",
 *   blocking: false,
 * };
 * ```
 */
export const CriterionResultSchema = z.object({
  /** Stable criterion identifier, e.g. "SC-1", "SC-2" */
  criterion_id: z.string(),
  /** Human-readable description of the criterion */
  description: z.string(),
  /** Whether the criterion was met */
  met: z.boolean(),
  /** File path or inline observation proving the criterion status */
  evidence: z.string(),
  /** Explanation of the gap — only present when met === false */
  gap: z.string().optional(),
  /** Whether this unmet criterion blocks milestone completion */
  blocking: z.boolean().default(false),
});
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

/* -------------------------------------------------------------------------- */
/*  Phase-level verification result                                           */
/* -------------------------------------------------------------------------- */

/**
 * Top-level verification result written as `verification-result.json`
 * in the phase directory by lu-verifier.
 *
 * The orchestrator reads this file mechanically to determine phase
 * outcome without parsing VERIFICATION.md prose.
 *
 * @example
 * ```typescript
 * const result: PhaseVerificationResult = {
 *   phase: "261",
 *   verdict: "PASSED",
 *   criteria_met: 4,
 *   criteria_total: 4,
 *   criteria: [criterionA, criterionB, criterionC, criterionD],
 *   blocking_gaps: [],
 *   timestamp: "2026-04-01T12:00:00Z",
 *   duration_ms: 3200,
 * };
 * ```
 */
export const PhaseVerificationResultSchema = z.object({
  /** Phase number or identifier */
  phase: z.string(),
  /** Overall verdict: PASSED if all criteria met, ISSUES if any gap */
  verdict: z.enum(["PASSED", "ISSUES"]),
  /** Count of criteria that were met */
  criteria_met: z.number().int().nonnegative(),
  /** Total number of criteria evaluated */
  criteria_total: z.number().int().positive(),
  /** Per-criterion evaluation results */
  criteria: z.array(CriterionResultSchema),
  /** Criterion IDs where blocking === true and met === false */
  blocking_gaps: z.array(z.string()),
  /** ISO-8601 timestamp when verification completed */
  timestamp: z.string(),
  /** Duration of verification in milliseconds */
  duration_ms: z.number().nonnegative().optional(),
});
export type PhaseVerificationResult = z.infer<
  typeof PhaseVerificationResultSchema
>;

/* -------------------------------------------------------------------------- */
/*  Milestone-level aggregation result                                        */
/* -------------------------------------------------------------------------- */

/**
 * Aggregated milestone verdict produced by the deterministic
 * milestone validator. Summarizes all phase verification results.
 *
 * @example
 * ```typescript
 * const milestone: MilestoneVerdict = {
 *   phases_verified: 3,
 *   phases_missing: [".planning/phases/260-token-profiles"],
 *   phases_passed: 2,
 *   phases_with_issues: 1,
 *   blocking_gaps: ["Phase 259: SC-2"],
 *   milestone_verdict: "ISSUES",
 * };
 * ```
 */
export const MilestoneVerdictSchema = z.object({
  /** Count of phases with a valid verification-result.json */
  phases_verified: z.number().int().nonnegative(),
  /** Phase directory paths that had no verification-result.json */
  phases_missing: z.array(z.string()),
  /** Count of verified phases with verdict === "PASSED" */
  phases_passed: z.number().int().nonnegative(),
  /** Count of verified phases with verdict === "ISSUES" */
  phases_with_issues: z.number().int().nonnegative(),
  /** All blocking gaps aggregated across phases, prefixed with phase */
  blocking_gaps: z.array(z.string()),
  /** Overall milestone verdict */
  milestone_verdict: z.enum(["PASSED", "ISSUES"]),
});
export type MilestoneVerdict = z.infer<typeof MilestoneVerdictSchema>;
