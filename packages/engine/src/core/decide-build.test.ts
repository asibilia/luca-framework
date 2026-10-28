import { describe, expect, test } from 'bun:test'

import { decide } from './decide'
import {
    decideAfter,
    decideRefactorAfter,
    stepsUpTo,
    TICKET,
} from './decide-build-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    commitMade,
    dependenciesInstalled,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    nothingNewToTest,
    practiceTicket,
    pullRequestOpened,
    RUN_BRANCH,
    RUN_BRANCH_PATH,
    runBranchCreated,
    SESSIONS,
    ticketPath,
    ticketWorktreeCreated,
    withInstalls,
    worktreesRemoved,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'
import { REFACTOR_LABEL } from '../tracker/tracker'

/**
 * The decision steps for building a ticket: the usual path from the run
 * branch to the PR, and a refactor ticket's path. The fix loops, the empty
 * new tests, the failures, and the run notes are in
 * `decide-build-*.test.ts`, and the helpers they share are in
 * `decide-build-helpers.ts`.
 */

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

    test('a ticket stuck with nothing new to test is told to the spec issue with a refactor hint', () => {
        const action = decideAfter([
            ...stepsUpTo(1),
            nothingNewToTest({ ticket: 11 }),
            {
                kind: 'ticket_stuck',
                ticket: 11,
                role: null,
                content: { reason: 'nothing_new_to_test', detail: 'why' },
            },
        ])
        expect(action).toMatchObject({ type: 'report_stuck', ticket: 11 })
        expect(action.type === 'report_stuck' ? action.body : '').toContain(
            'add the `refactor` label'
        )
    })
})

/** A refactor implementer's bad test that names no file. */
const NO_FILE_BAD_TEST: JournalEntry = {
    kind: 'agent_finished',
    ticket: 11,
    role: 'implementer',
    content: {
        role: 'implementer',
        session_id: SESSIONS.implementer,
        result: {
            outcome: 'bad_test',
            bad_test: { file: '', name: '', reason: 'Wrong sum.' },
            summary: 'Split sum.',
            assumptions: [],
            run_notes: [],
            finding_responses: [],
        },
    },
}

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

    test('its first bad test is not stuck: it goes to a refactor test update (#686)', () => {
        const action = decideRefactorAfter([
            implemented({ ticket: 11, outcome: 'bad_test' }),
        ])

        expect(action.type).not.toBe('mark_stuck')
        expect(JSON.stringify(action)).not.toContain(
            'there is no test-writer to fix it'
        )
    })

    test('a bad test makes it stuck at once: there is no test-writer to send it to', () => {
        // Since #686 only a bad test that names no file is stuck at once.
        const action = decideRefactorAfter([NO_FILE_BAD_TEST])

        expect(action).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'bad_test',
        })
        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(action.detail).toContain('Wrong sum.')
    })

    test('a bad test that names no file is stuck at once, with the reason (#686)', () => {
        const action = decideRefactorAfter([NO_FILE_BAD_TEST])

        if (action.type !== 'mark_stuck') throw new Error(action.type)
        expect(
            action.detail.startsWith(
                'The implementer of a refactor ticket sent a test back as bad without naming its file: '
            )
        ).toBe(true)
        expect(action.detail).toContain('Wrong sum.')
    })
})
