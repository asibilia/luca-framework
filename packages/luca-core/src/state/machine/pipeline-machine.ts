/**
 * Pipeline state machine (XState v5) — parity edition.
 *
 * PATH B: this machine is GENERATED from the canonical typed tables
 * (`PipelineStepValues`, `PIPELINE_TRANSITIONS`, `PIPELINE_STEP_TO_COARSE_PHASE`)
 * so it can never drift from the source-of-truth transition table. It exists
 * to reproduce EVERY allow/deny verdict of `checkPipelineGuard` /
 * `PIPELINE_TRANSITIONS`, proven by the golden parity harness in
 * `pipeline-machine.parity.test.ts`.
 *
 * PARITY-CRITICAL INVARIANTS (do not violate — they keep the machine's
 * verdicts identical to the legacy guard):
 *  - The ONLY guard on any edge is `toIs(step)` (requested-step matcher).
 *    NO forward gates (isPlanApproved etc.), NO budget guards. Every legal
 *    edge is unconditional beyond matching the requested step. Adding a
 *    verdict-reading guard would make the machine over-deny vs. legacy.
 *  - Unknown steps are handled ABOVE the machine (see `machine-verdict.ts`);
 *    a bogus value is never fed to `resolveState` (spike 3: it throws).
 *
 * STRUCTURE mirrors `PIPELINE_STEP_TO_COARSE_PHASE`:
 *  - `idle` is a top-level ATOMIC leaf (the IDLE coarse phase = one leaf).
 *  - 4 compound parents: planning / executing / reviewing / finalizing.
 *  - 13 leaves total (idle + 12 nested). Cross-branch targets use `#id`.
 *
 * The machine is READ-ONLY over the config tables — it imports them, never
 * edits them.
 */
import { setup } from 'xstate'
import type { StateValue } from 'xstate'

import { PIPELINE_STEP_TO_COARSE_PHASE } from '../configs/coarse-phase-map.ts'
import { PIPELINE_TRANSITIONS } from '../configs/pipeline-transitions.ts'
import { PipelineStepValues } from '../constants.ts'
import type {
    CoarsePhase,
    ComplexityLevel,
    OversightMode,
    PipelineStep,
} from '../schemas.ts'

/**
 * The `ADVANCE` event: request a transition to `to`. Mirrors the
 * `requestedStep` field of `PipelineGuardInput`.
 */
export interface AdvanceEvent {
    type: 'ADVANCE'
    to: PipelineStep
}

/**
 * Machine context. Surface-only in P1a — no guard reads it. `complexity`
 * and `oversight` mirror `PipelineGuardInput`'s advisory fields; the
 * iteration/budget fields are intentionally left OPEN (optional) so a
 * future P1c fix-budget (3 or 5 iterations) is not precluded by the shape.
 */
export interface PipelineContext {
    complexity?: ComplexityLevel
    oversight?: OversightMode
    checksFixIteration?: number
    verifyIteration?: number
    planReviewIteration?: number
    researchReviewIteration?: number
    reviewIteration?: number
    maxChecksFixIterations?: number
    maxVerifyIterations?: number
    maxPlanReviewIterations?: number
    maxResearchReviewIterations?: number
    maxReviewIterations?: number
}

/**
 * A single guarded `ADVANCE` transition. `target` is an `#id` reference so
 * cross-branch targets resolve regardless of which compound parent holds
 * the destination leaf. The guard is ALWAYS `toIs` — the requested-step
 * matcher and nothing else (parity invariant).
 */
interface AdvanceTransition {
    target: string
    guard: { type: 'toIs'; params: { step: PipelineStep } }
}

/**
 * Generate the guarded `ADVANCE` transition array for a source step,
 * straight from the canonical `PIPELINE_TRANSITIONS` table. Multi-target
 * leaves become first-match-wins guarded arrays; because each guard matches
 * a distinct `to` value the guards are mutually exclusive.
 */
function advanceFor(from: PipelineStep): AdvanceTransition[] {
    return PIPELINE_TRANSITIONS[from].map((to) => ({
        target: `#${to}`,
        guard: { type: 'toIs', params: { step: to } },
    }))
}

/**
 * Per-step transition table feeding the machine config. Explicitly keyed +
 * `satisfies Record<PipelineStep, ...>` so adding/removing a PipelineStep
 * without updating this table is a COMPILE ERROR (state-level exhaustiveness
 * — XState has no native equivalent). Content is generated from the source
 * table via `advanceFor`, so the EDGES can never drift from
 * `PIPELINE_TRANSITIONS`.
 */
