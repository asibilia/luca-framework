import { describe, expect, test } from 'bun:test'

import { decideSteps } from './decide'
import { MAX_TEST_UPDATES } from './decide-build'
import { badTestDetail } from './stuck-text'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    gatesRun,
    implemented,
    intakePassed,
    joinClashed,
    practiceTicket,
    replyReceived,
    runBranchCreated,
    SESSIONS,
    stuckReported,
    testsSentBack,
    testsWritten,
    ticketApproved,
    ticketRebased,
    ticketRetried,
    ticketStuck,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'
import { REFACTOR_LABEL } from '../tracker/tracker'

/**
 * Seam 1 for #489 and #490: after a rebase, a test the joined tickets made
 * wrong goes back to the ticket's test-writer instead of getting the ticket
 * stuck, and every bad-test stuck text keeps the implementer's reason.
 */

const SUM = practiceTicket({ number: 11, title: 'Add sum' })

/** Every action that can run now, on a run with `ticket` and these entries. */
const stepsAfter = ({
    ticket,
    entries,
}: {
    ticket?: TicketSnapshot
    entries: JournalEntry[]
}) =>
    decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [ticket ?? SUM] }),
                ...withInstalls({ entries }),
            ],
        }),
    })

const REASON =
    "#12 added a line to src/index.ts, so this test's list of exports is one short."

/** #11 approved, its join clashed, and its change is back on the run branch. */
const rebased = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketApproved({ ticket: 11 }),
    joinClashed({ ticket: 11 }),
    ticketRebased({ ticket: 11, cause: 'clash', code: ['src/index.ts'] }),
]

/** The implementer's answer to a message on the run branch: a bad test. */
const badTest = ({
    reason,
    session_id,
}: {
    reason?: string
    session_id?: string
} = {}): JournalEntry[] => [
    agentStarted({
        ticket: 11,
        role: 'implementer',
        follow_up_of: session_id ?? SESSIONS.implementer,
    }),
    implemented({
        ticket: 11,
        outcome: 'bad_test',
        reason: reason ?? REASON,
        session_id,
    }),
]

/** One test update: sent back, then the test-writer's answer. */
const updated = ({ round }: { round: number }): JournalEntry[] => [
    testsSentBack({ ticket: 11, round, reason: REASON }),
    agentStarted({ ticket: 11, role: 'test-writer' }),
    testsWritten({ ticket: 11, session_id: `tw-update-${round}` }),
]

/** The implementer's answer after a test update. */
const finished = (): JournalEntry[] => [
    agentStarted({
        ticket: 11,
        role: 'implementer',
        follow_up_of: SESSIONS.implementer,
    }),
    implemented({ ticket: 11 }),
]

const only = (entries: JournalEntry[], ticket?: TicketSnapshot) => {
    const steps = stepsAfter({ ticket, entries })
    expect(steps).toHaveLength(1)
    const [step] = steps
    if (step === undefined) throw new Error('no step')
    return step
}

