/**
 * GOLDEN PARITY HARNESS — THE GATE.
 *
 * Proves the XState machine (via `machineVerdict`) reproduces EVERY verdict of
 * the legacy `checkPipelineGuard` / `PIPELINE_TRANSITIONS` across all 169
 * `(from, to)` pairs: identical `allowed`, identical resulting step, identical
 * reason code. If this suite is green, the machine is a drop-in verdict
 * replacement for the legacy guard. It MUST stay green before P1b/P1c/P1t.
 */
import { describe, expect, test } from 'bun:test'

import { checkPipelineGuard } from '../../orchestration/pipeline-guard.ts'
import { machineVerdict } from './machine-verdict.ts'
import { pipelineMachine } from './pipeline-machine.ts'
import { transition } from 'xstate'
import {
    ALL_PAIRS,
    BOGUS_STEP,
    EXPECTED_LEGAL_COUNT,
    EXPECTED_PAIR_COUNT,
    ILLEGAL_PAIRS,
    LEGAL_PAIRS,
    parityContext,
    stateValueToLeaf,
    STEP_TO_STATE_VALUE,
    type TransitionPair,
} from './fixtures.ts'

// bun's test.each interpolates %s/%p from a tuple row; feed [from, to, pair].
type Row = [string, string, TransitionPair]
const ALL_ROWS: Row[] = ALL_PAIRS.map((p) => [p.from, p.to, p])
const ILLEGAL_ROWS: Row[] = ILLEGAL_PAIRS.map((p) => [p.from, p.to, p])

describe('pipeline-machine parity — allow/deny over all 169 pairs (ac-09)', () => {
    test.each(ALL_ROWS)('%s -> %s : allowed matches legacy', (from, to) => {
        const legacy = checkPipelineGuard({
            currentStep: from,
            requestedStep: to,
        })
        const mv = machineVerdict({ currentStep: from, requestedStep: to })
        expect(mv.allowed).toBe(legacy.allowed)
    })
})

describe('pipeline-machine parity — resulting step (ac-10)', () => {
    // For every legacy-ALLOWED pair, drive the real transition and assert the
    // machine lands on exactly `to`.
    test.each(LEGAL_PAIRS.map((p) => [p.from, p.to] as [string, string]))(
        '%s -> %s : resulting leaf === to',
        (from, to) => {
            const legacy = checkPipelineGuard({
                currentStep: from,
                requestedStep: to,
            })
            expect(legacy.allowed).toBe(true) // guard: fixture sanity

            const snapshot = pipelineMachine.resolveState({
                value: STEP_TO_STATE_VALUE[from as keyof typeof STEP_TO_STATE_VALUE],
                context: parityContext(),
            })
            const [next] = transition(pipelineMachine, snapshot, {
                type: 'ADVANCE',
                to: to as never,
            })
            expect(stateValueToLeaf(next.value) as string).toBe(to)

            // And the adapter agrees on the resulting step.
            expect(
                machineVerdict({ currentStep: from, requestedStep: to })
                    .resultingStep
            ).toBe(to)
        }
    )

    // For every DENIED pair, the machine must NOT move off `from`.
    test.each(ILLEGAL_ROWS)('%s -> %s : denied stays on from', (from, to) => {
        const mv = machineVerdict({ currentStep: from, requestedStep: to })
        expect(mv.allowed).toBe(false)
        expect(mv.resultingStep).toBe(from)

        // Structurally confirm the machine itself does not leave `from` when
        // the (valid) illegal event is applied.
        const snapshot = pipelineMachine.resolveState({
            value: STEP_TO_STATE_VALUE[from as keyof typeof STEP_TO_STATE_VALUE],
            context: parityContext(),
        })
        const [next] = transition(pipelineMachine, snapshot, {
            type: 'ADVANCE',
            to: to as never,
        })
        expect(stateValueToLeaf(next.value) as string).toBe(from)
    })
})

describe('pipeline-machine parity — reason codes over 148 illegal pairs (ac-11)', () => {
    test.each(ILLEGAL_ROWS)('%s -> %s : reason matches legacy', (from, to) => {
        const legacy = checkPipelineGuard({
            currentStep: from,
            requestedStep: to,
        })
        const mv = machineVerdict({ currentStep: from, requestedStep: to })
        expect(mv.reason).toBe(legacy.reason)
    })

    // Every ok/legal pair also matches its reason.
    test.each(LEGAL_PAIRS.map((p) => [p.from, p.to] as [string, string]))(
        '%s -> %s : reason === ok',
        (from, to) => {
            const legacy = checkPipelineGuard({
                currentStep: from,
                requestedStep: to,
            })
            const mv = machineVerdict({ currentStep: from, requestedStep: to })
            expect(mv.reason).toBe(legacy.reason)
            expect(mv.reason).toBe('ok')
        }
    )
})

describe('pipeline-machine parity — unknown-step fixtures (ac-12, ac-13)', () => {
    test('bogus -> triage : unknown-current-step (matches legacy)', () => {
        const legacy = checkPipelineGuard({
            currentStep: BOGUS_STEP,
            requestedStep: 'triage',
        })
        const mv = machineVerdict({
            currentStep: BOGUS_STEP,
            requestedStep: 'triage',
        })
        expect(legacy.reason).toBe('unknown-current-step')
        expect(mv.reason).toBe('unknown-current-step')
        expect(mv.allowed).toBe(false)
    })

    test('idle -> bogus : unknown-requested-step (matches legacy)', () => {
        const legacy = checkPipelineGuard({
            currentStep: 'idle',
            requestedStep: BOGUS_STEP,
        })
        const mv = machineVerdict({
            currentStep: 'idle',
            requestedStep: BOGUS_STEP,
        })
        expect(legacy.reason).toBe('unknown-requested-step')
        expect(mv.reason).toBe('unknown-requested-step')
        expect(mv.allowed).toBe(false)
    })
})

describe('pipeline-machine parity — exhaustiveness tripwires (ac-14, ac-15)', () => {
    test('ALL_PAIRS is the full 13x13 product', () => {
        expect(ALL_PAIRS.length).toBe(EXPECTED_PAIR_COUNT)
        expect(ALL_PAIRS.length).toBe(169)
    })

    test('LEGAL_PAIRS has exactly 21 edges', () => {
        expect(LEGAL_PAIRS.length).toBe(EXPECTED_LEGAL_COUNT)
        expect(LEGAL_PAIRS.length).toBe(21)
    })

    test('ILLEGAL_PAIRS has exactly 148 edges', () => {
        expect(ILLEGAL_PAIRS.length).toBe(169 - 21)
    })
})
