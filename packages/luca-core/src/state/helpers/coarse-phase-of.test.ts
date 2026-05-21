import { describe, expect, test } from 'bun:test'

import { coarsePhaseOf } from './coarse-phase-of.ts'

import type { CoarsePhase, PipelineStep } from '../schemas.ts'

describe('coarsePhaseOf', () => {
    // Table-driven: every pipelineStep maps to exactly one coarse phase.
    // Adding a pipelineStep without updating this table fails the test.
    const cases: Array<[PipelineStep, CoarsePhase]> = [
        ['idle', 'IDLE'],
        ['triage', 'PLANNING'],
        ['research', 'PLANNING'],
        ['discuss', 'PLANNING'],
        ['architect', 'PLANNING'],
        ['plan', 'PLANNING'],
        ['plan-review', 'PLANNING'],
        ['execute', 'EXECUTING'],
        ['checks', 'EXECUTING'],
        ['verify', 'REVIEWING'],
        ['review', 'REVIEWING'],
        ['learn', 'REVIEWING'],
        ['milestone', 'FINALIZING'],
        ['complete', 'FINALIZING'],
    ]

    for (const [step, expected] of cases) {
        test(`maps ${step} → ${expected}`, () => {
            expect(coarsePhaseOf(step)).toBe(expected)
        })
    }

    test('all 14 canonical pipelineSteps are covered by the table above', () => {
        expect(cases.length).toBe(14)
    })
})
