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

import { computePipelinePosition } from "../../../packages/luca-framework/src/state";

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * Per-orchestrator gate configuration.
 *
 * Uses snake_case for consistency with project conventions.
 *
 * @param name - Human-readable orchestrator name for block messages
 * @param context_path - Path to the orchestrator's context JSON file (absolute
 *   for /tmp contexts, relative for project-scoped contexts like .planning/state.json)
 * @param edit_permitting_states - States where source file edits are legitimate.
 *   Empty array means the workflow never permits edits (read-only workflows).
 * @param required_predecessor - State that must appear in completed_states
 *   before edits are allowed. Null for workflows with no edit-permitting states.
 * @param terminal_states - States where the workflow is done (edits always allowed)
 * @param use_computed_position - When true, derive pipeline position from XState
 *   `value` field via `computePipelinePosition()` instead of reading `current_state`
 *   directly. Used by the lu gate which reads from `.planning/state.json`.
 */
export const OrchestratorGateConfigSchema = z.object({
  name: z.string(),
  context_path: z.string(),
  edit_permitting_states: z.array(z.string()),
  required_predecessor: z.string().nullable(),
  terminal_states: z.array(z.string()),
  use_computed_position: z.boolean().optional(),
});

export type OrchestratorGateConfig = z.infer<
  typeof OrchestratorGateConfigSchema
>;

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Gate configuration for all 5 orchestrators.
 *
 * Used by:
 * - pre-edit-workflow-gate.ts: checks edit_permitting_states + required_predecessor
 * - session-start.ts: uses terminal_states to detect stale contexts
 */
export const ORCHESTRATOR_GATES: readonly OrchestratorGateConfig[] = [
  {
    name: "lu",
    context_path: ".planning/state.json",
    edit_permitting_states: ["executing"],
    required_predecessor: "configured",
    terminal_states: ["idle", "complete", "failed"],
    use_computed_position: true,
  },
  {
    name: "phase-execute",
    context_path: "/tmp/phase-execute-context.json",
    edit_permitting_states: ["setup", "executed", "verified"],
    required_predecessor: "setup",
    terminal_states: ["idle", "committed", "failed"],
  },
  {
    name: "verify",
    context_path: "/tmp/verify-context.json",
    edit_permitting_states: [],
    required_predecessor: null,
    terminal_states: ["idle", "reviewed", "diagnosed", "failed"],
  },
  {
    name: "milestone-complete",
    context_path: "/tmp/milestone-complete-context.json",
    edit_permitting_states: [],
    required_predecessor: null,
    terminal_states: ["idle", "finalized", "failed"],
  },
  {
    name: "pr-address",
    context_path: "/tmp/pr-address-context.json",
    edit_permitting_states: ["fixed", "verified"],
    required_predecessor: "validated",
    terminal_states: ["idle", "pushed", "failed"],
  },
] as const;

// ─── Pipeline Position Derivation ────────────────────────────────────────────

/**
 * Canonical pipeline position order for synthesizing completed states.
 *
 * When the computed position is, e.g., "executing" (index 4), all prior
 * positions are considered completed — satisfying predecessor checks.
 */
export const PIPELINE_ORDER = [
  "idle",
  "preflight",
  "routed",
  "configured",
  "scanned",
  "executing",
  "complete",
] as const;

/**
 * Derive the pipeline position and synthesized completed states from raw
 * orchestrator context JSON.
 *
 * For gates with `use_computed_position: true` (the lu gate), reads the
 * XState `value` field and computes the pipeline position via
 * `computePipelinePosition()`. For all other gates, reads `current_state`
 * directly. In both cases, completed states are synthesized from the
 * pipeline order.
 *
 * @param raw - Parsed JSON context object
 * @param use_computed_position - Whether to derive state from XState `value`
 * @returns Object with `currentState` and `completedStates`, or null if no state is available
 *
 * @example
 * ```typescript
 * const raw = await Bun.file(gate.context_path).json();
 * const derived = derivePipelineState(raw, gate.use_computed_position ?? false);
 * if (derived) {
 *   console.log(derived.currentState);     // e.g., "executing"
 *   console.log(derived.completedStates);  // e.g., ["idle", "routed", "configured", "scanned", "executing"]
 * }
 * ```
 */
export function derivePipelineState(
  raw: Record<string, unknown>,
  use_computed_position: boolean,
): { currentState: string; completedStates: string[] } | null {
  let currentState: string | undefined;

  if (use_computed_position) {
    const xstateValue = String(raw.value ?? "idle");
    currentState = computePipelinePosition(xstateValue);
  } else {
    currentState =
      typeof raw.current_state === "string" ? raw.current_state : undefined;
  }

  if (!currentState) return null;

  const currentIdx = PIPELINE_ORDER.indexOf(
    currentState as (typeof PIPELINE_ORDER)[number],
  );
  const completedStates =
    currentIdx >= 0
      ? (PIPELINE_ORDER.slice(0, currentIdx + 1) as unknown as string[])
      : ((raw.completed_states as string[]) ?? []);

  return { currentState, completedStates };
}
