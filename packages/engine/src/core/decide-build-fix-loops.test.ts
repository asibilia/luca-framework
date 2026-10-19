import { describe, expect, test } from 'bun:test'

import { MAX_FIX_ROUNDS } from './decide-build'
import {
    bounced,
    decideAfter,
    replaced,
    stepsUpTo,
} from './decide-build-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    baselineTests,
    gatesRun,
    implemented,
    redCheck,
    runBranchCreated,
    SESSIONS,
    testsWritten,
    ticketBuilt,
    ticketWorktreeCreated,
    worktreeReset,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'

/**
 * The decision steps for the fix loops of building a ticket: a failed red
 * check goes back to the test-writer, failing gates go back to the
 * implementer, and a bad test bounces to a fresh test-writer once. The
 * helpers are in `decide-build-helpers.ts`.
 */

/** A failed red check, then a test-writer follow-up answered, `n` times. */
const redRounds = (n: number): JournalEntry[] =>
    Array.from({ length: n }, () => [
        redCheck({ ticket: 11, ok: false }),
        agentStarted({
            ticket: 11,
            role: 'test-writer',
            follow_up_of: SESSIONS['test-writer'],
        }),
        testsWritten({ ticket: 11 }),
    ]).flat()

describe('decision step: the red check fix loop', () => {
    test('a failed red check goes back to the same test-writer session, with its problems and output', () => {
        const action = decideAfter([
            ...stepsUpTo(2),
            redCheck({ ticket: 11, ok: false }),
        ])

        expect(action).toMatchObject({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'test-writer',
            session_id: SESSIONS['test-writer'],
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain(
            '"sum adds two numbers" passes already'
        )
        expect(action.message).toContain('(pass) sum adds two numbers')
    })

    test('once the test-writer answers the follow-up, the red check runs again', () => {
        expect(decideAfter([...stepsUpTo(2), ...redRounds(1)])).toMatchObject({
            type: 'run_red_check',
            ticket: 11,
        })
    })

    test('a red check that passes after a fix round is committed', () => {
        expect(
            decideAfter([
                ...stepsUpTo(2),
                ...redRounds(2),
                redCheck({ ticket: 11, ok: true }),
            ])
        ).toMatchObject({ type: 'commit_ticket', stage: 'red' })
    })

    test(`it gets ${MAX_FIX_ROUNDS} fix rounds`, () => {
        expect(
            decideAfter([
                ...stepsUpTo(2),
                ...redRounds(MAX_FIX_ROUNDS - 1),
                redCheck({ ticket: 11, ok: false }),
            ])
        ).toMatchObject({ type: 'follow_up_agent', role: 'test-writer' })
    })

    test(`a red check still failing after ${MAX_FIX_ROUNDS} fix rounds makes the ticket stuck`, () => {
        const action = decideAfter([
            ...stepsUpTo(2),
            ...redRounds(MAX_FIX_ROUNDS),
            redCheck({ ticket: 11, ok: false }),
        ])

        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'red_check_failed',
        })
        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(action.detail).toContain(`after ${MAX_FIX_ROUNDS} fix rounds`)
        expect(action.detail).toContain('"sum adds two numbers" passes already')
    })

    test(`a test that still passes goes back to the first test-writer's session every round, and after ${MAX_FIX_ROUNDS} rounds the ticket is stuck with no commit`, () => {
        const decided: string[] = []
        let entries = stepsUpTo(2)
        for (let round = 1; round <= MAX_FIX_ROUNDS; round += 1) {
            decided.push(decideAfter(entries).type)
            entries = [...entries, redCheck({ ticket: 11, ok: false })]
            const action = decideAfter(entries)
            decided.push(action.type)
            expect(action).toMatchObject({
                ticket: 11,
                role: 'test-writer',
                session_id: SESSIONS['test-writer'],
            })
            if (action.type !== 'follow_up_agent') throw new Error(action.type)
            expect(action.message).toContain('passes already')
            entries = [
                ...entries,
                agentStarted({
                    ticket: 11,
                    role: 'test-writer',
                    follow_up_of: SESSIONS['test-writer'],
                }),
                testsWritten({ ticket: 11 }),
            ]
        }
        decided.push(decideAfter(entries).type)
        const stuck = decideAfter([
            ...entries,
            redCheck({ ticket: 11, ok: false }),
        ])
        decided.push(stuck.type)

        // MAX_FIX_ROUNDS + 1 red checks, a follow-up after each but the
        // last, then stuck: never a commit.
        expect(decided).toEqual([
            ...Array.from({ length: MAX_FIX_ROUNDS }, () => [
                'run_red_check',
                'follow_up_agent',
            ]).flat(),
            'run_red_check',
            'mark_stuck',
        ])
        expect(stuck).toMatchObject({
            ticket: 11,
            reason: 'red_check_failed',
        })
        if (stuck.type !== 'mark_stuck') throw new Error(stuck.type)
        expect(stuck.detail).toContain('passes already')
    })

    test('a follow-up that started but never finished is sent again to the same session, not counted', () => {
        const once = decideAfter([
            ...stepsUpTo(2),
            redCheck({ ticket: 11, ok: false }),
        ])
        const again = decideAfter([
            ...stepsUpTo(2),
            redCheck({ ticket: 11, ok: false }),
            agentStarted({
                ticket: 11,
                role: 'test-writer',
                follow_up_of: SESSIONS['test-writer'],
            }),
        ])

        expect(again).toEqual(once)
    })

    test('a failed red check with no test-writer session to go back to goes to a fresh test-writer with the same message', () => {
        expect(
            decideAfter([
                runBranchCreated(),
                ticketWorktreeCreated({ ticket: 11 }),
                baselineTests({ ticket: 11 }),
                {
                    kind: 'agent_finished',
                    ticket: 11,
                    role: 'test-writer',
                    content: {
                        role: 'test-writer',
                        result: {
                            outcome: 'tests_written',
                            criteria: [
                                {
                                    criterion_id: 'AC1',
                                    tests: [{ file: 'a.test.ts', name: 'a' }],
                                },
                            ],
                        },
                    },
                },
                redCheck({ ticket: 11, ok: false }),
            ])
        ).toMatchObject({
            type: 'launch_agent',
            role: 'test-writer',
            prompt: expect.stringContaining('The red check failed.'),
        })
    })

    test('the PR lists the assumptions from every round, once each', () => {
        const action = decideAfter([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 3),
            redCheck({ ticket: 11, ok: false }),
            testsWritten({
                ticket: 11,
                assumptions: ['Numbers are integers.', 'Sums may be negative.'],
            }),
            ...ticketBuilt({ ticket: 11 }).slice(3),
            ...finalReviewClean(),
        ])
        if (action.type !== 'open_pull_request') throw new Error(action.type)

        expect(action.body).toContain(
            '- #11: Numbers are integers.\n- #11: Sums may be negative.'
        )
        expect(action.body.match(/Numbers are integers/g)).toHaveLength(1)
    })
})

