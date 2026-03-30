/**
 * Shared orchestrator gate configuration for the pre-edit workflow gate
 * and session-start stale context cleanup.
 *
 * Single source of truth for context file paths, terminal states, and
 * edit-permitting states across all 5 orchestrators. Both the pre-edit
 * gate hook and the session-start stale cleanup import from here to
 * prevent terminal state drift between the two consumers.
 *
 * @module orchestrator-gate-config
 * @see src/hooks/scripts/pre-edit-workflow-gate.ts
 * @see src/hooks/scripts/session-start.ts
 */

import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * Per-orchestrator gate configuration.
 *
 * @param name - Human-readable orchestrator name for block messages
 * @param contextPath - Absolute path to the orchestrator's context JSON file
 * @param editPermittingStates - States where source file edits are legitimate.
 *   Empty array means the workflow never permits edits (read-only workflows).
 * @param requiredPredecessor - State that must appear in completed_states
 *   before edits are allowed. Null for workflows with no edit-permitting states.
 * @param terminalStates - States where the workflow is done (edits always allowed)
 * @param useComputedPosition - When true, derive pipeline position from XState
 *   `value` field via `computePipelinePosition()` instead of reading `current_state`
 *   directly. Used by the lu gate which reads from `.planning/state.json`.
 */
export const OrchestratorGateConfigSchema = z.object({
  name: z.string(),
  contextPath: z.string(),
  editPermittingStates: z.array(z.string()),
  requiredPredecessor: z.string().nullable(),
  terminalStates: z.array(z.string()),
  useComputedPosition: z.boolean().optional(),
});

export type OrchestratorGateConfig = z.infer<
  typeof OrchestratorGateConfigSchema
>;

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Gate configuration for all 5 orchestrators.
 *
 * Used by:
 * - pre-edit-workflow-gate.ts: checks editPermittingStates + requiredPredecessor
 * - session-start.ts: uses terminalStates to detect stale contexts
 */
export const ORCHESTRATOR_GATES: readonly OrchestratorGateConfig[] = [
  {
    name: "lu",
    contextPath: ".planning/state.json",
    editPermittingStates: ["executing"],
    requiredPredecessor: "configured",
    terminalStates: ["idle", "complete", "failed"],
    useComputedPosition: true,
  },
  {
    name: "phase-execute",
    contextPath: "/tmp/phase-execute-context.json",
    editPermittingStates: ["setup", "executed", "verified"],
    requiredPredecessor: "setup",
    terminalStates: ["idle", "committed", "failed"],
  },
  {
    name: "verify",
    contextPath: "/tmp/verify-context.json",
    editPermittingStates: [],
    requiredPredecessor: null,
    terminalStates: ["idle", "reviewed", "diagnosed", "failed"],
  },
  {
    name: "milestone-complete",
    contextPath: "/tmp/milestone-complete-context.json",
    editPermittingStates: [],
    requiredPredecessor: null,
    terminalStates: ["idle", "finalized", "failed"],
  },
  {
    name: "pr-address",
    contextPath: "/tmp/pr-address-context.json",
    editPermittingStates: ["fixed", "verified"],
    requiredPredecessor: "validated",
    terminalStates: ["idle", "pushed", "failed"],
  },
] as const;
