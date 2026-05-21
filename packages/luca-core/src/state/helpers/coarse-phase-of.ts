import { PIPELINE_STEP_TO_COARSE_PHASE } from '../configs/coarse-phase-map.ts'
import type { CoarsePhase, PipelineStep } from '../schemas.ts'

/**
 * Map a fine-grained pipelineStep to its coarse workflow phase.
 *
 * Used by the stage-gate hook to decide whether the current pipeline step
 * permits a tool call (e.g. code edits only allowed in EXECUTING, git
 * commit only in FINALIZING). The mapping is exhaustive — every
 * PipelineStep value has a single CoarsePhase home.
 *
 * @param step - The current pipelineStep from .luca/state.json
 * @returns The coarse phase that step belongs to
 */
export function coarsePhaseOf(step: PipelineStep): CoarsePhase {
    return PIPELINE_STEP_TO_COARSE_PHASE[step]
}
