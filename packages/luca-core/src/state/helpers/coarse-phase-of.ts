import { STEP_TO_COARSE_PHASE } from '../configs/coarse-phases.ts'
import type { CoarsePhase, PipelineStep } from '../schemas.ts'

/**
 * Map a fine-grained pipelineStep to its coarse workflow phase.
 *
 * Used by the stage-gate hook to decide whether the current pipeline step
 * permits a tool call (e.g. code edits only allowed in EXECUTING, git
 * commit only in FINALIZING). The mapping is exhaustive — every
 * PipelineStep value has a single CoarsePhase home.
 *
 * The mapping is the LITERAL table in `configs/coarse-phases.ts`. (It was
 * briefly derived from the generated pipeline machine's `meta.coarsePhase`;
 * that machine is gone, and deriving a 13-entry constant is not worth a
 * state-machine-library import on every cold-start hook process.)
 *
 * @param step - The current pipelineStep from .luca/state.json
 * @returns The coarse phase that step belongs to
 */
export function coarsePhaseOf(step: PipelineStep): CoarsePhase {
    return STEP_TO_COARSE_PHASE[step]
}
