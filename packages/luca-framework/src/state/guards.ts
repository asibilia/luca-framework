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
import type { ComplexityLevel } from "./utils/complexity-utils";
import { shouldStartIteration, budgetStateSchema } from "./utils/budget-utils";
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

// ─── Guard Implementations ───────────────────────────────────────────────────

/**
 * All workflow guard functions.
 *
 * Each guard is a pure function that receives `{ context }` (and
 * optionally `params`) and returns a boolean. No side effects.
 */
export const workflowGuards = {
  // --- Complexity gating guards ---

  /**
   * Research step should run.
   *
   * Always-on — returns true unless explicitly disabled via
   * `workflow_config.research === false`.
   */
  shouldRunResearch: ({
    context,
  }: {
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
    return context.workflow_config.research !== false;
  },

  /**
   * Discussion step should run.
   *
   * Always-on — returns true unless explicitly disabled via
   * `workflow_config.discussion === false`.
   */
  shouldRunDiscussion: ({
    context,
  }: {
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
    return context.workflow_config.discussion !== false;
  },

  /**
   * UAT step should run.
   *
   * Always-on — returns true unless explicitly disabled via
   * `workflow_config.uat_required === false`.
   */
  shouldRunUAT: ({
    context,
  }: {
    context: WorkflowContext;
    event?: WorkflowEvent;
  }) => {
    return context.workflow_config.uat_required !== false;
  },

  /**
   * Learning capture should run.
   *
   * Always-on — every complexity level now runs learning capture.
   */
  shouldCaptureLearnings: () => {
    return true;
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
   * Learning step runs at standard depth or higher for the current complexity.
   *
   * Returns the learning capture mode ("brief" | "standard" | "full" | "full+debrief").
   * Guard returns true when depth is at least "standard" (MODERATE+).
   * For lightweight learning (TRIVIAL/SIMPLE, depth="brief"), use shouldCaptureLearnings.
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

  /** Lu orchestrator has more phases to execute */
  hasMorePhases: ({ context }: { context: WorkflowContext }) => {
    const maxPhases = get(
      context.lu_config,
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

  // --- Appetite / v4 guards ---

  /**
   * Check if the appetite context budget has not been exceeded.
   *
   * Compares `appetite_context_percent` (the budget ceiling) against
   * `process_data.context_percent_used` (actual usage). Returns true
   * if no process data exists yet (first wave — nothing to compare).
   */
  appetiteWithinBudget: ({ context }: { context: WorkflowContext }) => {
    if (!context.process_data) return true;
    return (
      context.process_data.context_percent_used <=
      context.appetite_context_percent
    );
  },

  /**
   * Check if the pre-mortem gate is enabled.
   *
   * Reads `context.gates.premortem` to determine whether the pre-mortem
   * agent should be invoked during the `discussing` state. Returns false
   * if the gate is absent or false.
   */
  shouldRunPremortem: ({ context }: { context: WorkflowContext }) => {
    return context.gates.premortem === true;
  },

  /**
   * Check if the process data collection gate is enabled.
   *
   * Reads `context.gates.process_data` to determine whether the process
   * data agent should be invoked during the `learning` state. Returns
   * false if the gate is absent or false.
   */
  shouldRunProcessData: ({ context }: { context: WorkflowContext }) => {
    return context.gates.process_data === true;
  },
};

/** All guard names for documentation and testing */
export const guardNames = Object.keys(
  workflowGuards,
) as (keyof typeof workflowGuards)[];
