import { isDebateComplexity } from "~/complexity";
import { sanitizeForTemplate } from "~/shared/__helpers/sanitize-template";
import { resolveMajorityVote } from "~/shared/__helpers/tribunal-consensus";

import {
  proposedFixSignalSchema,
  rootCauseTribunalResultSchema,
} from "../__schemas/root-cause-tribunal.schemas";
import type {
  RootCauseChallengeCategory,
  ProposedFixSignal,
  RootCausePerspective,
  RootCauseTribunalResult,
} from "../__schemas/root-cause-tribunal.schemas";

/**
 * Detect a proposed fix signal from lu-debugger output.
 *
 * Validates the input fields via `proposedFixSignalSchema.safeParse()`.
 * Returns null if validation fails (incomplete or malformed debug output),
 * or the parsed ProposedFixSignal on success.
 *
 * @param phase - Phase number where debugging occurred
 * @param debugSessionId - Debug session identifier
 * @param rootCause - The root cause proposed by lu-debugger
 * @param proposedFix - Description of the fix applied or suggested
 * @param filesChanged - Files modified by the fix
 * @param evidenceSummary - Summary of evidence supporting the root cause
 * @param issueCount - Number of issues in the debug session
 * @returns ProposedFixSignal if valid, null otherwise
 *
 * @example
 * ```typescript
 * const signal = detectProposedFix(
 *   93,
 *   "20260303-143022",
 *   "Race condition in state machine transition",
 *   "Add mutex guard around state transitions",
 *   ["src/state/machine.ts"],
 *   "Reproduced with concurrent writes",
 *   3,
 * );
 * // Returns ProposedFixSignal or null
 * ```
 */
export function detectProposedFix(
  phase: number,
  debugSessionId: string,
  rootCause: string,
  proposedFix: string,
  filesChanged: string[],
  evidenceSummary: string,
  issueCount: number,
): ProposedFixSignal | null {
  const parsed = proposedFixSignalSchema.safeParse({
    phase,
    debug_session_id: debugSessionId,
    root_cause: rootCause,
    proposed_fix: proposedFix,
    files_changed: filesChanged,
    evidence_summary: evidenceSummary,
    issue_count: issueCount,
  });

  return parsed.success ? parsed.data : null;
}

/**
 * Determine whether a Root Cause Tribunal should run.
 *
 * The tribunal gate activates when:
 * - A fix signal was detected (non-null)
 * - Complexity is COMPLEX or CRITICAL
 * - The debug session involved multiple issues (issue_count >= 2)
 *
 * @param fixSignal - Detected proposed fix signal (null if no fix detected)
 * @param complexity - Current task complexity level
 * @returns true if the Root Cause Tribunal should be convened
 *
 * @example
 * ```typescript
 * if (shouldRunRootCauseTribunal(fixSignal, "COMPLEX")) {
 *   // Build tribunal prompts and spawn agents
 * }
 * ```
 */
export function shouldRunRootCauseTribunal(
  fixSignal: ProposedFixSignal | null,
  complexity: string,
): boolean {
  if (!fixSignal) return false;

  if (!isDebateComplexity(complexity)) {
    return false;
  }

  // Single-issue debugging does not warrant a tribunal
  if (fixSignal.issue_count < 2) {
    return false;
  }

  return true;
}

/**
 * Build the defense prompt for lu-debugger to defend its proposed fix.
 *
 * The debugger acts as the defender in the tribunal, presenting evidence
 * that the fix addresses the true root cause rather than just a symptom.
 *
 * @param fixSignal - The proposed fix signal to defend
 * @returns Prompt string for lu-debugger defense
 *
 * @example
 * ```typescript
 * const prompt = buildDebuggerDefensePrompt(fixSignal);
 * // Use as Task prompt for lu-debugger
 * ```
 */
export function buildDebuggerDefensePrompt(
  fixSignal: ProposedFixSignal,
): string {
  return `You are defending your proposed fix in a Root Cause Tribunal.

**Root Cause:** ${sanitizeForTemplate(fixSignal.root_cause)}

**Proposed Fix:** ${sanitizeForTemplate(fixSignal.proposed_fix)}

**Files Changed:** ${fixSignal.files_changed.join(", ")}

**Evidence Summary:** ${sanitizeForTemplate(fixSignal.evidence_summary)}

**Your Role:** As lu-debugger, you proposed this fix. Now defend it against challenges.

**Present your case:**
1. Present your evidence that this fix addresses the root cause, not just a symptom.
2. What would happen if we reverted this fix? Would the original issue return?
3. Have you considered related failure modes that share the same root cause?

**Respond in this exact format:**
CATEGORY: symptom_treatment | verified_fix | side_effects | incomplete_fix
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
REPRODUCTION_RESULT: [What happens when reproducing the original bug after the fix]
SIDE_EFFECTS: [Comma-separated list of side effects, or "none"]
ACTION: [1-2 sentences recommending what to do next]`;
}

/**
 * Build the challenge prompt for lu-verifier to independently challenge the fix.
 *
 * The verifier acts as the challenger, independently reproducing the bug
 * and testing whether the proposed fix truly resolves it.
 *
 * @param fixSignal - The proposed fix signal to challenge
 * @returns Prompt string for lu-verifier challenge
 *
 * @example
 * ```typescript
 * const prompt = buildVerifierChallengePrompt(fixSignal);
 * // Use as Task prompt for lu-verifier
 * ```
 */
