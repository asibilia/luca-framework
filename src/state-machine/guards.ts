/**
 * Guard functions for the Luca workflow state machine.
 *
 * Guards are pure functions that receive context (and optional params)
 * and return a boolean. They encode the complexity gating matrix,
 * gate config booleans, oversight levels, budget checks, and
 * workflow config conditions.
 *
 * Guards are spread into the XState `setup()` call so they can
 * be referenced by name in transitions.
 */
import { meetsThreshold } from "../complexity";
import type { ComplexityLevel, StepActivation } from "../complexity/types";
import { shouldStartIteration } from "../iteration/budget";
import { budgetStateSchema } from "../iteration/types";
import get from "lodash/get";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Look up a gating field from the complexity matrix for the current level.
 *
 * When an event carries a complexity value (e.g., ROUTE_COMPLETE), that
 * takes precedence over context.complexity because guards run before
 * actions update context.
 *
 * @param context - The workflow context containing complexity and complexity_matrix
 * @param field - The ComplexityGate field name to look up
 * @param event - Optional event that may carry a complexity override
 * @returns The field value, or undefined if not found
 */
function getGateField(
  context: { complexity: string; complexity_matrix: Record<string, any> },
  field: string,
  event?: { complexity?: string },
): any {
  const level = event?.complexity ?? context.complexity;
  return get(context.complexity_matrix, `${level}.${field}`);
}

/**
 * Check if a step activation value means the step should run.
 *
 * Returns true for any activation that is not "skip".
 */
function shouldActivate(activation: StepActivation | undefined): boolean {
  if (!activation) return false;
  return activation !== "skip";
}

// ─── Guard Implementations ───────────────────────────────────────────────────

/**
 * All workflow guard functions.
 *
 * Each guard is a pure function that receives `{ context }` (and
 * optionally `params`) and returns a boolean. No side effects.
 */
export const workflowGuards = {
  // --- Complexity gating guards ---

  /** Research step should run (required or run for this complexity) */
  shouldRunResearch: ({ context, event }: { context: any; event?: any }) => {
    const activation = getGateField(context, "research", event) as
      | StepActivation
      | undefined;
    return activation === "required" || activation === "run";
  },

  /** Discussion step should run (not skipped for this complexity) */
  shouldRunDiscussion: ({ context, event }: { context: any; event?: any }) => {
    const activation = getGateField(context, "discussion", event) as
      | StepActivation
      | undefined;
    return shouldActivate(activation);
  },

  /** UAT step should run */
  shouldRunUAT: ({ context, event }: { context: any; event?: any }) => {
    const activation = getGateField(context, "uat", event) as
      | StepActivation
      | undefined;
    return activation === "required" || activation === "required+thorough";
  },

  /** Learning capture should run (not skipped) */
  shouldCaptureLearnings: ({
    context,
    event,
  }: {
    context: any;
    event?: any;
  }) => {
    const capture = getGateField(context, "learningCapture", event) as
      | string
      | undefined;
    return capture !== "skip" && capture !== undefined;
  },

  // --- Gate config guards ---

  /** A named gate is enabled in config.json gates section */
  gateEnabled: ({ context }: { context: any }, params: { gate: string }) => {
    return context.gates[params.gate] === true;
  },

  /** A named gate is disabled or absent in config.json gates section */
  gateDisabled: ({ context }: { context: any }, params: { gate: string }) => {
    return context.gates[params.gate] !== true;
  },

  // --- Oversight guards ---

  /** Current oversight level requires human approval for this transition */
  needsHumanApproval: ({ context }: { context: any }) => {
    return context.oversight === "plan" || context.oversight === "phase";
  },

  /** Running in full-auto mode (no human gates) */
  isFullAuto: ({ context }: { context: any }) => {
    return context.oversight === "full-auto";
  },

  // --- Budget / iteration guards ---

  /** Iteration budget allows another attempt */
  withinBudget: ({ context }: { context: any }) => {
    if (!context.iteration_budget) return true;
    const parsed = budgetStateSchema.safeParse(context.iteration_budget);
    if (!parsed.success) return false;
    return shouldStartIteration(parsed.data).allowed;
  },

  /** Verification can be retried (attempts < max) */
  canRetryVerification: ({ context }: { context: any }) => {
    return context.verification_attempts < context.max_verification_attempts;
  },

  // --- Complexity threshold guards ---

  /** Current complexity meets or exceeds a minimum threshold */
  meetsComplexityThreshold: (
    { context }: { context: any },
    params: { min: ComplexityLevel },
  ) => {
    return meetsThreshold(context.complexity as ComplexityLevel, params.min);
  },

  // --- Workflow config guards ---

  /** A workflow config boolean is enabled */
  workflowConfigEnabled: (
    { context }: { context: any },
    params: { key: string },
  ) => {
    return get(context.workflow_config, params.key) === true;
  },

  /** Autopilot has more phases to execute */
  hasMorePhases: ({ context }: { context: any }) => {
    const maxPhases = get(
      context.autopilot_config,
      "max_phases_per_session",
      1,
    ) as number;
    return context.phase_results.length < maxPhases;
  },

  // --- State guards ---

  /** Machine has a current phase set */
  hasCurrentPhase: ({ context }: { context: any }) => {
    return (
      context.current_phase !== undefined && context.current_phase !== null
    );
  },

  /** Last phase completed successfully */
  lastPhaseSucceeded: ({ context }: { context: any }) => {
    if (!context.phase_results || context.phase_results.length === 0)
      return false;
    const last = context.phase_results[context.phase_results.length - 1];
    return last.status === "passed";
  },
};

/** All guard names for documentation and testing */
export const guardNames = Object.keys(
  workflowGuards,
) as (keyof typeof workflowGuards)[];