/** Failed gates, then an implementer follow-up answered, `n` times. */
const gateRounds = (n: number): JournalEntry[] =>
    Array.from({ length: n }, () => [
        gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        agentStarted({
            ticket: 11,
            role: 'implementer',
            follow_up_of: SESSIONS.implementer,
        }),
        implemented({ ticket: 11 }),
    ]).flat()

describe('decision step: the gates fix loop', () => {
    test('failing gates go back to the same implementer session, with the failing output', () => {
        const action = decideAfter([
            ...stepsUpTo(6),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ])

        expect(action).toMatchObject({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'implementer',
            session_id: SESSIONS.implementer,
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain('test failed:\n1 fail')
    })

    test('once the implementer answers the follow-up, the gates run again', () => {
        expect(decideAfter([...stepsUpTo(6), ...gateRounds(1)])).toEqual({
            type: 'run_gates',
            ticket: 11,
            target: 'ticket',
        })
    })

    test('gates that pass after a fix round are committed as the green commit', () => {
        expect(
            decideAfter([
                ...stepsUpTo(6),
                ...gateRounds(MAX_FIX_ROUNDS),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            ])
        ).toMatchObject({ type: 'commit_ticket', stage: 'green' })
    })

    test(`failing gates after ${MAX_FIX_ROUNDS} fix rounds make the ticket stuck, with the output`, () => {
        const action = decideAfter([
            ...stepsUpTo(6),
            ...gateRounds(MAX_FIX_ROUNDS),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ])

        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'gates_failed',
        })
        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(action.detail).toContain(`after ${MAX_FIX_ROUNDS} fix rounds`)
        expect(action.detail).toContain('test failed:\n1 fail')
    })

    test('a gates follow-up that started but never finished is sent again, not counted', () => {
        const entries = [
            ...stepsUpTo(6),
            ...gateRounds(MAX_FIX_ROUNDS - 1),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ]

        expect(
            decideAfter([
                ...entries,
                agentStarted({
                    ticket: 11,
                    role: 'implementer',
                    follow_up_of: SESSIONS.implementer,
                }),
            ])
        ).toEqual(decideAfter(entries))
        expect(decideAfter(entries)).toMatchObject({ type: 'follow_up_agent' })
    })
})

