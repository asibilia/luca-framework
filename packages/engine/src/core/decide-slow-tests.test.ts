import { describe, expect, test } from 'bun:test'

import { decideSteps, type EngineAction } from './decide'
import { keyOf } from './execute'
import { MAX_FIX_ROUNDS } from './loop-caps'

import { LENS_NAMES } from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'
import { isFinalKey, replayRun } from '../journal/replay'
import {
    agentStarted,
    commitMade,
    implemented,
    intakePassed,
    leftoverScan,
    practiceTicket,
    pushed,
    runBranchCreated,
    SESSIONS,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import {
    finalReviewFixing,
    finalReviewStarted,
    lensFinding,
    lensRound,
    slowTestsRun,
} from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1, the final review's slow tests (#563): the decision step given a
 * journal in which every ticket pushed and the config has a slow test
 * command. The slow tests run beside round 1's lenses, the round waits for
 * them, and failing ones open a fix round like failed gates.
 */

const TICKET = practiceTicket({ number: 11 })

/** Every step the decision step can take now, after these entries. */
const stepsAfter = (
    entries: JournalEntry[],
    tickets = [TICKET]
): EngineAction[] =>
    decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** The one step the decision step takes after these entries. */
const stepAfter = (entries: JournalEntry[]): EngineAction => {
    const steps = stepsAfter(entries)
    if (steps.length !== 1) {
        throw new Error(steps.map(({ type }) => type).join(', '))
    }
    return steps[0] as EngineAction
}

/** The run branch with ticket #11 built, joined, and pushed. */
const built = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }),
]

/** The final review's state after these entries. */
const reviewAfter = (entries: JournalEntry[]) =>
    replayRun({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET] }),
                ...withInstalls({ entries }),
            ],
        }),
    }).final_review

/**
 * The final review's gates on the run branch: the tests pass, and the slow
 * tests pass or fail.
 */
const finalGates = ({ ok }: { ok: boolean }): JournalEntry => ({
    kind: 'gates_run',
    ticket: null,
    role: null,
    content: {
        target: 'run_branch',
        ok,
        checks: [
            {
                name: 'test',
                command: 'bun test',
                ok: true,
                exit_code: 0,
                output: '',
            },
            {
                name: 'slow_test',
                command: 'bun test .e2e.test',
                ok,
                exit_code: ok ? 0 : 1,
                output: ok ? '' : '1 fail',
            },
        ],
    },
})

/** Round 1 with its slow tests due: every lens clean, and the slow tests failed. */
const slowFailed = (): JournalEntry[] => [
    ...built(),
    ...lensRound({ round: 1, slow_due: true }),
    slowTestsRun({ ok: false }),
]

const SECURITY = lensFinding({ id: 'S1', title: 'Sum trusts its input' })

