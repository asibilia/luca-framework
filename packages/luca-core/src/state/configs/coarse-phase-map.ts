import type { CoarsePhase, PipelineStep } from '../schemas.ts'

// Single source of truth for the pipelineStep → coarse-phase mapping.
// Every value in PipelineStepValues MUST appear here. Adding a new
// PipelineStep without updating this table is a compile error
// (Record<PipelineStep, ...> is exhaustive).
export const PIPELINE_STEP_TO_COARSE_PHASE: Record<PipelineStep, CoarsePhase> =
    {
        idle: 'IDLE',

        triage: 'PLANNING',
        research: 'PLANNING',
        discuss: 'PLANNING',
        architect: 'PLANNING',
        plan: 'PLANNING',
        'plan-review': 'PLANNING',

        execute: 'EXECUTING',
        checks: 'EXECUTING',

        verify: 'REVIEWING',
        review: 'REVIEWING',
        learn: 'REVIEWING',

        milestone: 'FINALIZING',
        complete: 'FINALIZING',
    }
