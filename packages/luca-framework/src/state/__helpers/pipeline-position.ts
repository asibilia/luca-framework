/**
 * Pipeline position derivation from XState machine state.
 *
 * Provides a coarse workflow view used by enforcement hooks,
 * crash recovery, and the session-end audit. This is a pure
 * derivation — no stored field needed.
 *
 * @module luca-state/pipeline-position
 */

/**
 * Pipeline position type — the coarse workflow view used by enforcement hooks,
 * crash recovery, and the session-end audit.
 *
 * The compound `executing.*` sub-positions map to XState compound sub-states
 * within the `executing` state. `computePipelinePosition()` returns them when
 * a `fullStatePath` argument is provided (used by the enforcement hook factory).
 * Callers that pass only the top-level state receive `"executing"` as before.
 */
export type PipelinePosition =
  | "idle"
  | "preflight"
  | "routed"
  | "configured"
  | "scanned"
  | "executing"
  | "executing.discussing"
  | "executing.planning"
  | "executing.running"
  | "executing.harnessing"
  | "executing.verifying"
  | "executing.reviewing"
  | "executing.learning"
  | "executing.committing"
  | "complete"
  | "paused"
  | "failed";

/**
 * Valid compound executing sub-positions.
 *
 * Used to validate the `fullStatePath` argument before returning a
 * compound position. Prevents unknown sub-state names from leaking
 * into the enforcement layer.
 */
const EXECUTING_SUB_POSITIONS = new Set<PipelinePosition>([
  "executing.discussing",
  "executing.planning",
  "executing.running",
  "executing.harnessing",
  "executing.verifying",
  "executing.reviewing",
  "executing.learning",
  "executing.committing",
]);

/**
 * Compute the lu orchestrator pipeline position from the XState machine state.
 *
 * This is a pure derivation — no stored field needed. The XState `value`
 * is the single source of truth; the pipeline position is a coarser view.
 *
 * Uses a switch so that adding a new XState state without updating this
 * function is caught by manual review (the default case returns "idle").
 *
 * **Compound state support (Phase 2 forward-compat):**
 * When `fullStatePath` is provided and the top-level state is `"executing"`,
 * the function returns the finer-grained compound position
 * (e.g., `"executing.reviewing"`) if the path matches a known sub-position.
 * Falls back to `"executing"` for unknown sub-positions.
 *
 * Callers that do NOT need finer-grained positions (e.g.,
 * `orchestrator-gate-config.ts`) should omit the second argument — they
 * will always receive `"executing"` for executing-family states, preserving
 * backward compatibility.
 *
 * @param xstateValue - The XState machine's current top-level state name
 * @param fullStatePath - Optional full dot-path (e.g., `"executing.reviewing"`).
 *   Provided by the enforcement hook factory when `use_computed_position` is true.
 * @returns The pipeline position
 *
 * @example
 * ```typescript
 * import { computePipelinePosition } from "./__helpers/pipeline-position";
 *
 * // Phase 1 — flat state, no fullStatePath
 * const pos = computePipelinePosition("executing");
 * // pos === "executing"
 *
 * const pos2 = computePipelinePosition("cooldown");
 * // pos2 === "complete"
 *
 * // Phase 2 — compound state path passed by enforcement hook factory
 * const pos3 = computePipelinePosition("executing", "executing.reviewing");
 * // pos3 === "executing.reviewing"
 * ```
 */
export const computePipelinePosition = (
  xstateValue: string,
  fullStatePath?: string,
): PipelinePosition => {
  switch (xstateValue) {
    case "idle":
      return "idle";
    case "preflight":
      return "preflight";
    case "routing":
      return "routed";
    case "discussing":
      return "configured";
    case "planning":
      return "scanned";
    case "executing":
    case "verifying":
    case "learning":
    case "committing": {
      // When a full compound path is supplied and it maps to a known
      // executing sub-position, return the finer-grained value.
      if (
        fullStatePath !== undefined &&
        fullStatePath !== xstateValue &&
        EXECUTING_SUB_POSITIONS.has(fullStatePath as PipelinePosition)
      ) {
        return fullStatePath as PipelinePosition;
      }
      return "executing";
    }
    case "complete":
    case "cooldown":
      return "complete";
    case "paused":
    case "suspended":
      return "paused";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
};
