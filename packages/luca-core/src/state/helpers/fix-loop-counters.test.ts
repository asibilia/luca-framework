/**
 * Fix-loop counter write-back coverage.
 *
 * This is the arithmetic the deleted machine `assign` actions used to perform
 * inside the machine context and that `machineVerdict` surfaced as
 * `counterUpdate`. The behaviour must be IDENTICAL:
 *  - the 3 rework edges increment their counter,
 *  - the 3 forward-exit edges reset it to 0,
 *  - every other edge produces NO update,
 *  - an UNTRACKED counter produces no update (never minted from nothing).
 */
import { describe, expect, test } from 'bun:test'

import { FIX_LOOP_EDGES, REWORK_EDGE_CAPS } from '../configs/fix-loop-edges.ts'
import { PIPELINE_TRANSITIONS } from '../configs/pipeline-transitions.ts'
import type { PipelineStep } from '../schemas.ts'
import { fixLoopCounterUpdate } from './fix-loop-counters.ts'

const ALL_COUNTERS = {
    checksFixIteration: 0,
    verifyIteration: 0,
    reviewIteration: 0,
}

describe('FIX_LOOP_EDGES table shape', () => {
    test('exactly 6 edges — 3 increment, 3 reset', () => {
        const entries = Object.entries(FIX_LOOP_EDGES)
        expect(entries.length).toBe(6)
        expect(
            entries.filter(([, e]) => e.action === 'incFixLoop').length
        ).toBe(3)
        expect(
            entries.filter(([, e]) => e.action === 'resetFixLoop').length
        ).toBe(3)
    })

    test('every fix-loop edge is a LEGAL pipeline transition', () => {
        for (const key of Object.keys(FIX_LOOP_EDGES)) {
            const [from, to] = key.split('->') as [PipelineStep, PipelineStep]
            expect(PIPELINE_TRANSITIONS[from]).toContain(to)
        }
    })

    test('REWORK_EDGE_CAPS covers exactly the 3 increment edges', () => {
        expect(Object.keys(REWORK_EDGE_CAPS).sort()).toEqual([
            'checks->execute',
            'review->execute',
            'verify->checks',
        ])
    })
})

describe('fixLoopCounterUpdate — rework edges increment', () => {
    const cases: Array<[PipelineStep, PipelineStep, keyof typeof ALL_COUNTERS]> =
        [
            ['checks', 'execute', 'checksFixIteration'],
            ['verify', 'checks', 'verifyIteration'],
            ['review', 'execute', 'reviewIteration'],
        ]

    for (const [from, to, field] of cases) {
        test(`${from}→${to} increments ${field}`, () => {
            expect(
                fixLoopCounterUpdate(from, to, { ...ALL_COUNTERS, [field]: 3 })
            ).toEqual({ field, value: 4 })
        })

        test(`${from}→${to} increments past the cap (advisory: never clamps)`, () => {
            expect(
                fixLoopCounterUpdate(from, to, { ...ALL_COUNTERS, [field]: 99 })
            ).toEqual({ field, value: 100 })
        })
    }
})

describe('fixLoopCounterUpdate — forward-exit edges reset', () => {
    const cases: Array<[PipelineStep, PipelineStep, keyof typeof ALL_COUNTERS]> =
        [
            ['checks', 'verify', 'checksFixIteration'],
            ['verify', 'review', 'verifyIteration'],
            ['review', 'learn', 'reviewIteration'],
        ]

    for (const [from, to, field] of cases) {
        test(`${from}→${to} resets ${field} to 0`, () => {
            expect(
                fixLoopCounterUpdate(from, to, { ...ALL_COUNTERS, [field]: 7 })
            ).toEqual({ field, value: 0 })
        })
    }
})

describe('fixLoopCounterUpdate — no update outside the 6 edges', () => {
    test('every legal NON-fix-loop edge produces undefined', () => {
        let checked = 0
        for (const [from, nexts] of Object.entries(PIPELINE_TRANSITIONS)) {
            for (const to of nexts) {
                if (FIX_LOOP_EDGES[`${from}->${to}`] !== undefined) continue
                checked += 1
                expect(
                    fixLoopCounterUpdate(
                        from as PipelineStep,
                        to,
                        ALL_COUNTERS
                    )
                ).toBeUndefined()
            }
        }
        // 21 legal edges - 6 fix-loop edges.
        expect(checked).toBe(15)
    })
})

describe('fixLoopCounterUpdate — untracked counters are never minted', () => {
    test('an empty counter bag yields no update on a rework edge', () => {
        expect(fixLoopCounterUpdate('checks', 'execute', {})).toBeUndefined()
    })

    test('an empty counter bag yields no update on a reset edge', () => {
        expect(fixLoopCounterUpdate('checks', 'verify', {})).toBeUndefined()
    })

    test('only the traversed edge’s counter matters', () => {
        // verifyIteration tracked, checksFixIteration NOT — a checks→execute
        // advance must still produce nothing.
        expect(
            fixLoopCounterUpdate('checks', 'execute', { verifyIteration: 5 })
        ).toBeUndefined()
    })

    test('a tracked 0 counter DOES update (0 is not "untracked")', () => {
        expect(
            fixLoopCounterUpdate('checks', 'execute', {
                checksFixIteration: 0,
            })
        ).toEqual({ field: 'checksFixIteration', value: 1 })
    })
})
