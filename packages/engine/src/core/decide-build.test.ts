import { describe, expect, test } from 'bun:test'

import { decide } from './decide'
import {
    MAX_ENGINE_FAILURES,
    MAX_FIX_ROUNDS,
    MAX_RUN_NOTES,
} from './decide-build'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentFailed,
    agentStarted,
    baselineTests,
    commitMade,
    dependenciesInstalled,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    nothingNewToTest,
    practiceTicket,
    pullRequestOpened,
    redCheck,
    RUN_BRANCH,
    RUN_BRANCH_PATH,
    runBranchCreated,
    SESSIONS,
    testsWritten,
    ticketBuilt,
    ticketPath,
    ticketWorktreeCreated,
    withInstalls,
    worktreeReset,
    worktreesRemoved,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'
import { REFACTOR_LABEL } from '../tracker/tracker'

const TICKET = practiceTicket({ number: 11 })

/**
 * Decide on a run with one ticket (#11) and these entries after intake. Each
 * new worktree gets a passing install unless the entries list one.
 */
const decideAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET] }),
                ...withInstalls({ entries }),
            ],
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

    test("then the dependencies are installed in the run branch's checkout", () => {
        expect(
            decide({
                records: recordsFrom({
                    entries: [
                        ...intakePassed({ tickets: [TICKET] }),
                        runBranchCreated(),
                    ],
                }),
            })
        ).toEqual({
            type: 'install_dependencies',
            target: 'run_branch',
            ticket: null,
        })
    })

    test("a failed install in the run branch's checkout makes the first ticket stuck before its worktree", () => {
        expect(
            decideAfter([
                runBranchCreated(),
                dependenciesInstalled({ ok: false }),
            ])
        ).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'install_failed',
            detail: expect.stringContaining(
                "`bun install --frozen-lockfile` failed in the run branch's checkout"
            ),
        })
    })

    test('a new ticket worktree gets its dependencies installed before any test or agent', () => {
        expect(
            decide({
                records: recordsFrom({
                    entries: [
                        ...intakePassed({ tickets: [TICKET] }),
                        runBranchCreated(),
                        dependenciesInstalled({}),
                        ticketWorktreeCreated({ ticket: 11 }),
                    ],
                }),
            })
        ).toEqual({
            type: 'install_dependencies',
            target: 'ticket',
            ticket: 11,
        })
    })

    test('a failed install in a ticket worktree makes the ticket stuck with the output', () => {
        const action = decideAfter([
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 11 }),
            dependenciesInstalled({ ticket: 11, ok: false }),
        ])
        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'install_failed',
        })
        expect(action.type === 'mark_stuck' ? action.detail : '').toContain(
            'lockfile is frozen'
        )
    })

    test('a worktree with no package.json has nothing to install and moves on', () => {
        expect(
            decideAfter([
                runBranchCreated(),
                ticketWorktreeCreated({ ticket: 11 }),
                {
                    kind: 'dependencies_installed',
                    ticket: 11,
                    role: null,
                    content: { target: 'ticket', check: null },
                },
            ])
        ).toEqual({ type: 'run_baseline_tests', ticket: 11 })
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

    test('a test-writer or implementer prompt names its address for agent messages; a reviewer has none', () => {
        const address = (action: ReturnType<typeof decideAfter>) =>
            action.type === 'launch_agent'
                ? /Your address for agent messages: (\S+)/.exec(
                      action.prompt
                  )?.[1]
                : action.type
        expect(address(decideAfter(stepsUpTo(1)))).toBe('test-writer#11')
        expect(address(decideAfter(stepsUpTo(5)))).toBe('implementer#11')
        expect(address(decideAfter(stepsUpTo(9)))).toBeUndefined()
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

    test('once every ticket is pushed, the final review runs, then one PR is opened from the run branch', () => {
        expect(decideAfter(stepsUpTo(13))).toMatchObject({
            type: 'start_final_review',
        })
        const action = decideAfter([...stepsUpTo(13), ...finalReviewClean()])

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

    test('a run with its PR opened removes its worktrees, then is done', () => {
        const opened = [...stepsUpTo(13), pullRequestOpened()]

        expect(decideAfter(opened)).toEqual({
            type: 'remove_worktrees',
            paths: [ticketPath(11), RUN_BRANCH_PATH],
        })
        expect(
            decideAfter([
                ...opened,
                worktreesRemoved({ paths: [ticketPath(11), RUN_BRANCH_PATH] }),
            ])
        ).toEqual({
            type: 'done',
            outcome: 'pr_opened',
            pull_request: {
                number: 99,
                url: 'https://github.com/acme/app/pull/99',
            },
        })
    })

    test('a second ticket also starts from the run branch', () => {
        const second = practiceTicket({ number: 12, title: 'Add product' })
        const records = recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET, second] }),
                ...withInstalls({ entries: stepsUpTo(13) }),
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
                ...withInstalls({
                    entries: [
                        runBranchCreated(),
                        ticketWorktreeCreated({ ticket: 11 }),
                    ],
                }),
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

    test('a join that clashes is not stuck: the ticket is fixed on top of the run branch', () => {
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
            type: 'rebase_ticket',
            ticket: 11,
            cause: 'clash',
            undo_first_sha: null,
        })
    })

    test('failing gates after the join undo it, with no push', () => {
        expect(
            decideAfter([
                ...stepsUpTo(11),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ])
        ).toMatchObject({ type: 'rebase_ticket', cause: 'join_gates' })
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

describe('decision step: failed tries', () => {
    const GUARD_ERROR =
        "The test-writer broke its role's rules, so the engine undid it:\n- wrote src/sum.ts, which a test-writer may not write"

    test('the caps are three failed tries and three engine failures in a row', () => {
        expect(MAX_FIX_ROUNDS).toBe(3)
        expect(MAX_ENGINE_FAILURES).toBe(3)
    })

    test("a test-writer's guard failure goes back to its session with what failed", () => {
        const action = decideAfter([
            ...stepsUpTo(1),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            agentFailed({
                ticket: 11,
                role: 'test-writer',
                failure: 'guard',
                error: GUARD_ERROR,
            }),
        ])

        expect(action).toEqual({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'test-writer',
            session_id: 'tw-1',
            message: expect.stringContaining(
                'Your last turn changed things your role may not change.'
            ),
        })
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).toContain(
            '- wrote src/sum.ts, which a test-writer may not write'
        )
        expect(action.message).toContain(
            'The engine undid every change your role may not make'
        )
    })

    test('after a clean retry the ticket carries on to the red check', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
                agentStarted({
                    ticket: 11,
                    role: 'test-writer',
                    follow_up_of: 'tw-1',
                }),
                testsWritten({ ticket: 11 }),
            ])
        ).toMatchObject({ type: 'run_red_check', ticket: 11 })
    })

    test('a restart after a retry was started sends the same retry again', () => {
        const failed = [
            ...stepsUpTo(1),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            agentFailed({ ticket: 11, role: 'test-writer', failure: 'guard' }),
        ]
        expect(
            decideAfter([
                ...failed,
                agentStarted({
                    ticket: 11,
                    role: 'test-writer',
                    follow_up_of: 'tw-1',
                }),
            ])
        ).toEqual(decideAfter(failed))
    })

    test('a result failure uses one try and goes back to the implementer', () => {
        expect(
            decideAfter([
                ...stepsUpTo(5),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'result',
                    error: 'The implementer finished with no structured output.',
                }),
            ])
        ).toEqual({
            type: 'follow_up_agent',
            ticket: 11,
            role: 'implementer',
            session_id: 'impl-1',
            message: expect.stringContaining(
                'The implementer finished with no structured output.'
            ),
        })
    })

    test('the third failed try makes the ticket stuck, saying so', () => {
        const fail = (error: string) =>
            agentFailed({
                ticket: 11,
                role: 'implementer',
                failure: 'result',
                error,
            })
        const two = [...stepsUpTo(5), fail('first'), fail('second')]

        expect(decideAfter(two)).toMatchObject({ type: 'follow_up_agent' })
        expect(decideAfter([...two, fail('third')])).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'agent_failed',
            detail: 'The implementer failed 3 tries; the last one: third',
        })
    })

    test('failed tries add up over the ticket, even across successes', () => {
        const fail = () =>
            agentFailed({ ticket: 11, role: 'implementer', failure: 'agent' })
        expect(
            decideAfter([
                ...stepsUpTo(5),
                fail(),
                implemented({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
                fail(),
                fail(),
            ])
        ).toMatchObject({ type: 'mark_stuck', reason: 'agent_failed' })
    })

    test('an engine failure launches a fresh agent of the role, without using a try', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'engine',
                }),
            ])
        ).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
            may_edit_tests: true,
        })
        // Two tries used, and the engine failure used none: one try is left.
        expect(
            decideAfter([
                ...stepsUpTo(1),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'engine',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                    session_id: 'tw-2',
                }),
            ])
        ).toMatchObject({ type: 'follow_up_agent', session_id: 'tw-2' })
    })

    test('three engine failures in a row make the ticket stuck', () => {
        const crash = agentFailed({
            ticket: 11,
            role: 'implementer',
            failure: 'engine',
            error: 'The agent session ended with no result.',
            session_id: null,
        })

        expect(decideAfter([...stepsUpTo(5), crash, crash])).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        expect(decideAfter([...stepsUpTo(5), crash, crash, crash])).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'agent_failed',
            detail: 'The engine failed to run the implementer 3 times in a row: The agent session ended with no result.',
        })
    })

    test('an agent finishing ends a run of engine failures', () => {
        const crash = (role: 'test-writer' | 'implementer') =>
            agentFailed({ ticket: 11, role, failure: 'engine' })
        expect(
            decideAfter([
                ...stepsUpTo(1),
                crash('test-writer'),
                crash('test-writer'),
                ...ticketBuilt({ ticket: 11 }).slice(2, 6),
                crash('implementer'),
            ])
        ).toMatchObject({ type: 'launch_agent', role: 'implementer' })
    })

    test("a reviewer's guard failure launches a fresh reviewer", () => {
        expect(
            decideAfter([
                ...stepsUpTo(9),
                agentFailed({
                    ticket: 11,
                    role: 'ticket-reviewer',
                    failure: 'guard',
                }),
            ])
        ).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'ticket-reviewer',
            may_edit_tests: false,
        })
    })

    test('a failed turn with no session gets a fresh launch', () => {
        expect(
            decideAfter([
                ...stepsUpTo(5),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                    session_id: null,
                }),
            ])
        ).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
            may_edit_tests: false,
        })
    })

    test('a retry that finishes in the gates fix loop runs the gates again', () => {
        const gateLoop = [
            ...stepsUpTo(6),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
            agentStarted({
                ticket: 11,
                role: 'implementer',
                follow_up_of: 'impl-1',
            }),
            agentFailed({ ticket: 11, role: 'implementer', failure: 'guard' }),
        ]

        expect(decideAfter(gateLoop)).toMatchObject({
            type: 'follow_up_agent',
            role: 'implementer',
            session_id: 'impl-1',
        })
        expect(decideAfter([...gateLoop, implemented({ ticket: 11 })])).toEqual(
            {
                type: 'run_gates',
                ticket: 11,
                target: 'ticket',
            }
        )
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

describe('decision step: run notes', () => {
    const SECTION = '## Run notes from earlier agents in this run'

    /** Ticket #11 up to its red commit, with the test-writer's notes. */
    const redCommitted = (run_notes: string[]) => [
        runBranchCreated(),
        ticketWorktreeCreated({ ticket: 11 }),
        baselineTests({ ticket: 11 }),
        testsWritten({ ticket: 11, run_notes }),
        redCheck({ ticket: 11, ok: true }),
        leftoverScan({ ticket: 11, stage: 'red' }),
        commitMade({ ticket: 11, stage: 'red' }),
    ]

    const promptOf = (action: ReturnType<typeof decideAfter>): string => {
        if (action.type !== 'launch_agent') throw new Error(action.type)
        return action.prompt
    }

    test("an earlier agent's notes reach a later agent's prompt, with who wrote them", () => {
        const prompt = promptOf(
            decideAfter(redCommitted(['Tests run with bun test.']))
        )
        expect(prompt).toContain(
            `${SECTION}\n\n- Tests run with bun test. (test-writer, #11)`
        )
    })

    test('with no notes yet, the prompt has no notes section', () => {
        expect(promptOf(decideAfter(stepsUpTo(1)))).not.toContain('Run notes')
        expect(promptOf(decideAfter(redCommitted([])))).not.toContain(
            'Run notes'
        )
    })

    test(`only the ${MAX_RUN_NOTES} newest notes are handed on, oldest first`, () => {
        const notes = Array.from({ length: 12 }, (_, index) => `n${index + 1}`)
        const prompt = promptOf(decideAfter(redCommitted(notes)))
        const listed = prompt
            .split('\n')
            .filter((line) => line.endsWith('(test-writer, #11)'))
        expect(listed).toEqual(
            notes.slice(2).map((note) => `- ${note} (test-writer, #11)`)
        )
    })

    test('the same note twice is listed once, where it was last written', () => {
        const prompt = promptOf(
            decideAfter([
                ...redCommitted(['Uses bun.', 'Lint bans console.log.']),
                implemented({ ticket: 11, run_notes: ['Uses bun.'] }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
                leftoverScan({ ticket: 11, stage: 'green' }),
                commitMade({ ticket: 11, stage: 'green' }),
            ])
        )
        expect(prompt).toContain(
            '- Lint bans console.log. (test-writer, #11)\n- Uses bun. (implementer, #11)'
        )
        expect(prompt.match(/Uses bun\./g)).toHaveLength(1)
    })

    test("a later ticket's agents get an earlier ticket's notes", () => {
        const second = practiceTicket({ number: 12, title: 'Add product' })
        const action = decide({
            records: recordsFrom({
                entries: [
                    ...intakePassed({ tickets: [TICKET, second] }),
                    ...withInstalls({
                        entries: [
                            runBranchCreated(),
                            ...ticketBuilt({ ticket: 11 }).map((entry) =>
                                entry.kind === 'agent_finished' &&
                                entry.content.role === 'implementer'
                                    ? implemented({
                                          ticket: 11,
                                          run_notes: [
                                              'Exports go through src/index.ts.',
                                          ],
                                      })
                                    : entry
                            ),
                            ticketWorktreeCreated({ ticket: 12 }),
                            baselineTests({ ticket: 12 }),
                        ],
                    }),
                ],
            }),
        })
        expect(action).toMatchObject({ role: 'test-writer', ticket: 12 })
        expect(promptOf(action)).toContain(
            '- Exports go through src/index.ts. (implementer, #11)'
        )
    })

    test('the reviewer gets the notes too', () => {
        const prompt = promptOf(
            decideAfter([
                ...redCommitted(['Uses bun.']),
                implemented({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
                leftoverScan({ ticket: 11, stage: 'green' }),
                commitMade({ ticket: 11, stage: 'green' }),
            ])
        )
        expect(prompt).toContain('# Your role: ticket-reviewer')
        expect(prompt).toContain('- Uses bun. (test-writer, #11)')
    })

    test('a follow-up does not repeat the notes', () => {
        const action = decideAfter([
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 11 }),
            baselineTests({ ticket: 11 }),
            testsWritten({ ticket: 11, run_notes: ['Uses bun.'] }),
            redCheck({ ticket: 11, ok: false }),
        ])
        if (action.type !== 'follow_up_agent') throw new Error(action.type)
        expect(action.message).not.toContain('Run notes')
    })
})
