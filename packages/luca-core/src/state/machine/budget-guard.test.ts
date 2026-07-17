/**
 * Fix-loop budget-guard coverage (DAD-P1c).
 *
 * Two halves:
 *  1. ADVISORY (the shipped default): an over-budget rework advance is STILL
 *     allowed through the machine — the counter increments past its cap and
 *     `.can()` never denies. This is the parity-safety guarantee in miniature.
 *  2. ENFORCE (authored but edge-unwired): `withinFixBudget` — called directly,
 *     the way it would gate if wired — allows iff `counter < cap` across every
 *     `BUDGET_BY_COMPLEXITY` tier, denies at the cap boundary, and denies a
 *     zero-cap edge on the first attempt.
 */
import { describe, expect, test } from 'bun:test'
import { transition } from 'xstate'

import { BUDGET_BY_COMPLEXITY } from '../configs/budget-matrix.ts'
import type { ComplexityLevel } from '../schemas.ts'
import type { FixLoopCounter } from './actions.ts'
import { withinFixBudget, type FixLoopCap } from './guards.ts'
import {
    pipelineMachine,
    STEP_TO_STATE_VALUE,
    stateValueToLeaf,
    type PipelineContext,
} from './pipeline-machine.ts'

/** The 3 rework edges: (from, to) → (counter, cap). */
const REWORK_EDGES: Array<{
    from: string
    to: string
    counter: FixLoopCounter
    cap: FixLoopCap
}> = [
    {
        from: 'checks',
        to: 'execute',
        counter: 'checksFixIteration',
        cap: 'maxChecksFixIterations',
    },
    {
        from: 'verify',
        to: 'checks',
        counter: 'verifyIteration',
        cap: 'maxVerifyIterations',
    },
    {
        from: 'review',
        to: 'execute',
        counter: 'reviewIteration',
        cap: 'maxReviewIterations',
    },
]

const COMPLEXITIES: ComplexityLevel[] = [
    'TRIVIAL',
    'SIMPLE',
    'MODERATE',
    'COMPLEX',
    'CRITICAL',
]

describe('budget guard — ADVISORY (default): over-budget still advances (ac-06)', () => {
    test('checks→execute at checksFixIteration:99 is allowed; transition → 100', () => {
        const context: PipelineContext = {
            checksFixIteration: 99,
            maxChecksFixIterations: 5,
            // budgetMode deliberately ABSENT ⇒ advisory.
        }
        const snapshot = pipelineMachine.resolveState({
            value: STEP_TO_STATE_VALUE.checks,
            context,
        })
        const event = { type: 'ADVANCE', to: 'execute' } as const

        // Over budget (99 ≥ 5) but the edge carries only `toIs` — never denies.
        expect(snapshot.can(event)).toBe(true)

        const [next] = transition(pipelineMachine, snapshot, event)
        expect(stateValueToLeaf(next.value) as string).toBe('execute')
        expect((next.context as PipelineContext).checksFixIteration).toBe(100)
    })

    test('every rework edge advances over-budget in advisory mode', () => {
        for (const { from, to, counter } of REWORK_EDGES) {
            const context: PipelineContext = { [counter]: 99 }
            const snapshot = pipelineMachine.resolveState({
                value: STEP_TO_STATE_VALUE[
                    from as keyof typeof STEP_TO_STATE_VALUE
                ],
                context,
            })
            const event = { type: 'ADVANCE', to: to as never } as const
            expect(snapshot.can(event)).toBe(true)
            const [next] = transition(pipelineMachine, snapshot, event)
            expect((next.context as PipelineContext)[counter]).toBe(100)
        }
    })
})

describe('budget guard — ENFORCE: withinFixBudget allows iff counter < cap (ac-10, ac-11)', () => {
    // Property: for each complexity tier × each rework edge, the guard's
    // verdict equals `counter < cap` at counter ∈ {0, cap-1, cap, cap+1}.
    for (const complexity of COMPLEXITIES) {
        for (const { counter, cap } of REWORK_EDGES) {
            const capValue = BUDGET_BY_COMPLEXITY[complexity][cap]
            const samples = [0, capValue - 1, capValue, capValue + 1].filter(
                (n) => n >= 0
            )
            test(`${complexity} / ${counter}: allows iff counter < ${capValue}`, () => {
                for (const count of samples) {
                    const context: PipelineContext = {
                        budgetMode: 'enforce',
                        [counter]: count,
                        [cap]: capValue,
                    }
                    expect(withinFixBudget(context, { counter, cap })).toBe(
                        count < capValue
                    )
                }
            })
        }
    }

    test('cap boundary: counter === cap denies, counter === cap-1 allows (per complexity × edge)', () => {
        for (const complexity of COMPLEXITIES) {
            for (const { counter, cap } of REWORK_EDGES) {
                const capValue = BUDGET_BY_COMPLEXITY[complexity][cap]
                const atCap: PipelineContext = {
                    budgetMode: 'enforce',
                    [counter]: capValue,
                    [cap]: capValue,
                }
                expect(withinFixBudget(atCap, { counter, cap })).toBe(false)

                if (capValue > 0) {
                    const belowCap: PipelineContext = {
                        budgetMode: 'enforce',
                        [counter]: capValue - 1,
                        [cap]: capValue,
                    }
                    expect(withinFixBudget(belowCap, { counter, cap })).toBe(
                        true
                    )
                }
            }
        }
    })

    test('zero-cap edge denies the first attempt (0 < 0 is false) (ac-12)', () => {
        const context: PipelineContext = {
            budgetMode: 'enforce',
            reviewIteration: 0,
            maxReviewIterations: 0,
        }
        expect(
            withinFixBudget(context, {
                counter: 'reviewIteration',
                cap: 'maxReviewIterations',
            })
        ).toBe(false)
    })

    test('advisory / undefined budgetMode never denies even at/over cap (ac-05)', () => {
        const overCap: PipelineContext = {
            checksFixIteration: 999,
            maxChecksFixIterations: 1,
        }
        // No budgetMode ⇒ advisory ⇒ always allow.
        expect(
            withinFixBudget(overCap, {
                counter: 'checksFixIteration',
                cap: 'maxChecksFixIterations',
            })
        ).toBe(true)

        const explicitAdvisory: PipelineContext = {
            budgetMode: 'advisory',
            checksFixIteration: 999,
            maxChecksFixIterations: 1,
        }
        expect(
            withinFixBudget(explicitAdvisory, {
                counter: 'checksFixIteration',
                cap: 'maxChecksFixIterations',
            })
        ).toBe(true)
    })
})
