import { isDebateComplexity } from "~/complexity";
import { sanitizeForTemplate } from "~/shared/__helpers/sanitize-template";
import { resolveMajorityVote } from "~/shared/__helpers/tribunal-consensus";

import {
  conflictSignalSchema,
  verificationTribunalResultSchema,
} from "../__schemas/verification-tribunal.schemas";
import type {
  T1Status,
  T3Status,
  ConflictSignal,
  ConflictCategory,
  DiagnosticPerspective,
  VerificationTribunalResult,
} from "../__schemas/verification-tribunal.schemas";

/**
 * Detect a T1/T3 conflict from harness and goal-backward signal statuses.
 *
 * Returns a ConflictSignal when T1 indicates passing but T3 indicates
 * partial or fail, suggesting a discrepancy between mechanical test
 * results and semantic goal analysis.
 *
 * @param phase - Phase number where signals were produced
 * @param t1Status - T1 (harness/test) signal status
 * @param t1Evidence - Evidence supporting the T1 assessment
 * @param t3Status - T3 (goal-backward) signal status
 * @param t3Evidence - Evidence supporting the T3 assessment
 * @returns ConflictSignal if a conflict is detected, null otherwise
 *
 * @example
 * ```typescript
 * const conflict = detectT1T3Conflict(
 *   92,
 *   "strong_pass",
 *   "All 47 tests pass, TDD-generated",
 *   "partial",
 *   "Chat component renders but no error handling"
 * );
 * // Returns ConflictSignal with conflict_type: "t1_pass_t3_partial"
 * ```
 */
export function detectT1T3Conflict(
  phase: number,
  t1Status: T1Status,
  t1Evidence: string,
  t3Status: T3Status,
  t3Evidence: string,
): ConflictSignal | null {
  // Only detect conflicts when T1 passes/partially passes but T3 disagrees
  // T1 FAIL always results in gaps_found (no conflict — T1 failure is blocking)
  // T1 absent means T3 is primary (no conflict — no T1 to conflict with)
  if (t1Status === "fail" || t1Status === "absent") {
    return null;
  }

  // T1 strong_pass + T3 partial → conflict
  if (t1Status === "strong_pass" && t3Status === "partial") {
    const parsed = conflictSignalSchema.safeParse({
      phase,
      t1_status: t1Status,
      t1_evidence: t1Evidence,
      t3_status: t3Status,
      t3_evidence: t3Evidence,
      conflict_type: "t1_pass_t3_partial",
    });
    return parsed.success ? parsed.data : null;
  }

  // T1 strong_pass + T3 fail → conflict
  if (t1Status === "strong_pass" && t3Status === "fail") {
    const parsed = conflictSignalSchema.safeParse({
      phase,
      t1_status: t1Status,
      t1_evidence: t1Evidence,
      t3_status: t3Status,
      t3_evidence: t3Evidence,
      conflict_type: "t1_pass_t3_fail",
    });
    return parsed.success ? parsed.data : null;
  }

  // T1 partial + T3 partial → conflict
  if (t1Status === "partial" && t3Status === "partial") {
    const parsed = conflictSignalSchema.safeParse({
      phase,
      t1_status: t1Status,
      t1_evidence: t1Evidence,
      t3_status: t3Status,
      t3_evidence: t3Evidence,
      conflict_type: "t1_partial_t3_partial",
    });
    return parsed.success ? parsed.data : null;
  }

  // No conflict detected for other combinations
  return null;
}

/**
 * Determine whether a verification tribunal should run.
 *
 * The tribunal gate activates when:
 * - A conflict was detected (non-null)
 * - Complexity is COMPLEX or CRITICAL
 *
 * @param conflict - Detected conflict signal (null if no conflict)
 * @param complexity - Current task complexity level
 * @returns true if the verification tribunal should be convened
 *
 * @example
 * ```typescript
 * if (shouldRunVerificationTribunal(conflict, "COMPLEX")) {
 *   // Build diagnostic prompts and spawn tribunal agents
 * }
 * ```
 */