const STEP_TRANSITIONS = {
    idle: advanceFor('idle'),
    triage: advanceFor('triage'),
    research: advanceFor('research'),
    discuss: advanceFor('discuss'),
    architect: advanceFor('architect'),
    plan: advanceFor('plan'),
    'plan-review': advanceFor('plan-review'),
    execute: advanceFor('execute'),
    checks: advanceFor('checks'),
    verify: advanceFor('verify'),
    review: advanceFor('review'),
    learn: advanceFor('learn'),
    finalize: advanceFor('finalize'),
} satisfies Record<PipelineStep, AdvanceTransition[]>

/**
 * The parity machine. `id: 'luca'`, `initial: 'idle'`. Each leaf carries an
 * `id` equal to its step name so `#step` targets resolve across branches.
 */
export const pipelineMachine = setup({
    types: {
        context: {} as PipelineContext,
        events: {} as AdvanceEvent,
    },
    guards: {
        // The ONLY guard type. Requested-step matcher — no verdict/budget
        // reads. Keeps the machine's allow/deny identical to legacy.
        toIs: ({ event }, params: { step: PipelineStep }) =>
            event.to === params.step,
    },
}).createMachine({
    id: 'luca',
    initial: 'idle',
    context: {},
    states: {
        // IDLE coarse phase — single atomic top-level leaf.
        idle: { id: 'idle', on: { ADVANCE: STEP_TRANSITIONS.idle } },

        // PLANNING coarse phase.
        planning: {
            initial: 'triage',
            states: {
                triage: {
                    id: 'triage',
                    on: { ADVANCE: STEP_TRANSITIONS.triage },
                },
                research: {
                    id: 'research',
                    on: { ADVANCE: STEP_TRANSITIONS.research },
                },
                discuss: {
                    id: 'discuss',
                    on: { ADVANCE: STEP_TRANSITIONS.discuss },
                },
                architect: {
                    id: 'architect',
                    on: { ADVANCE: STEP_TRANSITIONS.architect },
                },
                plan: {
                    id: 'plan',
                    on: { ADVANCE: STEP_TRANSITIONS.plan },
                },
                'plan-review': {
                    id: 'plan-review',
                    on: { ADVANCE: STEP_TRANSITIONS['plan-review'] },
                },
            },
        },

        // EXECUTING coarse phase.
        executing: {
            initial: 'execute',
            states: {
                execute: {
                    id: 'execute',
                    on: { ADVANCE: STEP_TRANSITIONS.execute },
                },
                checks: {
                    id: 'checks',
                    on: { ADVANCE: STEP_TRANSITIONS.checks },
                },
            },
        },

        // REVIEWING coarse phase.
        reviewing: {
            initial: 'verify',
            states: {
                verify: {
                    id: 'verify',
                    on: { ADVANCE: STEP_TRANSITIONS.verify },
                },
                review: {
                    id: 'review',
                    on: { ADVANCE: STEP_TRANSITIONS.review },
                },
                learn: {
                    id: 'learn',
                    on: { ADVANCE: STEP_TRANSITIONS.learn },
                },
            },
        },

        // FINALIZING coarse phase.
        finalizing: {
            initial: 'finalize',
            states: {
                finalize: {
                    id: 'finalize',
                    on: { ADVANCE: STEP_TRANSITIONS.finalize },
                },
            },
        },
    },
})

export type PipelineMachine = typeof pipelineMachine

// ---------------------------------------------------------------------------
// State-value mapping (PipelineStep <-> XState StateValue)
//
// Co-located with the machine structure it describes. Consumed by the
// verdict adapter (`machine-verdict.ts`) and the parity fixtures. IDLE is the
// atomic top-level leaf ('idle'); every other step is nested one level under
// its coarse-phase parent ({ planning: 'triage' }, etc.).
// ---------------------------------------------------------------------------

/** coarse phase -> compound parent key. IDLE is atomic (no parent). */
const COARSE_TO_PARENT: Record<Exclude<CoarsePhase, 'IDLE'>, string> = {
    PLANNING: 'planning',
    EXECUTING: 'executing',
    REVIEWING: 'reviewing',
    FINALIZING: 'finalizing',
}

function stateValueForStep(step: PipelineStep): StateValue {
    const coarse = PIPELINE_STEP_TO_COARSE_PHASE[step]
    if (coarse === 'IDLE') return step // 'idle' — atomic top-level leaf
    return { [COARSE_TO_PARENT[coarse]]: step }
}

/** step -> the XState `StateValue` used to rehydrate the machine at that leaf. */
export const STEP_TO_STATE_VALUE = Object.fromEntries(
    PipelineStepValues.map((s) => [s, stateValueForStep(s)])
) as Record<PipelineStep, StateValue>

/** Extract the deepest leaf step name from an XState `StateValue`. */
export function stateValueToLeaf(value: StateValue): PipelineStep {
    if (typeof value === 'string') return value as PipelineStep
    const leaf = Object.values(value)[0]
    return (
        typeof leaf === 'string' ? leaf : stateValueToLeaf(leaf as StateValue)
    ) as PipelineStep
}
