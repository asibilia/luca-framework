import { describe, expect, test } from 'bun:test'

import { decide } from './decide'
import { MAX_FIX_ROUNDS } from './decide-build'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    baselineTests,
    commitMade,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    nothingNewToTest,
    practiceTicket,
    redCheck,
    reviewed,
    RUN_BRANCH,
    runBranchCreated,
    SESSIONS,
    testsWritten,
    ticketBuilt,
    ticketWorktreeCreated,
    worktreeReset,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'
import { REFACTOR_LABEL } from '../tracker/tracker'

const TICKET = practiceTicket({ number: 11 })

/** Decide on a run with one ticket (#11) and these entries after intake. */
const decideAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [...intakePassed({ tickets: [TICKET] }), ...entries],
        }),
    })

/** The steps of ticket #11 up to and including the step at `index`. */
const stepsUpTo = (index: number) => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, index + 1),
]

describe('decision step: building a ticket', () => {
    test('once intake passes, the run branch is made from the base branch', () => {
        expect(decideAfter([])).toEqual({
            type: 'create_run_branch',
            spec_number: 10,
            base_branch: 'main',
        })
    })

    test('the first ticket gets its own worktree from the run branch', () => {
        expect(decideAfter([runBranchCreated()])).toEqual({
            type: 'create_ticket_worktree',
            ticket: 11,
            run_branch: RUN_BRANCH,
        })
    })

    test('the old tests are run before any agent works', () => {
        expect(
            decideAfter([
                runBranchCreated(),
                ticketWorktreeCreated({ ticket: 11 }),
            ])
        ).toEqual({ type: 'run_baseline_tests', ticket: 11 })
    })

    test('then the test-writer writes the failing tests', () => {
        expect(decideAfter(stepsUpTo(1))).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
    })

    test("the test-writer's prompt names the ticket and each criterion id", () => {
        const action = decideAfter(stepsUpTo(1))
        if (action.type !== 'launch_agent') throw new Error(action.type)

        expect(action.prompt).toContain('#11')
        expect(action.prompt).toContain('AC1: sum adds two numbers')
    })

    test('the red check runs on the tests the test-writer mapped', () => {
        expect(decideAfter(stepsUpTo(2))).toEqual({
            type: 'run_red_check',
            ticket: 11,
            criteria_ids: ['AC1'],
            mapping: [
                {
                    criterion_id: 'AC1',
                    tests: [
                        {
                            file: 'src/sum.test.ts',
                            name: 'sum adds two numbers',
                        },
                    ],
                },
            ],
        })
    })

    test('a passing red check is committed as the red commit', () => {
        expect(decideAfter(stepsUpTo(3))).toMatchObject({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'red',
            message: expect.stringContaining('#11'),
        })
    })

    test('a clean leftover scan with no commit yet still commits', () => {
        expect(decideAfter(stepsUpTo(4))).toMatchObject({
            type: 'commit_ticket',
            stage: 'red',
        })
    })

    test('after the red commit, the implementer writes the code', () => {
        expect(decideAfter(stepsUpTo(5))).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
        })
    })

    test('after the implementer, the gates run in the ticket worktree', () => {
        expect(decideAfter(stepsUpTo(6))).toEqual({
            type: 'run_gates',
            ticket: 11,
            target: 'ticket',
        })
    })

    test('passing gates are committed as the green commit', () => {
        expect(decideAfter(stepsUpTo(7))).toMatchObject({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'green',
        })
    })

    test('after the green commit, a ticket reviewer checks the ticket', () => {
        expect(decideAfter(stepsUpTo(9))).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'ticket-reviewer',
        })
    })

    test("an approved ticket's commits join the run branch", () => {
        expect(decideAfter(stepsUpTo(10))).toEqual({
            type: 'join_run_branch',
            ticket: 11,
        })
    })

    test('after joining, the gates run again on the run branch', () => {
        expect(decideAfter(stepsUpTo(11))).toEqual({
            type: 'run_gates',
            ticket: 11,
            target: 'run_branch',
        })
    })

    test('passing gates on the run branch push it', () => {
        expect(decideAfter(stepsUpTo(12))).toEqual({
            type: 'push_run_branch',
            ticket: 11,
            branch: RUN_BRANCH,
        })
    })

    test('once every ticket is pushed, one PR is opened from the run branch', () => {
        const action = decideAfter(stepsUpTo(13))

        expect(action).toMatchObject({
            type: 'open_pull_request',
            head: RUN_BRANCH,
            base: 'main',
            title: 'Practice spec (#10)',
        })
        if (action.type !== 'open_pull_request') throw new Error(action.type)
        expect(action.body).toContain('Closes #11')
        expect(action.body).toContain('Numbers are integers.')
    })

    test('a run with its PR opened is done', () => {
        expect(
            decideAfter([
                ...stepsUpTo(13),
                {
                    kind: 'pull_request_opened',
                    ticket: null,
                    role: null,
                    content: {
                        number: 12,
                        url: 'https://github.com/acme/app/pull/12',
                        head: RUN_BRANCH,
                        base: 'main',
                        title: 'Practice spec (#10)',
                        body: '',
                    },
                },
            ])
        ).toEqual({
            type: 'done',
            outcome: 'pr_opened',
            pull_request: {
                number: 12,
                url: 'https://github.com/acme/app/pull/12',
            },
        })
    })

    test('tickets are built one at a time, in snapshot order', () => {
        const second = practiceTicket({ number: 12, title: 'Add product' })
        const records = recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET, second] }),
                ...stepsUpTo(13),
            ],
        })

        expect(decide({ records })).toEqual({
            type: 'create_ticket_worktree',
            ticket: 12,
            run_branch: RUN_BRANCH,
        })
    })

    test('a test-writer with nothing new to test makes the ticket stuck at once, with a hint to add the refactor label', () => {
        const action = decideAfter([
            ...stepsUpTo(1),
            nothingNewToTest({ ticket: 11 }),
        ])

        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'nothing_new_to_test',
        })
        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(action.detail).toContain(`\`${REFACTOR_LABEL}\` label`)
    })

    test('a ticket stuck with nothing new to test ends the run with that reason', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                nothingNewToTest({ ticket: 11 }),
                {
                    kind: 'ticket_stuck',
                    ticket: 11,
                    role: null,
                    content: { reason: 'nothing_new_to_test', detail: 'why' },
                },
            ])
        ).toEqual({
            type: 'done',
            outcome: 'stuck',
            ticket: 11,
            reason: 'nothing_new_to_test',
            detail: 'why',
        })
    })
})

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

    test('a failed red check with no test-writer session to go back to makes the ticket stuck', () => {
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
        ).toMatchObject({ type: 'mark_stuck', reason: 'red_check_failed' })
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

/** Ticket #11 up to its first bad-test bounce and the worktree reset. */
const bounced = (): JournalEntry[] => [
    ...stepsUpTo(5),
    implemented({ ticket: 11, outcome: 'bad_test' }),
    worktreeReset({ ticket: 11 }),
]

/** After the bounce: fresh tests, a passing red check, the second red commit. */
const replaced = (): JournalEntry[] => [
    ...bounced(),
    testsWritten({ ticket: 11, session_id: 'tw-2' }),
    redCheck({ ticket: 11, ok: true }),
    leftoverScan({ ticket: 11, stage: 'red' }),
    commitMade({ ticket: 11, stage: 'red' }),
]

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

const REFACTOR_TICKET = practiceTicket({
    number: 11,
    title: 'Split sum into its own file',
    labels: ['ready-for-agent', REFACTOR_LABEL],
})

/** Decide on a run whose one ticket (#11) is a refactor ticket. */
const decideRefactorAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [REFACTOR_TICKET] }),
                runBranchCreated(),
                ticketWorktreeCreated({ ticket: 11 }),
                baselineTests({ ticket: 11 }),
                ...entries,
            ],
        }),
    })

