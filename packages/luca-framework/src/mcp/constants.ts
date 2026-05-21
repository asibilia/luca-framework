import { PipelineStepValues, type PipelineStep } from '@alecsibilia/luca-core'

// All pipelineStep values — convenient for tools that allow every phase.
// Derived from luca-core's canonical PipelineStepValues so the two can
// never drift if a step is added or renamed.
export const ALL_PIPELINE_STEPS: PipelineStep[] = [...PipelineStepValues]