export function shouldRunVerificationTribunal(
  conflict: ConflictSignal | null,
  complexity: string,
): boolean {
  if (!conflict) return false;

  return isDebateComplexity(complexity);
}

/**
 * Configuration for a diagnostic prompt perspective.
 *
 * Each diagnostic agent in the verification tribunal uses the same
 * prompt template but with different role context and evaluation
 * questions. This interface captures those differences.
 */
interface DiagnosticPromptConfig {
  opening_qualifier: string;
  role: string;
  role_description: string;
  questions: [string, string, string];
}

/**
 * Factory function that builds a diagnostic prompt from a config.
 *
 * Produces the shared prompt template used by all three tribunal
 * diagnosticians (lu-test-writer, lu-verifier, lu-integration-checker).
 * Only the role name, role description, opening qualifier, and three
 * evaluation questions differ between perspectives.
 *
 * @param conflict - The conflict signal to diagnose
 * @param config - Perspective-specific configuration
 * @returns Formatted prompt string for the diagnostic agent
 */
function buildDiagnosticPrompt(
  conflict: ConflictSignal,
  config: DiagnosticPromptConfig,
): string {
  return `You are diagnosing a conflict between test results (T1) and ${config.opening_qualifier} (T3).

**Conflict Type:** ${conflict.conflict_type}

**T1 Signal (${conflict.t1_status}):**
${sanitizeForTemplate(conflict.t1_evidence)}

**T3 Signal (${conflict.t3_status}):**
${sanitizeForTemplate(conflict.t3_evidence)}

**Your Role:** As ${config.role}, ${config.role_description}.

**Evaluate:**
1. ${config.questions[0]}
2. ${config.questions[1]}
3. ${config.questions[2]}

**Categorize the root cause as ONE of:**
- \`tests_incomplete\`: Tests pass but don't cover the full goal specification
- \`goal_over_specified\`: The goal-backward analysis expects more than the plan intended
- \`wiring_issue\`: Tests pass in isolation but cross-component integration is broken

**Respond in this exact format:**
CATEGORY: tests_incomplete | goal_over_specified | wiring_issue
CONFIDENCE: 0.0 to 1.0
EVIDENCE: [2-3 sentences explaining your reasoning]
ACTION: [1-2 sentences recommending what to do next]`;
}

/**
 * Build the diagnostic prompt for lu-test-writer to analyze a T1/T3 conflict.
 *
 * The test writer perspective focuses on test coverage gaps: whether the
 * existing tests adequately cover the plan specification.
 *
 * @param conflict - The conflict signal to diagnose
 * @returns Prompt string for lu-test-writer diagnostic analysis
 */
export function buildTestWriterDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return buildDiagnosticPrompt(conflict, {
    opening_qualifier: "goal-backward analysis",
    role: "lu-test-writer",
    role_description:
      "analyze whether the existing tests adequately cover the plan specification",
    questions: [
      "Do the passing tests actually verify the goal's intent, or just surface-level behavior?",
      "Are there specification requirements that have NO corresponding test?",
      "Could the tests be passing with stubs, mocks, or incomplete implementations?",
    ],
  });
}

/**
 * Build the diagnostic prompt for lu-verifier to analyze a T1/T3 conflict.
 *
 * The verifier perspective focuses on goal specification accuracy: whether
 * the T3 assessment is appropriately scoped for the plan's objectives.
 *
 * @param conflict - The conflict signal to diagnose
 * @returns Prompt string for lu-verifier diagnostic analysis
 */
export function buildVerifierDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return buildDiagnosticPrompt(conflict, {
    opening_qualifier: "your own goal-backward analysis",
    role: "lu-verifier",
    role_description:
      "critically re-examine your T3 goal-backward analysis for this conflict",
    questions: [
      "Were the must-have truths appropriately scoped for the plan's actual objectives?",
      "Did the goal-backward analysis introduce requirements beyond what the plan specified?",
      "Is the T3 PARTIAL/FAIL status based on missing implementation or missing specification?",
    ],
  });
}

