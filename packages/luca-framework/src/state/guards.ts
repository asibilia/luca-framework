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
import { meetsThreshold } from "./utils/complexity-utils";
import type { ComplexityLevel, StepActivation } from "./utils/complexity-utils";
import { shouldStartIteration } from "./utils/budget-utils";
import { budgetStateSchema } from "./utils/budget-utils";
import get from "lodash/get";

import type { WorkflowContext, WorkflowEvent } from "./types";

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
  context: Pick<WorkflowContext, "complexity" | "complexity_matrix">,
  field: string,
  event?: WorkflowEvent,
): unknown {
  const level =
    (event && "complexity" in event
      ? (event as { complexity: string }).complexity
      : undefined) ?? context.complexity;
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
  shouldRunResearch: ({
    context,
    event,
  }: {
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
    const activation = getGateField(context, "research", event) as
      | StepActivation
      | undefined;
    return activation === "required" || activation === "run";
  },

  /** Discussion step should run (not skipped for this complexity) */
  shouldRunDiscussion: ({
    context,
    event,
  }: {
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
    const activation = getGateField(context, "discussion", event) as
      | StepActivation
      | undefined;
    return shouldActivate(activation);
  },

  /** UAT step should run */
  shouldRunUAT: ({
    context,
    event,
  }: {
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
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
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
    const capture = getGateField(context, "learningCapture", event) as
      | string
      | undefined;
    return capture !== "skip" && capture !== undefined;
  },

  /**
   * Code review should run for this complexity level.
   *
   * Based on the complexity matrix, code review agents are spawned
   * for MODERATE+ complexity. The matrix stores this as the
   * `codeReviewAgents` array — non-empty means review should run.
   * Also respects `workflow_config.code_review` override.
   */
  shouldRunCodeReview: ({
    context,
    event,
  }: {
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
    // Config override takes precedence
    if (context.workflow_config.code_review === false) return false;
    const agents = getGateField(context, "codeReviewAgents", event) as
      | string[]
      | undefined;
    return Array.isArray(agents) && agents.length > 0;
  },

  /**
   * Learning step has a specific depth level for the current complexity.
   *
   * Returns the learning capture mode ("skip" | "brief" | "standard" | "full" | "full+debrief").
   * Guard returns true when depth is at least "standard" (MODERATE+).
   * For the full gating (brief vs standard), use shouldCaptureLearnings.
   */
  shouldRunLearning: ({
    context,
    event,
  }: {
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
    const capture = getGateField(context, "learningCapture", event) as
      | string
      | undefined;
    return (
      capture === "standard" || capture === "full" || capture === "full+debrief"
    );
  },

  // --- Gate config guards ---

  /** A named gate is enabled in config.json gates section */
  gateEnabled: (
    { context }: { context: WorkflowContext },
    params: { gate: string },
  ) => {
    return context.gates[params.gate] === true;
  },

  /** A named gate is disabled or absent in config.json gates section */
  gateDisabled: (
    { context }: { context: WorkflowContext },
    params: { gate: string },
  ) => {
    return context.gates[params.gate] !== true;
  },

  // --- Oversight guards ---

  /** Current oversight level requires human approval for this transition */
  needsHumanApproval: ({ context }: { context: WorkflowContext }) => {
    return context.oversight === "plan" || context.oversight === "phase";
  },

  /** Running in full-auto mode (no human gates) */
  isFullAuto: ({ context }: { context: WorkflowContext }) => {
    return context.oversight === "full-auto";
  },

  // --- Budget / iteration guards ---

  /** Iteration budget allows another attempt */
  withinBudget: ({ context }: { context: WorkflowContext }) => {
    if (!context.iteration_budget) return true;
    const parsed = budgetStateSchema.safeParse(context.iteration_budget);
    if (!parsed.success) return false;
    return shouldStartIteration(parsed.data).allowed;
  },

  /** Verification can be retried (attempts < max) */
  canRetryVerification: ({ context }: { context: WorkflowContext }) => {
    return context.verification_attempts < context.max_verification_attempts;
  },

  // --- Complexity threshold guards ---

  /** Current complexity meets or exceeds a minimum threshold */
  meetsComplexityThreshold: (
    { context }: { context: WorkflowContext },
    params: { min: ComplexityLevel },
  ) => {
    return meetsThreshold(context.complexity as ComplexityLevel, params.min);
  },

  // --- Workflow config guards ---

  /** A workflow config boolean is enabled */
  workflowConfigEnabled: (
    { context }: { context: WorkflowContext },
    params: { key: string },
  ) => {
    return get(context.workflow_config, params.key) === true;
  },

  /** Autopilot has more phases to execute */
  hasMorePhases: ({ context }: { context: WorkflowContext }) => {
    const maxPhases = get(
      context.autopilot_config,
      "max_phases_per_session",
      1,
    ) as number;
    return context.phase_results.length < maxPhases;
  },

  // --- State guards ---

  /** Machine has a current phase set */
  hasCurrentPhase: ({ context }: { context: WorkflowContext }) => {
    return (
      context.current_phase !== undefined && context.current_phase !== null
    );
  },

  /** Last phase completed successfully */
  lastPhaseSucceeded: ({ context }: { context: WorkflowContext }) => {
    if (!context.phase_results || context.phase_results.length === 0)
      return false;
    const last = context.phase_results[context.phase_results.length - 1];
    return last !== undefined && last.status === "passed";
  },
};

/** All guard names for documentation and testing */
export const guardNames = Object.keys(
  workflowGuards,
) as (keyof typeof workflowGuards)[];