describe('decision step: a bad test after a rebase goes back to the test-writer (#489)', () => {
    test(`the cap is ${MAX_TEST_UPDATES} test updates per ticket`, () => {
        expect(MAX_TEST_UPDATES).toBe(2)
    })

    test("the implementer's bad test sends the tests back, with its reason and both bases", () => {
        expect(only([...rebased(), ...badTest()])).toEqual({
            type: 'send_tests_back',
            ticket: 11,
            round: 1,
            bad_test: {
                file: 'src/sum.test.ts',
                name: 'sum adds two numbers',
                reason: REASON,
            },
            from_sha: 'b0',
            base_sha: 'onto-sha',
        })
    })

    test('a bad test after failing gates on the run branch is sent back too', () => {
        expect(
            only([
                runBranchCreated(),
                ...ticketApproved({ ticket: 11 }),
                joinClashed({ ticket: 11 }),
                ticketRebased({ ticket: 11, cause: 'clash' }),
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
                ...badTest(),
            ])
        ).toMatchObject({ type: 'send_tests_back', ticket: 11, round: 1 })
    })

    test('a fresh test-writer gets what joined, the bad test, and to keep the code', () => {
        const step = only([
            ...rebased(),
            ...badTest(),
            testsSentBack({ ticket: 11, reason: REASON }),
        ])

        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
            may_edit_tests: true,
        })
        if (step.type !== 'launch_agent') throw new Error(step.type)
        expect(step.prompt).toContain(
            "## The run branch changed under this ticket's tests"
        )
        expect(step.prompt).toContain('- #12 Add product')
        expect(step.prompt).toContain('git log b0..onto-sha')
        expect(step.prompt).toContain('- src/product.ts')
        expect(step.prompt).toContain('- File: src/sum.test.ts')
        expect(step.prompt).toContain('- Test: sum adds two numbers')
        expect(step.prompt).toContain(`- Reason: ${REASON}`)
        expect(step.prompt).toContain('Edit test files only')
        expect(step.prompt).toContain('full criterion mapping')
        // The bad test is named once, in the update's own section.
        expect(step.prompt).not.toContain(
            '## A test was sent back as a bad test'
        )
    })

    test("then the implementer's session hears the tests were updated; no red check runs", () => {
        const step = only([
            ...rebased(),
            ...badTest(),
            ...updated({ round: 1 }),
        ])

        expect(step).toMatchObject({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'implementer',
            session_id: SESSIONS.implementer,
        })
        if (step.type !== 'follow_up_agent') throw new Error(step.type)
        expect(step.message).toContain('The test-writer updated the tests')
        expect(step.message).toContain('src/sum.test.ts > sum adds two numbers')
        expect(step.message).toContain('One test for AC1.')
        expect(step.message).toContain('make every gate pass')
    })

    test('with its session gone, a fresh implementer gets the same news', () => {
        const step = only([
            ...rebased(),
            ...badTest(),
            {
                kind: 'agent_session_closed',
                ticket: 11,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    session_id: SESSIONS.implementer,
                },
            },
            ...updated({ round: 1 }),
        ])

        expect(step).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
            may_edit_tests: false,
        })
        if (step.type !== 'launch_agent') throw new Error(step.type)
        expect(step.prompt).toContain('## The test-writer updated the tests')
        expect(step.prompt).toContain('on top of the run branch')
    })

    test('once the implementer is done, the gates run, then the rejoin commit', () => {
        const done = [
            ...rebased(),
            ...badTest(),
            ...updated({ round: 1 }),
            ...finished(),
        ]

        expect(only(done)).toEqual({
            type: 'run_gates',
            ticket: 11,
            target: 'ticket',
        })
        expect(
            only([
                ...done,
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            ])
        ).toEqual({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'green',
            message: 'fix: rejoin #11 Add sum onto the run branch',
        })
    })

    test('a second bad test after an update goes back once more', () => {
        expect(
            only([
                ...rebased(),
                ...badTest(),
                ...updated({ round: 1 }),
                ...badTest(),
            ])
        ).toMatchObject({ type: 'send_tests_back', round: 2 })
    })

    test(`a bad test after ${MAX_TEST_UPDATES} updates is stuck, with the implementer's reason`, () => {
        const rounds = Array.from({ length: MAX_TEST_UPDATES }, (_, index) => [
            ...updated({ round: index + 1 }),
            ...badTest({
                reason:
                    index === MAX_TEST_UPDATES - 1
                        ? 'Still one short after the update.'
                        : REASON,
            }),
        ]).flat()
        const step = only([...rebased(), ...badTest(), ...rounds])

        expect(step).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'bad_test',
        })
        if (step.type !== 'mark_stuck') throw new Error(step.type)
        expect(step.detail).toContain(`${MAX_TEST_UPDATES} times`)
        expect(step.detail).toContain(
            'src/sum.test.ts > sum adds two numbers: Still one short after the update.'
        )
        expect(step.detail).not.toContain('no reason given')
    })

    test('an update that leaves a criterion without a test is stuck', () => {
        const ticket = practiceTicket({
            number: 11,
            title: 'Add sum',
            criteria: ['sum adds two numbers', 'sum of no numbers is zero'],
        })
        const step = only(
            [...rebased(), ...badTest(), ...updated({ round: 1 })],
            ticket
        )

        expect(step).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'red_check_failed',
        })
        if (step.type !== 'mark_stuck') throw new Error(step.type)
        expect(step.detail).toContain('AC2')
    })

    test('a refactor ticket has no test-writer: its bad test is stuck at once, with the reason', () => {
        const refactor = practiceTicket({
            number: 11,
            title: 'Split sum',
            labels: ['ready-for-agent', REFACTOR_LABEL],
        })
        const step = only([...rebased(), ...badTest()], refactor)

        expect(step).toMatchObject({ type: 'mark_stuck', reason: 'bad_test' })
        if (step.type !== 'mark_stuck') throw new Error(step.type)
        expect(step.detail).toContain(REASON)
    })

    test('a retry after the cap resumes with a fresh implementer and fresh counts', () => {
        const rounds = Array.from({ length: MAX_TEST_UPDATES }, (_, index) => [
            ...updated({ round: index + 1 }),
            ...badTest(),
        ]).flat()
        const step = only([
            ...rebased(),
            ...badTest(),
            ...rounds,
            ticketStuck({ ticket: 11, reason: 'bad_test' }),
            stuckReported({ ticket: 11, comment_id: 111 }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])

        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
        })
    })
})