describe('slow tests at the final review (#563)', () => {
    test('round 1 with slow tests due runs them alongside the lenses', () => {
        const steps = stepsAfter([
            ...built(),
            finalReviewStarted({ round: 1, slow_due: true }),
        ])
        expect(steps.map(({ type }) => type)).toContain('run_final_slow_tests')
        expect(steps.filter(({ type }) => type === 'launch_lens')).toHaveLength(
            LENS_NAMES.length
        )
    })

    test('without slow tests due, round 1 never asks for them', () => {
        const steps = stepsAfter([...built(), finalReviewStarted({ round: 1 })])
        expect(steps.map(({ type }) => type)).not.toContain(
            'run_final_slow_tests'
        )
    })

    test('slow tests already in leave only the lenses still reviewing', () => {
        const steps = stepsAfter([
            ...built(),
            finalReviewStarted({ round: 1, slow_due: true }),
            slowTestsRun({ ok: true }),
        ])
        expect(steps.map(({ type }) => type)).toEqual(
            LENS_NAMES.map(() => 'launch_lens')
        )
    })

    test('clean lenses wait for the slow tests before passing', () => {
        expect(
            stepAfter([...built(), ...lensRound({ round: 1, slow_due: true })])
        ).toEqual({ type: 'run_final_slow_tests' })
    })

    test('clean lenses and passing slow tests pass the review', () => {
        const entries = [
            ...built(),
            ...lensRound({ round: 1, slow_due: true }),
            slowTestsRun({ ok: true }),
        ]
        expect(stepAfter(entries)).toEqual({ type: 'pass_final_review' })
        // They passed on the round's HEAD.
        expect(reviewAfter(entries).slow_ok_at).toBe('g1')
    })

    test('failing slow tests open a fix round whose first step is the gates', () => {
        const entries = slowFailed()
        expect(stepAfter(entries)).toMatchObject({
            type: 'start_final_fix',
            round: 1,
        })
        expect(
            stepAfter([...entries, finalReviewFixing({ round: 1 })])
        ).toEqual({ type: 'run_final_gates' })
        // The slow run is not the fix round's gates.
        const review = reviewAfter(entries)
        expect(review.gates).toBeNull()
        expect(review.fix).toMatchObject({
            findings: [],
            tests_answered: true,
            code_answered: true,
        })
        expect(review.slow_ok_at).toBeNull()
    })

    test('slow tests failing beside a lens finding join its fix round, and the lens looks again after the push', () => {
        const entries = [
            ...built(),
            ...lensRound({
                round: 1,
                slow_due: true,
                findings: { security: [SECURITY] },
            }),
            slowTestsRun({ ok: false }),
            finalReviewFixing({ round: 1 }),
            implemented({
                ticket: null,
                finding_responses: [
                    {
                        finding_id: 'security-S1',
                        response: 'fixed',
                        reason: '',
                    },
                ],
            }),
            finalGates({ ok: true }),
            leftoverScan({ ticket: null, stage: 'fix' }),
            commitMade({ ticket: null, stage: 'fix', sha: 'fix-1' }),
            pushed({ ticket: null, sha: 'fix-1' }),
        ]

        expect(stepAfter(entries)).toEqual({
            type: 'start_final_review',
            round: 2,
            from_sha: 'g1',
            lenses: ['security'],
        })
        // The fix round's gates ran the slow tests on what was pushed.
        expect(reviewAfter(entries).slow_ok_at).toBe('fix-1')
        // Round 2's slow tests aren't due: the fix round's gates ran them.
        const round2 = [
            ...entries,
            finalReviewStarted({
                round: 2,
                from_sha: 'g1',
                head_sha: 'fix-1',
                lenses: ['security'],
                slow_due: false,
            }),
        ]
        expect(stepsAfter(round2).map(({ type }) => type)).toEqual([
            'launch_lens',
        ])
    })

    test('a fix round opened only by slow tests ends at its push, with no new lens round', () => {
        const failedGates = [
            ...slowFailed(),
            finalReviewFixing({ round: 1 }),
            finalGates({ ok: false }),
        ]
        // A fresh implementer gets the failed slow tests, as failed gates.
        const fixer = stepAfter(failedGates)
        expect(fixer).toMatchObject({
            type: 'launch_final_fixer',
            role: 'implementer',
            may_edit_tests: false,
        })
        if (fixer.type !== 'launch_final_fixer') throw new Error(fixer.type)
        expect(fixer.prompt).toContain('The gates failed.')
        expect(fixer.prompt).toContain('slow_test failed:\n1 fail')

        const fixed = [
            ...failedGates,
            agentStarted({ ticket: null, role: 'implementer' }),
            implemented({ ticket: null }),
        ]
        expect(stepAfter(fixed)).toEqual({ type: 'run_final_gates' })

        const passed = [...fixed, finalGates({ ok: true })]
        expect(stepAfter(passed)).toEqual({
            type: 'commit_final_fix',
            round: 1,
            message: 'fix: final review round 1 for spec #10',
        })

        const pushedFix = [
            ...passed,
            leftoverScan({ ticket: null, stage: 'fix' }),
            commitMade({
                ticket: null,
                stage: 'fix',
                sha: 'fix-1',
                files: ['src/sum.ts'],
            }),
            pushed({ ticket: null, sha: 'fix-1' }),
        ]
        expect(stepAfter(pushedFix)).toEqual({ type: 'pass_final_review' })
        expect(reviewAfter(pushedFix).slow_ok_at).toBe('fix-1')
    })

    test(`slow tests still failing after ${MAX_FIX_ROUNDS} gate fix rounds leave the review stuck with gates_failed, naming slow_test`, () => {
        const failedGates = finalGates({ ok: false })
        const fixedAgain = [
            agentStarted({
                ticket: null,
                role: 'implementer',
                follow_up_of: SESSIONS.implementer,
            }),
            implemented({ ticket: null }),
        ]
        const step = stepAfter([
            ...slowFailed(),
            finalReviewFixing({ round: 1 }),
            failedGates,
            agentStarted({ ticket: null, role: 'implementer' }),
            implemented({ ticket: null }),
            failedGates,
            ...fixedAgain,
            failedGates,
            ...fixedAgain,
            failedGates,
        ])

        expect(step).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'gates_failed',
        })
        if (step.type !== 'mark_final_review_stuck') throw new Error(step.type)
        expect(step.detail).toContain('slow_test failed')
        // The fast tests passed, so only the slow ones are named.
        expect(step.detail).not.toMatch(/^test failed/m)
    })

    test('a journal from before slow tests (no slow_due) runs as today', () => {
        const entries = [...built(), ...lensRound({ round: 1 })]
        expect(stepAfter(entries)).toEqual({ type: 'pass_final_review' })
        expect(reviewAfter(entries)).toMatchObject({
            slow_due: false,
            slow_tests: null,
            slow_ok_at: null,
        })
    })

    test("the slow tests run under their own scheduler key, one of the final review's", () => {
        const key = keyOf({ type: 'run_final_slow_tests' })

        expect(key).toBe('final:slow')
        expect(key).not.toBe(keyOf({ type: 'run_final_gates' }))
        expect(isFinalKey(key)).toBe(true)
    })
})
