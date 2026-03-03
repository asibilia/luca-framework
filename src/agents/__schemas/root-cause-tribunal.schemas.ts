import { z } from "zod";

/**
 * Root Cause Challenge Categories.
 *
 * Used to classify the tribunal's assessment of a proposed debug fix.
 *
 * - symptom_treatment: Fix addresses a symptom, not the underlying cause
 * - verified_fix: Fix correctly addresses the root cause
 * - side_effects: Fix resolves the original issue but introduces new problems
 * - incomplete_fix: Fix partially addresses root cause but misses related issues
 *
 * Uses snake_case for data schema compatibility.
 */
export const ROOT_CAUSE_CHALLENGE_CATEGORIES = [
  "symptom_treatment",
  "verified_fix",
  "side_effects",
  "incomplete_fix",
] as const;

export const rootCauseChallengeCategorySchema = z.enum(
  ROOT_CAUSE_CHALLENGE_CATEGORIES,
);
export type RootCauseChallengeCategory = z.infer<
  typeof rootCauseChallengeCategorySchema
>;

/**
 * API Schema: Proposed fix signal from lu-debugger.
 *
 * The input that triggers a Root Cause Tribunal. Created when lu-debugger
 * returns a ROOT CAUSE FOUND or DEBUG COMPLETE signal with a proposed fix.
 *
 * **CRITICAL**: Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const signal: ProposedFixSignal = {
 *   phase: 93,
 *   debug_session_id: "20260303-143022",
 *   root_cause: "Race condition in state machine transition",
 *   proposed_fix: "Add mutex guard around state transitions",
 *   files_changed: ["src/state/machine.ts", "src/state/transitions.ts"],
 *   evidence_summary: "Reproduced with concurrent writes; mutex prevents interleaving",
 *   issue_count: 3,
 * }
 * ```
 */
export const proposedFixSignalSchema = z.object({
  /** Phase number where debugging occurred */
  phase: z.number().int().positive(),
  /** Debug session identifier */
  debug_session_id: z.string(),
  /** The root cause proposed by lu-debugger */
  root_cause: z.string(),
  /** Description of the fix applied or suggested */
  proposed_fix: z.string(),
  /** Files modified by the fix */
  files_changed: z.array(z.string()),
  /** Summary of evidence supporting the root cause */
  evidence_summary: z.string(),
  /** Number of issues in the debug session (for multi-issue gating) */
  issue_count: z.number().int().positive(),
});
export type ProposedFixSignal = z.infer<typeof proposedFixSignalSchema>;

/**
 * API Schema: One agent's assessment in the Root Cause Tribunal.
 *
 * Each tribunal participant (lu-debugger as defender, lu-verifier as challenger,
 * lu-integration-checker as arbiter) provides their perspective on the proposed fix.
 *
 * **CRITICAL**: Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const perspective: RootCausePerspective = {
 *   agent: "lu-verifier",
 *   category_assessment: "symptom_treatment",
 *   confidence: 0.85,
 *   evidence: "The fix suppresses the error but does not prevent the race condition",
 *   reproduction_result: "Original bug reproduced; fix masks it at the API layer",
 *   side_effects_found: ["Silent data corruption under high concurrency"],
 *   recommended_action: "Re-investigate with focus on the state machine's lock ordering",
 * }
 * ```
 */
export const rootCausePerspectiveSchema = z.object({
  /** Which agent provided this perspective */
  agent: z.string(),
  /** The agent's assessment of the fix category */
  category_assessment: rootCauseChallengeCategorySchema,
  /** Confidence in the assessment (0.0 = uncertain, 1.0 = certain) */
  confidence: z.number().min(0).max(1),
  /** Evidence supporting the assessment */
  evidence: z.string(),
  /** Result of attempting to reproduce the original bug */
  reproduction_result: z.string(),
  /** Any side effects detected from the proposed fix */
  side_effects_found: z.array(z.string()).default([]),
  /** Recommended next action */
  recommended_action: z.string(),
});
export type RootCausePerspective = z.infer<typeof rootCausePerspectiveSchema>;

/**
 * API Schema: Complete result of a Root Cause Tribunal session.
 *
 * Aggregates perspectives from three diagnostic agents (defender, challenger, arbiter),
 * determines consensus via majority vote, and provides an actionable resolution:
 * either "verified_fix" (proceed with commit) or "needs_deeper_investigation"
 * (re-investigate with tribunal findings).
 *
 * **CRITICAL**: Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const result: RootCauseTribunalResult = {
 *   phase: 93,
 *   proposed_fix_signal: signal,
 *   perspectives: [defenderView, challengerView, arbiterView],
 *   consensus_category: "verified_fix",
 *   consensus_confidence: 0.87,
 *   dissenting_perspective: undefined,
 *   resolution: "verified_fix",
 *   recommended_action: "Fix is validated. Proceed with commit.",
 *   estimated_token_cost: 24000,
 *   timestamp: "2026-03-03T14:30:22.000Z",
 * }
 * ```
 */
export const rootCauseTribunalResultSchema = z.object({
  /** Phase number */
  phase: z.number().int().positive(),
  /** The proposed fix signal that triggered the tribunal */
  proposed_fix_signal: proposedFixSignalSchema,
  /** Diagnostic perspectives from the three tribunal agents (exactly 3) */
  perspectives: z.array(rootCausePerspectiveSchema).length(3),
  /** Consensus category determined by majority vote */
  consensus_category: rootCauseChallengeCategorySchema,
  /** Confidence in the consensus (average of agreeing perspectives) */
  consensus_confidence: z.number().min(0).max(1),
  /** Dissenting perspective, if any agent disagreed with the consensus */
  dissenting_perspective: rootCausePerspectiveSchema.optional(),
  /** Resolution: verified_fix or needs_deeper_investigation */
  resolution: z.enum(["verified_fix", "needs_deeper_investigation"]),
  /** Recommended action based on the resolution */
  recommended_action: z.string(),
  /** Estimated token cost for the tribunal session */
  estimated_token_cost: z.number().int().nonnegative(),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});
export type RootCauseTribunalResult = z.infer<
  typeof rootCauseTribunalResultSchema
>;
