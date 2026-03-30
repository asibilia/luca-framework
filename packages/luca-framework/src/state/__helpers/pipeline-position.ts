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
 */
export type PipelinePosition =
  | "idle"
  | "routed"
  | "configured"
  | "scanned"
  | "executing"
  | "complete"
  | "paused"
  | "failed";

/**
 * Compute the lu orchestrator pipeline position from the XState machine state.
 *
 * This is a pure derivation — no stored field needed. The XState `value`
 * is the single source of truth; the pipeline position is a coarser view.
 *
 * Uses a switch so that adding a new XState state without updating this
 * function is caught by manual review (the default case returns "idle").
 *
 * @param xstateValue - The XState machine's current state name
 * @returns The pipeline position
 *
 * @example
 * ```typescript
 * import { computePipelinePosition } from "./__helpers/pipeline-position";
 *
 * const pos = computePipelinePosition("executing");
 * // pos === "executing"
 *
 * const pos2 = computePipelinePosition("cooldown");
 * // pos2 === "complete"
 * ```
 */
export const computePipelinePosition = (
  xstateValue: string,
): PipelinePosition => {
  switch (xstateValue) {
    case "idle":
    case "preflight":
      return "idle";
    case "routing":
      return "routed";
    case "discussing":
      return "configured";
    case "planning":
      return "scanned";
    case "executing":
    case "verifying":
    case "learning":
    case "committing":
      return "executing";
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
