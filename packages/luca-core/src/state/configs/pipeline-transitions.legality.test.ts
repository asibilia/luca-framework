/**
 * TABLE LEGALITY TRIPWIRE.
 *
 * Replaces the exhaustiveness half of the deleted machine parity harness
 * (`pipeline-machine.parity.test.ts`). That harness drove `checkPipelineGuard`
 * and a machine-backed oracle over all 13x13 = 169 `(from, to)` pairs and
 * asserted 21 legal / 148 illegal. The machine is gone, so there is only one
 * engine left to check — but the COUNTS and the exact legal edge set must not
 * silently drift, so they are pinned here.
 *
 * Adding (or removing) an edge in `PIPELINE_TRANSITIONS` without re-baselining
 * `LEGAL_EDGES` below FAILS this file.
 */
import { describe, expect, test } from 'bun:test'

import { PipelineStepValues } from '../constants.ts'
import { checkPipelineGuard } from '../../orchestration/pipeline-guard.ts'
import type { PipelineStep } from '../schemas.ts'
import { isLegalTransition, PIPELINE_TRANSITIONS } from './pipeline-transitions.ts'

/** Tripwire: the cartesian product MUST be 13x13. */
const EXPECTED_PAIR_COUNT = 169
/** Tripwire: the table MUST have exactly 21 legal edges. */
const EXPECTED_LEGAL_COUNT = 21
/** Tripwire: the complement. */
const EXPECTED_ILLEGAL_COUNT = EXPECTED_PAIR_COUNT - EXPECTED_LEGAL_COUNT

/**
 * The GOLDEN legal edge set, written out by hand. Independent of
 * `PIPELINE_TRANSITIONS` (it is not derived from it), so a table edit that is
 * not mirrored here fails.
 */
const LEGAL_EDGES: ReadonlySet<string> = new Set([
    'idle->triage',
    'triage->research',
    'research->discuss',
    'research->research',
    'discuss->architect',
    'architect->plan',
    'plan->plan-review',
    'plan-review->execute',
    'plan-review->plan',
    'execute->checks',
    'checks->verify',
    'checks->execute',
    'verify->review',
    'verify->checks',
    'review->learn',
    'review->execute',
    'learn->plan',
    'learn->finalize',
    'finalize->idle',
    'finalize->execute',
    'finalize->review',
])

interface Pair {
    from: PipelineStep
    to: PipelineStep
    legal: boolean
}

const ALL_PAIRS: Pair[] = PipelineStepValues.flatMap((from) =>
    PipelineStepValues.map((to) => ({
        from,
        to,
        legal: isLegalTransition(from, to),
    }))
)

describe('PIPELINE_TRANSITIONS — exhaustiveness tripwires', () => {
    test('the pair space is the full 13x13 product', () => {
        expect(ALL_PAIRS.length).toBe(EXPECTED_PAIR_COUNT)
        expect(PipelineStepValues.length).toBe(13)
    })

    test('exactly 21 legal pairs', () => {
        expect(ALL_PAIRS.filter((p) => p.legal).length).toBe(
            EXPECTED_LEGAL_COUNT
        )
    })

    test('exactly 148 illegal pairs', () => {
        expect(ALL_PAIRS.filter((p) => !p.legal).length).toBe(
            EXPECTED_ILLEGAL_COUNT
        )
    })

    test('the legal edge set is byte-identical to the golden set', () => {
        const actual = new Set(
            ALL_PAIRS.filter((p) => p.legal).map((p) => `${p.from}->${p.to}`)
        )
        expect(actual).toEqual(LEGAL_EDGES as Set<string>)
    })

    test('every table entry is a known step and points only at known steps', () => {
        const known = new Set<string>(PipelineStepValues)
        expect(new Set(Object.keys(PIPELINE_TRANSITIONS))).toEqual(known)
        for (const nexts of Object.values(PIPELINE_TRANSITIONS)) {
            for (const to of nexts) expect(known.has(to)).toBe(true)
        }
    })
})

describe('checkPipelineGuard is the sole engine — agrees with the table on all 169 pairs', () => {
    test('allowed === isLegalTransition for every pair', () => {
        for (const { from, to, legal } of ALL_PAIRS) {
            const verdict = checkPipelineGuard({
                currentStep: from,
                requestedStep: to,
            })
            expect(`${from}->${to}:${verdict.allowed}`).toBe(
                `${from}->${to}:${legal}`
            )
        }
    })

    test('reason codes: ok / same-step-no-op / illegal-transition', () => {
        for (const { from, to, legal } of ALL_PAIRS) {
            const expected = legal
                ? 'ok'
                : from === to
                  ? 'same-step-no-op'
                  : 'illegal-transition'
            expect(
                checkPipelineGuard({ currentStep: from, requestedStep: to })
                    .reason
            ).toBe(expected)
        }
    })

    test('the legal self-loop research->research is `ok`, not same-step-no-op', () => {
        expect(
            checkPipelineGuard({
                currentStep: 'research',
                requestedStep: 'research',
            }).reason
        ).toBe('ok')
        expect(
            checkPipelineGuard({ currentStep: 'idle', requestedStep: 'idle' })
                .reason
        ).toBe('same-step-no-op')
    })

    test('unknown steps are rejected with their own reason codes', () => {
        expect(
            checkPipelineGuard({
                currentStep: 'bogus-step',
                requestedStep: 'triage',
            }).reason
        ).toBe('unknown-current-step')
        expect(
            checkPipelineGuard({
                currentStep: 'idle',
                requestedStep: 'bogus-step',
            }).reason
        ).toBe('unknown-requested-step')
    })
})