/**
 * Build the diagnostic prompt for lu-integration-checker to analyze a T1/T3 conflict.
 *
 * The integration checker perspective focuses on cross-component wiring:
 * whether artifacts are properly connected even if individual tests pass.
 *
 * @param conflict - The conflict signal to diagnose
 * @returns Prompt string for lu-integration-checker diagnostic analysis
 */
export function buildIntegrationDiagnosticPrompt(
  conflict: ConflictSignal,
): string {
  return buildDiagnosticPrompt(conflict, {
    opening_qualifier: "goal-backward analysis",
    role: "lu-integration-checker",
    role_description:
      "analyze whether cross-component wiring is the root cause of this conflict",
    questions: [
      "Could unit tests pass while integration between components is broken?",
      "Are there import/export connections that exist on paper but fail at runtime?",
      "Is there a disconnect between what's tested (unit behavior) and what's needed (integrated behavior)?",
    ],
  });
}

/**
 * Remediation recommendations by conflict category.
 */
const REMEDIATION_MAP: Record<ConflictCategory, string> = {
  tests_incomplete:
    "Write additional tests covering the specification gaps identified by T3 analysis. " +
    "Focus on integration tests that verify end-to-end behavior, not just unit-level stubs.",
  goal_over_specified:
    "Revisit the must-have truths in VERIFICATION.md. The T3 goal-backward analysis " +
    "may have derived requirements beyond the plan's scope. Adjust must-haves to match " +
    "the plan's actual objectives, then re-verify.",
  wiring_issue:
    "Fix cross-component wiring gaps. Artifacts exist and pass individual tests but " +
    "are not properly connected. Check imports, exports, and data flow between components.",
};

/**
 * Resolve a verification tribunal from three diagnostic perspectives.
 *
 * Uses majority vote to determine the consensus category. In case of
 * a three-way split (no majority), uses the perspective with the highest
 * confidence as the tiebreaker. Maps the consensus to actionable
 * remediation guidance.
 *
 * @param phase - Phase number
 * @param conflict - The conflict signal being diagnosed
 * @param perspectives - Exactly three diagnostic perspectives
 * @returns Complete VerificationTribunalResult
 *
 * @example
 * ```typescript
 * const result = resolveVerificationTribunal(92, conflict, [
 *   testWriterPerspective,
 *   verifierPerspective,
 *   integrationPerspective,
 * ]);
 * // result.consensus_category: "tests_incomplete"
 * // result.recommended_remediation: "Write additional tests..."
 * ```
 */
export function resolveVerificationTribunal(
  phase: number,
  conflict: ConflictSignal,
  perspectives: [
    DiagnosticPerspective,
    DiagnosticPerspective,
    DiagnosticPerspective,
  ],
): VerificationTribunalResult | null {
  const vote = resolveMajorityVote<ConflictCategory, DiagnosticPerspective>(
    perspectives,
  );

  // Estimate token cost: ~3500 tokens per diagnostic prompt (3 agents)
  const estimatedTokenCost = 10500;

  const parsed = verificationTribunalResultSchema.safeParse({
    phase,
    conflict_signal: conflict,
    perspectives,
    consensus_category: vote.consensus_category,
    consensus_confidence: vote.consensus_confidence,
    dissenting_perspective: vote.dissenter,
    recommended_remediation: REMEDIATION_MAP[vote.consensus_category],
    estimated_token_cost: estimatedTokenCost,
    timestamp: new Date().toISOString(),
  });

  if (!parsed.success) {
    console.error(
      `[verification-tribunal] Failed to parse tribunal result: ${parsed.error.message}`,
    );
    return null;
  }

  return parsed.data;
}
