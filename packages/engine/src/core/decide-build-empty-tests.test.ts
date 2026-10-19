import { describe, expect, test } from 'bun:test'

import { EMPTY_TEST_REASON } from './decide-build'
import {
    bounced,
    decideAfter,
    decideRefactorAfter,
    replaced,
    stepsUpTo,
} from './decide-build-helpers'

import type { TestCase } from '../gates/gate-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    commitMade,
    finding,
    gatesRun,
    implemented,
    joinClashed,
    leftoverScan,
    redCheck,
    reviewed,
    SESSIONS,
    testsWritten,
    ticketRebased,
    worktreeReset,
} from '../testing/build-fixtures'

/**
 * The decision steps for a new test that checks nothing (#581). The helpers
 * are in `decide-build-helpers.ts`.
 */

/**
 * A new test that checks nothing (#581). Ticket #11's red test is "sum adds
 * two numbers" in `src/sum.test.ts`.
 */
describe('a new test that checks nothing (#581)', () => {
    const RED_TEST = { file: 'src/sum.test.ts', name: 'sum adds two numbers' }

    /** The gates' case for the red test, with this many expect() calls. */
    const ranWith = (assertions: number | undefined): TestCase[] => [
        {
            file: RED_TEST.file,
            full_name: RED_TEST.name,
            status: 'passed',
            ...(assertions === undefined ? {} : { assertions }),
        },
    ]

    /** The passing gates of ticket #11, with these cases. */
    const passingGates = (cases: TestCase[]) =>
        gatesRun({ ticket: 11, target: 'ticket', ok: true, cases })

    /** Up to and including the passing gates of ticket #11. */
    const toGates = (cases: TestCase[]) => [
        ...stepsUpTo(6),
        passingGates(cases),
    ]

    /** The engine's bad test, as its reset record journals it. */
    const BAD_TEST = { ...RED_TEST, reason: EMPTY_TEST_REASON }

    /** After the engine's reset: fresh tests, a passing red check, the second red commit. */
    const replacedByEngine = (): JournalEntry[] => [
        ...toGates(ranWith(0)),
        worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
        testsWritten({ ticket: 11, session_id: 'tw-2' }),
        redCheck({ ticket: 11, ok: true }),
        leftoverScan({ ticket: 11, stage: 'red' }),
        commitMade({ ticket: 11, stage: 'red' }),
    ]

    const GREEN = { type: 'commit_ticket', stage: 'green' }

    test('a mapped test that passed with no expect() sends the ticket back to a fresh test-writer', () => {
        expect(decideAfter(toGates(ranWith(0)))).toEqual({
            type: 'reset_ticket_worktree',
            ticket: 11,
            bad_test: {
                file: 'src/sum.test.ts',
                name: 'sum adds two numbers',
                reason: 'It passes but runs no expect(), so it checks nothing (#581).',
            },
        })
    })

    test('with expect() calls, or with no count (an older journal), it goes on to the green commit', () => {
        expect(decideAfter(toGates(ranWith(2)))).toMatchObject(GREEN)
        expect(decideAfter(toGates(ranWith(undefined)))).toMatchObject(GREEN)
    })

    test('a mapped test the gates did not run, or did not pass, is left to the other checks', () => {
        const [empty] = ranWith(0)
        if (!empty) throw new Error('case')

        // Gates that journal no cases at all (an older journal).
        expect(decideAfter(toGates([]))).toMatchObject(GREEN)
        expect(
            decideAfter([
                ...stepsUpTo(6),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            ])
        ).toMatchObject(GREEN)
        // Other tests, and the same name in another file.
        expect(
            decideAfter(
                toGates([
                    { ...empty, full_name: 'sum subtracts' },
                    { ...empty, file: 'src/other.test.ts' },
                ])
            )
        ).toMatchObject(GREEN)
        // A test that did not pass.
        expect(
            decideAfter(toGates([{ ...empty, status: 'skipped' }]))
        ).toMatchObject(GREEN)
        expect(
            decideAfter(toGates([{ ...empty, status: 'failed' }]))
        ).toMatchObject(GREEN)
    })

    test('a test is found as the red check finds it: by the last part of its name', () => {
        expect(
            decideAfter(
                toGates([
                    {
                        file: RED_TEST.file,
                        full_name: 'a suite > sum adds two numbers',
                        status: 'passed',
                        assertions: 0,
                    },
                ])
            )
        ).toMatchObject({ type: 'reset_ticket_worktree', ticket: 11 })
    })

    test("after the reset, a fresh test-writer gets the engine's finding in its prompt", () => {
        const action = decideAfter([
            ...toGates(ranWith(0)),
            worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
        ])

        expect(action).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
            may_edit_tests: true,
        })
        if (action.type !== 'launch_agent') throw new Error(action.type)
        expect(action.prompt).toContain(
            'The engine found this test checks nothing'
        )
        expect(action.prompt).toContain('src/sum.test.ts')
        expect(action.prompt).toContain('sum adds two numbers')
        expect(action.prompt).toContain(EMPTY_TEST_REASON)
        expect(action.prompt).not.toContain('The implementer says')
    })

    test("a test the implementer sent back keeps the implementer's wording in the prompt", () => {
        const action = decideAfter(bounced())

        if (action.type !== 'launch_agent') throw new Error(action.type)
        expect(action.prompt).toContain(
            'The implementer says this test is wrong'
        )
        expect(action.prompt).not.toContain('The engine found')
    })

    test('the new tests get a red commit that says a bad test was replaced, then a fresh implementer', () => {
        expect(
            decideAfter([
                ...toGates(ranWith(0)),
                worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
                testsWritten({ ticket: 11, session_id: 'tw-2' }),
                redCheck({ ticket: 11, ok: true }),
            ])
        ).toMatchObject({
            type: 'commit_ticket',
            stage: 'red',
            message: 'test: replace a bad test for #11 Add sum',
        })
        expect(decideAfter(replacedByEngine())).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
            may_edit_tests: false,
        })
    })

    /**
     * The second bounce makes the ticket stuck, whichever sent each one
     * back; the detail names both, in order. Both bounces share one cap.
     */
    describe('the second bounce is stuck, and the detail names who sent each one back', () => {
        /** The latest decision after a second implementer turn with this ending. */
        const secondTurn = ({
            entries,
            ending,
        }: {
            entries: JournalEntry[]
            ending: 'empty' | 'bad_test'
        }) => {
            const action = decideAfter([
                ...entries,
                ending === 'empty'
                    ? implemented({ ticket: 11, session_id: 'impl-2' })
                    : implemented({
                          ticket: 11,
                          outcome: 'bad_test',
                          session_id: 'impl-2',
                          reason: 'Still wrong.',
                      }),
                ...(ending === 'empty' ? [passingGates(ranWith(0))] : []),
            ])
            expect(action).toMatchObject({
                type: 'mark_stuck',
                ticket: 11,
                reason: 'bad_test',
            })
            if (action.type !== 'mark_stuck') throw new Error(action.type)
            return action.detail
        }

        test('the implementer, then the implementer again', () => {
            expect(
                secondTurn({ entries: replaced(), ending: 'bad_test' })
            ).toBe(
                'The implementer sent a test back as bad a second time: src/sum.test.ts > sum adds two numbers: Still wrong.'
            )
        })

        test('the engine, then the engine again', () => {
            expect(
                secondTurn({ entries: replacedByEngine(), ending: 'empty' })
            ).toBe(
                'A mapped test still checks nothing after a fresh test-writer: "sum adds two numbers" in src/sum.test.ts runs no expect().'
            )
        })

        test('the implementer, then the engine: the first bounce is not called an empty test', () => {
            expect(secondTurn({ entries: replaced(), ending: 'empty' })).toBe(
                'The implementer sent a test back as bad, and then, after a fresh test-writer, the engine found a mapped test that checks nothing: "sum adds two numbers" in src/sum.test.ts runs no expect().'
            )
        })

        test('the engine, then the implementer: the first bounce is not blamed on the implementer', () => {
            expect(
                secondTurn({ entries: replacedByEngine(), ending: 'bad_test' })
            ).toBe(
                'The engine found a mapped test that checks nothing, and then, after a fresh test-writer, the implementer sent a test back as bad: src/sum.test.ts > sum adds two numbers: Still wrong.'
            )
        })
    })

    test('a refactor ticket is not checked: it has no map', () => {
        expect(
            decideRefactorAfter([
                implemented({ ticket: 11 }),
                passingGates(ranWith(0)),
            ])
        ).toEqual({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'green',
            message: 'refactor: #11 Split sum into its own file',
        })
    })

    test('a ticket rejoining after a rebase is not checked: its code is already reviewed', () => {
        expect(
            decideAfter([
                ...stepsUpTo(10),
                joinClashed({ ticket: 11 }),
                ticketRebased({
                    ticket: 11,
                    cause: 'clash',
                    code: ['src/index.ts'],
                }),
                agentStarted({
                    ticket: 11,
                    role: 'implementer',
                    follow_up_of: SESSIONS.implementer,
                }),
                implemented({ ticket: 11 }),
                passingGates(ranWith(0)),
            ])
        ).toEqual({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'green',
            message: 'fix: rejoin #11 Add sum onto the run branch',
        })
    })

    test("a review's fixes are not checked: their tests are not red-checked", () => {
        const fixed = (cases: TestCase[]) =>
            decideAfter([
                ...stepsUpTo(9),
                reviewed({
                    ticket: 11,
                    findings: [finding({ id: 'R1-1' })],
                }),
                implemented({
                    ticket: 11,
                    finding_responses: [
                        { finding_id: 'R1-1', response: 'fixed', reason: '' },
                    ],
                }),
                passingGates(cases),
            ])

        expect(fixed(ranWith(0))).toEqual(fixed(ranWith(2)))
        expect(fixed(ranWith(0)).type).not.toBe('reset_ticket_worktree')
    })
})
