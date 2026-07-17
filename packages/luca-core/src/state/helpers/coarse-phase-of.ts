import { STEP_TO_COARSE_PHASE } from '../machine/pipeline-machine.ts'
import type { CoarsePhase, PipelineStep } from '../schemas.ts'

/**
 * Map a fine-grained pipelineStep to its coarse workflow phase.
 *
 * Used by the stage-gate hook to decide whether the current pipeline step
 * permits a tool call (e.g. code edits only allowed in EXECUTING, git
 * commit only in FINALIZING). The mapping is exhaustive — every
 * PipelineStep value has a single CoarsePhase home.
 *
 * The mapping is DERIVED from the pipeline machine's `meta.coarsePhase`
 * (see `STEP_TO_COARSE_PHASE` in `pipeline-machine.ts`) — the machine is the
 * single source of truth; there is no hand-maintained step→phase table.
 *
 * @param step - The current pipelineStep from .luca/state.json
 * @returns The coarse phase that step belongs to
 */
export function coarsePhaseOf(step: PipelineStep): CoarsePhase {
    return STEP_TO_COARSE_PHASE[step]
}