export function buildVerifierChallengePrompt(
  fixSignal: ProposedFixSignal,
): string {
  return `You are challenging a proposed fix in a Root Cause Tribunal.

**Root Cause (claimed):** ${sanitizeForTemplate(fixSignal.root_cause)}

**Proposed Fix:** ${sanitizeForTemplate(fixSignal.proposed_fix)}

**Files Changed:** ${fixSignal.files_changed.join(", ")}

**Evidence Summary:** ${sanitizeForTemplate(fixSignal.evidence_summary)}

**Your Role:** As lu-verifier, independently challenge whether this fix addresses the true root cause.

**Evaluate critically:**
1. Can you independently reproduce the original bug to confirm it was real?
2. Does the proposed fix actually resolve the reproduction, or does the bug manifest differently?
3. Is this treating the symptom or the cause? What evidence distinguishes the two?
4. What side effects might this fix introduce?

**Respond in this exact format:**
CATEGORY: symptom_treatment | verified_fix | side_effects | incomplete_fix
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
REPRODUCTION_RESULT: [Result of attempting to reproduce the original bug]
SIDE_EFFECTS: [Comma-separated list of side effects, or "none"]
ACTION: [1-2 sentences recommending what to do next]`;
}

/**
 * Build the arbiter prompt for lu-integration-checker to arbitrate the tribunal.
 *
 * The integration checker acts as the neutral arbiter, assessing the fix's
 * scope, downstream impact, and whether alternative approaches would be more robust.
 *
 * @param fixSignal - The proposed fix signal to arbitrate
 * @returns Prompt string for lu-integration-checker arbiter role
 *
 * @example
 * ```typescript
 * const prompt = buildArbiterPrompt(fixSignal);
 * // Use as Task prompt for lu-integration-checker
 * ```
 */
export function buildArbiterPrompt(fixSignal: ProposedFixSignal): string {
  return `You are the arbiter in a Root Cause Tribunal, providing a neutral assessment.

**Root Cause (claimed):** ${sanitizeForTemplate(fixSignal.root_cause)}

**Proposed Fix:** ${sanitizeForTemplate(fixSignal.proposed_fix)}

**Files Changed:** ${fixSignal.files_changed.join(", ")}

**Evidence Summary:** ${sanitizeForTemplate(fixSignal.evidence_summary)}

**Your Role:** As lu-integration-checker, provide a neutral assessment of the fix's correctness and scope.

**Evaluate from an integration perspective:**
1. Given the files changed, does this fix create orphaned references, broken imports, or downstream failures?
2. Is the fix scoped correctly, or does it touch too much / too little?
3. Would a different approach (broader fix, narrower fix, different root cause) be more robust?

**Respond in this exact format:**
CATEGORY: symptom_treatment | verified_fix | side_effects | incomplete_fix
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
REPRODUCTION_RESULT: [Assessment of whether the fix resolves the integration-level issue]
SIDE_EFFECTS: [Comma-separated list of side effects, or "none"]
ACTION: [1-2 sentences recommending what to do next]`;
}

/**
 * Action recommendations by consensus category.
 */
const ACTION_MAP: Record<RootCauseChallengeCategory, string> = {
  verified_fix: "Fix is validated. Proceed with commit.",
  symptom_treatment:
    "Fix treats a symptom. Re-investigate with focus on the underlying mechanism.",
  side_effects:
    "Fix resolves the original issue but introduces side effects. Address side effects before proceeding.",
  incomplete_fix:
    "Fix partially addresses root cause. Expand scope to cover related failure modes.",
};

/**
 * Resolution mapping by consensus category.
 */
const RESOLUTION_MAP: Record<
  RootCauseChallengeCategory,
  "verified_fix" | "needs_deeper_investigation"
> = {
  verified_fix: "verified_fix",
  symptom_treatment: "needs_deeper_investigation",
  side_effects: "needs_deeper_investigation",
  incomplete_fix: "needs_deeper_investigation",
};

/**
 * Resolve a Root Cause Tribunal from three diagnostic perspectives.
 *
 * Uses majority vote to determine the consensus category. In case of
 * a three-way split (no majority), uses the perspective with the highest
 * confidence as the tiebreaker. Maps the consensus to one of two resolutions:
 * "verified_fix" or "needs_deeper_investigation".
 *
 * @param phase - Phase number
 * @param fixSignal - The proposed fix signal being evaluated
 * @param perspectives - Exactly three diagnostic perspectives (defender, challenger, arbiter)
 * @returns Complete RootCauseTribunalResult
 *
 * @example
 * ```typescript
 * const result = resolveRootCauseTribunal(93, fixSignal, [
 *   debuggerPerspective,
 *   verifierPerspective,
 *   arbiterPerspective,
 * ]);
 * // result.resolution: "verified_fix" or "needs_deeper_investigation"
 * // result.recommended_action: actionable next step
 * ```
 */
export function resolveRootCauseTribunal(
  phase: number,
  fixSignal: ProposedFixSignal,
  perspectives: [
    RootCausePerspective,
    RootCausePerspective,
    RootCausePerspective,
  ],
): RootCauseTribunalResult | null {
  const vote = resolveMajorityVote<
    RootCauseChallengeCategory,
    RootCausePerspective
  >(perspectives);

  // Estimate token cost: ~8k per participant prompt (3 participants = ~24k)
  const estimatedTokenCost = 24000;

  const parsed = rootCauseTribunalResultSchema.safeParse({
    phase,
    proposed_fix_signal: fixSignal,
    perspectives,
    consensus_category: vote.consensus_category,
    consensus_confidence: vote.consensus_confidence,
    dissenting_perspective: vote.dissenter,
    resolution: RESOLUTION_MAP[vote.consensus_category],
    recommended_action: ACTION_MAP[vote.consensus_category],
    estimated_token_cost: estimatedTokenCost,
    timestamp: new Date().toISOString(),
  });

  if (!parsed.success) {
    console.error(
      `[root-cause-tribunal] Failed to parse tribunal result: ${parsed.error.message}`,
    );
    return null;
  }

  return parsed.data;
}