describe("stuck text keeps the implementer's reason (#490)", () => {
    test("the spec comment for a bad test after a rebase quotes the reason, the file, and the test's name", () => {
        const rounds = Array.from({ length: MAX_TEST_UPDATES }, (_, index) => [
            ...updated({ round: index + 1 }),
            ...badTest(),
        ]).flat()
        const entries = [...rebased(), ...badTest(), ...rounds]
        const stuck = only(entries)
        if (stuck.type !== 'mark_stuck') throw new Error(stuck.type)
        const report = only([
            ...entries,
            ticketStuck({
                ticket: 11,
                reason: stuck.reason,
                detail: stuck.detail,
            }),
        ])

        expect(report).toMatchObject({ type: 'report_stuck', ticket: 11 })
        if (report.type !== 'report_stuck') throw new Error(report.type)
        expect(report.body).toContain(REASON)
        expect(report.body).toContain('src/sum.test.ts > sum adds two numbers')
        expect(report.body).not.toContain('no reason given')
    })

    test('the detail names the file and the test, then the reason', () => {
        expect(
            badTestDetail({
                bad_test: {
                    file: 'src/sum.test.ts',
                    name: 'sum > adds',
                    reason: 'Wrong sum.',
                },
            })
        ).toBe('src/sum.test.ts > sum > adds: Wrong sum.')
    })

    test('a long reason is clipped like other outputs', () => {
        const reason = `${'a'.repeat(5000)}${'b'.repeat(5000)}`
        const detail = badTestDetail({
            bad_test: { file: 'f.test.ts', name: 'n', reason },
        })

        expect(detail.length).toBeLessThan(reason.length)
        expect(detail).toContain('[...]')
        expect(detail.startsWith('f.test.ts > n: aaa')).toBe(true)
        expect(detail.endsWith('bbb')).toBe(true)
    })

    test('"no reason given" only when there is no reason', () => {
        expect(badTestDetail({ bad_test: null })).toBe('no reason given')
        expect(
            badTestDetail({
                bad_test: { file: 'f.test.ts', name: '', reason: ' ' },
            })
        ).toBe('f.test.ts: no reason given')
    })
})