describe('decision step: a bad test bounces to a fresh test-writer once', () => {
    test("the first bad test throws away the implementer's uncommitted work", () => {
        expect(
            decideAfter([
                ...stepsUpTo(5),
                implemented({ ticket: 11, outcome: 'bad_test' }),
            ])
        ).toEqual({ type: 'reset_ticket_worktree', ticket: 11 })
    })

    test("after the reset, a fresh test-writer gets the bad test's file, name, and reason", () => {
        const action = decideAfter(bounced())

        expect(action).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
            may_edit_tests: true,
        })
        if (action.type !== 'launch_agent') throw new Error(action.type)
        expect(action.prompt).toContain('bad test')
        expect(action.prompt).toContain('src/sum.test.ts')
        expect(action.prompt).toContain('sum adds two numbers')
        expect(action.prompt).toContain('Wrong sum.')
        expect(action.prompt).toContain('every criterion')
    })

    test("the fresh test-writer's tests go through the red check", () => {
        expect(
            decideAfter([
                ...bounced(),
                testsWritten({ ticket: 11, session_id: 'tw-2' }),
            ])
        ).toMatchObject({ type: 'run_red_check', ticket: 11 })
    })

    test('a failed red check after the bounce goes to the fresh test-writer, with fresh rounds', () => {
        expect(
            decideAfter([
                ...stepsUpTo(2),
                ...redRounds(MAX_FIX_ROUNDS),
                redCheck({ ticket: 11, ok: true }),
                ...ticketBuilt({ ticket: 11 }).slice(4, 6),
                implemented({ ticket: 11, outcome: 'bad_test' }),
                worktreeReset({ ticket: 11 }),
                testsWritten({ ticket: 11, session_id: 'tw-2' }),
                redCheck({ ticket: 11, ok: false }),
            ])
        ).toMatchObject({
            type: 'follow_up_agent',
            role: 'test-writer',
            session_id: 'tw-2',
        })
    })

    test('the new tests get their own red commit, which says a bad test was replaced', () => {
        expect(
            decideAfter([
                ...bounced(),
                testsWritten({ ticket: 11, session_id: 'tw-2' }),
                redCheck({ ticket: 11, ok: true }),
            ])
        ).toEqual({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'red',
            message: 'test: replace a bad test for #11 Add sum',
        })
    })

    test('then a fresh implementer writes the code', () => {
        expect(decideAfter(replaced())).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
            may_edit_tests: false,
        })
    })

    test('a second bad test makes the ticket stuck, with its reason', () => {
        const action = decideAfter([
            ...replaced(),
            implemented({
                ticket: 11,
                outcome: 'bad_test',
                session_id: 'impl-2',
                reason: 'Still wrong.',
            }),
        ])

        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'bad_test',
        })
        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(action.detail).toContain('second time')
        expect(action.detail).toContain('Still wrong.')
    })
})
