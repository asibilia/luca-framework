/**
 * step → coarse phase, as a LITERAL table.
 *
 * Every `PipelineStep` has exactly one `CoarsePhase` home. The stage-gate hook
 * uses the coarse phase to decide whether the current pipeline step permits a
 * tool call (code edits only in EXECUTING, git commit only in FINALIZING, …).
 *
 * HISTORY: this mapping used to be DERIVED at module load from the generated
 * pipeline machine's `meta.coarsePhase` (via `resolveState().getMeta()`). That
 * machine is gone — deriving a 13-entry constant cost a state-machine-library
 * import on every cold-start hook process. The table is now written out
 * literally, and `helpers/coarse-phase-of.test.ts` pins all 13 entries
 * independently.
 *
 * `satisfies Record<PipelineStep, CoarsePhase>` is load-bearing: adding a
 * `PipelineStep` without giving it a coarse phase is a COMPILE ERROR.
 */
import type { CoarsePhase, PipelineStep } from '../schemas.ts'

export const STEP_TO_COARSE_PHASE = {
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

    finalize: 'FINALIZING',
} satisfies Record<PipelineStep, CoarsePhase>
