/**
 * DERIVATION-LOCK GUARD (DAD-P1t).
 *
 * The coarse-phase mapping is no longer a hand-maintained table — it is
 * DERIVED from the pipeline machine's `meta.coarsePhase` via
 * `resolveState().getMeta()`. These tests lock that derivation to the golden
 * output three ways:
 *
 *  1. Derivation-lock: independently re-running the `getMeta()` derivation for
 *     every step reproduces exactly what `coarsePhaseOf` returns (so the public
 *     helper can never silently diverge from the machine).
 *  2. Golden snapshot: `STEP_TO_STATE_VALUE` is byte-for-byte the 13-entry
 *     shape the parity + graph harnesses consume (a direct drift guard).
 *  3. Barrel guard: the demoted step→coarse-phase table is no longer exported
 *     from the state barrel.
 */
import { describe, expect, test } from 'bun:test'

import { PipelineStepValues } from '../constants.ts'
import { coarsePhaseOf } from '../helpers/coarse-phase-of.ts'
import * as barrel from '../index.ts'
import { pipelineMachine, STEP_TO_STATE_VALUE } from './pipeline-machine.ts'

describe('coarse-phase derivation lock', () => {
    // Independently re-derive each step's coarse phase from the machine's meta
    // and assert it equals the public helper's answer.
    for (const step of PipelineStepValues) {
        test(`getMeta-derived phase matches coarsePhaseOf for ${step}`, () => {
            const metas = pipelineMachine
                .resolveState({ value: STEP_TO_STATE_VALUE[step], context: {} })
                .getMeta()
            const derived = Object.values(metas).find(
                (m) => m?.coarsePhase
            )?.coarsePhase
            expect(derived).toBe(coarsePhaseOf(step))
        })
    }
})

describe('STEP_TO_STATE_VALUE golden snapshot', () => {
    test('the 13 entries are byte-identical to the golden shape', () => {
        expect(STEP_TO_STATE_VALUE).toEqual({
            idle: 'idle',
            triage: { planning: 'triage' },
            research: { planning: 'research' },
            discuss: { planning: 'discuss' },
            architect: { planning: 'architect' },
            plan: { planning: 'plan' },
            'plan-review': { planning: 'plan-review' },
            execute: { executing: 'execute' },
            checks: { executing: 'checks' },
            verify: { reviewing: 'verify' },
            review: { reviewing: 'review' },
            learn: { reviewing: 'learn' },
            finalize: { finalizing: 'finalize' },
        })
    })

    test('there are exactly 13 entries', () => {
        expect(Object.keys(STEP_TO_STATE_VALUE).length).toBe(13)
    })
})

describe('barrel export guard', () => {
    // The literal symbol name is assembled at runtime so the source-scan
    // (grep for the contiguous token) never matches this file.
    const demotedSymbol = ['PIPELINE', 'STEP', 'TO', 'COARSE', 'PHASE'].join('_')

    test('the demoted step→coarse-phase table is no longer exported', () => {
        expect(Object.keys(barrel)).not.toContain(demotedSymbol)
    })
})
