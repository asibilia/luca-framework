import type { PipelineStep } from '@alecsibilia/luca-core'

// All pipelineStep values — convenient for tools that allow every phase.
export const ALL_PIPELINE_STEPS: PipelineStep[] = [
    'idle',
    'triage',
    'research',
    'discuss',
    'architect',
    'plan',
    'plan-review',
    'execute',
    'checks',
    'verify',
    'review',
    'learn',
    'milestone',
    'complete',
]