describe('decision step: a refactor ticket', () => {
    test('skips the test-writer: its implementer may follow renames into tests', () => {
        const action = decideRefactorAfter([])

        expect(action).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
            may_edit_tests: true,
        })
        if (action.type !== 'launch_agent') throw new Error(action.type)
        expect(action.prompt).toContain('refactor ticket')
        expect(action.prompt).toContain('renames')
        expect(action.prompt).toContain('must not change what a test checks')
    })

    test('skips the red check: after the implementer, the gates run', () => {
        expect(decideRefactorAfter([implemented({ ticket: 11 })])).toEqual({
            type: 'run_gates',
            ticket: 11,
            target: 'ticket',
        })
    })

    test('passing gates make its one commit', () => {
        expect(
            decideRefactorAfter([
                implemented({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            ])
        ).toEqual({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'green',
            message: 'refactor: #11 Split sum into its own file',
        })
    })

    test('failing gates go back to its implementer too', () => {
        expect(
            decideRefactorAfter([
                implemented({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
            ])
        ).toMatchObject({
            type: 'follow_up_agent',
            role: 'implementer',
            session_id: SESSIONS.implementer,
        })
    })

    test('then a ticket reviewer checks it', () => {
        expect(
            decideRefactorAfter([
                implemented({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
                leftoverScan({ ticket: 11, stage: 'green' }),
                commitMade({ ticket: 11, stage: 'green' }),
            ])
        ).toMatchObject({ type: 'launch_agent', role: 'ticket-reviewer' })
    })

    test('a bad test makes it stuck at once: there is no test-writer to send it to', () => {
        const action = decideRefactorAfter([
            implemented({ ticket: 11, outcome: 'bad_test' }),
        ])

        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'bad_test',
        })
        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(action.detail).toContain('Wrong sum.')
    })
})

describe('decision step: a ticket gets stuck', () => {
    test('leftovers found before a commit make the ticket stuck, with no commit', () => {
        expect(
            decideAfter([
                ...stepsUpTo(8).slice(0, -1),
                leftoverScan({
                    ticket: 11,
                    stage: 'green',
                    hits: [{ path: 'debug.log', reason: 'a log file' }],
                }),
            ])
        ).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'leftovers_found',
            detail: 'debug.log: a log file',
        })
    })

    test('an agent whose turn failed makes the ticket stuck', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                {
                    kind: 'agent_failed',
                    ticket: 11,
                    role: 'test-writer',
                    content: { role: 'test-writer', error: 'No result.' },
                },
            ])
        ).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'agent_failed',
            detail: 'The test-writer failed: No result.',
        })
    })

    test('a reviewer asking for changes makes the ticket stuck', () => {
        expect(
            decideAfter([
                ...stepsUpTo(9),
                reviewed({ ticket: 11, verdict: 'changes_requested' }),
            ])
        ).toMatchObject({ type: 'mark_stuck', reason: 'changes_requested' })
    })

    test('a join that clashes makes the ticket stuck', () => {
        expect(
            decideAfter([
                ...stepsUpTo(10),
                {
                    kind: 'ticket_joined',
                    ticket: 11,
                    role: null,
                    content: { ok: false, error: 'conflict in src/sum.ts' },
                },
            ])
        ).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'join_failed',
            detail: 'conflict in src/sum.ts',
        })
    })

    test('failing gates after the join make the ticket stuck, with no push', () => {
        expect(
            decideAfter([
                ...stepsUpTo(11),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ])
        ).toMatchObject({ type: 'mark_stuck', reason: 'join_gates_failed' })
    })

    test('a stuck ticket ends the run without a PR', () => {
        expect(
            decideAfter([
                ...stepsUpTo(2),
                redCheck({ ticket: 11, ok: false }),
                {
                    kind: 'ticket_stuck',
                    ticket: 11,
                    role: null,
                    content: { reason: 'red_check_failed', detail: 'why' },
                },
            ])
        ).toEqual({
            type: 'done',
            outcome: 'stuck',
            ticket: 11,
            reason: 'red_check_failed',
            detail: 'why',
        })
    })
})

describe('decision step: crash recovery on the build steps', () => {
    test('an agent that started but never finished is started again', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                {
                    kind: 'agent_started',
                    ticket: 11,
                    role: 'test-writer',
                    content: { role: 'test-writer', prompt: 'p' },
                },
            ])
        ).toMatchObject({ type: 'launch_agent', role: 'test-writer' })
    })
})
