/**
 * Oversight Gate evaluator for the /lu orchestrator.
 *
 * Implements the 8x4 oversight gate matrix from Section 6 of the
 * v9.0.0 workflow spec (06-final-workflow.md). Returns the action
 * the orchestrator should take at each decision point based on the
 * current oversight mode and token profile.
 *
 * The function is pure: no side effects, no I/O, no state mutation.
 * The CLI entry point at the bottom provides a shell-friendly interface.
 *
 * @module luca-state/__helpers/oversight-gate
 */
import type {
  DecisionPoint,
  GateAction,
  OversightGateResult,
  OversightMode,
  TokenProfile,
} from "../__schemas/oversight-gate.schemas";
import { oversightGateInputSchema } from "../__schemas/oversight-gate.schemas";

// ─── Base Gate Matrix (8 decision points x 4 oversight modes) ───────────────

/**
 * The 8x4 oversight gate matrix.
 *
 * Rows = decision points, columns = oversight modes.
 * Values = the gate action to take.
 *
 * This is the canonical encoding of the spec's Section 6 table.
 */
export const OVERSIGHT_GATE_MATRIX: Record<
  DecisionPoint,
  Record<OversightMode, GateAction>
> = {
  milestone_creation: {
    "full-auto": "auto_create",
    flagged: "auto_create",
    milestone: "pause",
    phase: "pause",
  },
  wsjf_roadmap_revision: {
    "full-auto": "auto_approve",
    flagged: "auto_approve",
    milestone: "pause",
    phase: "pause",
  },
  before_each_phase: {
    "full-auto": "continue",
    flagged: "continue",
    milestone: "continue",
    phase: "pause",
  },
  phase_gaps: {
    "full-auto": "park_continue",
    flagged: "pause",
    milestone: "park_continue",
    phase: "pause",
  },
  critical_review_findings: {
    "full-auto": "pause",
    flagged: "pause",
    milestone: "pause",
    phase: "pause",
  },
  drift_detected: {
    "full-auto": "auto_apply",
    flagged: "pause",
    milestone: "auto_apply",
    phase: "pause",
  },
  milestone_boundary: {
    "full-auto": "auto_complete",
    flagged: "pause",
    milestone: "pause",
    phase: "pause",
  },
  cross_milestone: {
    "full-auto": "auto_continue",
    flagged: "auto_continue",
    milestone: "pause",
    phase: "pause",
  },
} as const;

// ─── Profile Modifier Rules ────────────────────────────────────────────────

/**
 * Token profile modifiers that override the base matrix.
 *
 * From the spec Section 6 "Token profile modifications to the matrix":
 * - CRITICAL review findings: ALWAYS pause regardless of profile/mode (safety gate)
 * - Drift detected + budget profile: ALWAYS auto_apply regardless of oversight mode
 * - Drift detected + quality profile: ALWAYS pause regardless of oversight mode
 * - All other combinations: no change (use base matrix)
 *
 * Returns null if no profile override applies.
 */
function getProfileOverride(
  decisionPoint: DecisionPoint,
  profile: TokenProfile,
): GateAction | null {
  // CRITICAL review findings ALWAYS pause (safety gate, immutable)
  if (decisionPoint === "critical_review_findings") {
    return "pause";
  }

  // Drift detection profile overrides
  if (decisionPoint === "drift_detected") {
    if (profile === "budget") {
      return "auto_apply";
    }
    if (profile === "quality") {
      return "pause";
    }
    // balanced: use base matrix (no override)
    return null;
  }

  // No override for other decision points
  return null;
}

// ─── Gate Evaluator ─────────────────────────────────────────────────────────

/**
 * Evaluate the oversight gate at a specific decision point.
 *
 * Pure function implementing the full oversight gate matrix from the
 * v9.0.0 spec Section 6. Returns the action the orchestrator should
 * take, along with a human-readable reason and override flag.
 *
 * Priority: profile override > base matrix action.
 *
 * @param decisionPoint - Which pipeline decision point is being evaluated
 * @param oversightMode - Current oversight mode from state.json
 * @param tokenProfile - Current token profile (budget/balanced/quality)
 * @returns The gate evaluation result with action, reason, and override flag
 *
 * @example
 * ```typescript
 * const result = evaluateOversightGate("before_each_phase", "full-auto", "balanced");
 * // { action: "continue", reason: "...", profile_override: false }
 *
 * const critical = evaluateOversightGate("critical_review_findings", "full-auto", "budget");
 * // { action: "pause", reason: "...", profile_override: false }
 * // (CRITICAL always pauses -- this is the base matrix value, not an override)
 * ```
 */
export function evaluateOversightGate(
  decisionPoint: DecisionPoint,
  oversightMode: OversightMode,
  tokenProfile: TokenProfile = "balanced",
): OversightGateResult {
  // Check for profile override first
  const profileOverride = getProfileOverride(decisionPoint, tokenProfile);

  if (profileOverride !== null) {
    // Get the base matrix value for comparison
    const baseAction = OVERSIGHT_GATE_MATRIX[decisionPoint][oversightMode];
    const wasOverridden = profileOverride !== baseAction;

    return {
      action: profileOverride,
      reason: wasOverridden
        ? `Profile '${tokenProfile}' overrides base action '${baseAction}' to '${profileOverride}' at '${decisionPoint}'`
        : `Gate '${decisionPoint}' returns '${profileOverride}' for oversight='${oversightMode}' (profile '${tokenProfile}' matches base)`,
      profile_override: wasOverridden,
    };
  }

  // No profile override: use base matrix
  const action = OVERSIGHT_GATE_MATRIX[decisionPoint][oversightMode];
  return {
    action,
    reason: `Gate '${decisionPoint}' returns '${action}' for oversight='${oversightMode}', profile='${tokenProfile}'`,
    profile_override: false,
  };
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

/**
 * CLI entry point for the oversight gate evaluator.
 *
 * Called by the orchestrator via:
 * ```bash
 * bun src/state/__helpers/oversight-gate.ts \
 *   --decision="before_each_phase" \
 *   --oversight="full-auto" \
 *   --profile="balanced"
 * ```
 *
 * Outputs JSON to stdout. Exits with code 0 on success, 1 on error.
 * On error, outputs "pause" as the fail-closed default.
 */
async function main(): Promise<void> {
  try {
    const args: Record<string, string> = {};
    for (const arg of process.argv.slice(2)) {
      const match = arg.match(/^--(\w+)=(.+)$/);
      if (match && match[1] && match[2]) {
        args[match[1]] = match[2];
      }
    }

    const parseResult = oversightGateInputSchema.safeParse(args);
    if (!parseResult.success) {
      // Fail-closed: output pause action
      console.log(
        JSON.stringify({
          action: "pause",
          reason: `Invalid input: ${parseResult.error.message}`,
          profile_override: false,
        }),
      );
      process.exit(1);
    }

    const { decision, oversight, profile } = parseResult.data;
    const result = evaluateOversightGate(decision, oversight, profile);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    // Fail-closed: output pause action
    console.log(
      JSON.stringify({
        action: "pause",
        reason: `Gate evaluation error: ${error instanceof Error ? error.message : String(error)}`,
        profile_override: false,
      }),
    );
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
const isDirectExecution =
  typeof Bun !== "undefined" && Bun.main === import.meta.path;
if (isDirectExecution) {
  main();
}
