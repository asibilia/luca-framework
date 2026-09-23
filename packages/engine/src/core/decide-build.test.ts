import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    practiceTicket,
    redCheck,
    reviewed,
    RUN_BRANCH,
    runBranchCreated,
    ticketBuilt,
    ticketWorktreeCreated,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

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

    test('a test-writer with nothing new to test skips the red check and commit', () => {
        expect(
            decideAfter([
                ...stepsUpTo(1),
                {
                    kind: 'agent_finished',
                    ticket: 11,
                    role: 'test-writer',
                    content: {
                        role: 'test-writer',
                        result: { outcome: 'nothing_new_to_test' },
                    },
                },
            ])
        ).toMatchObject({ type: 'launch_agent', role: 'implementer' })
    })
})

describe('decision step: a ticket gets stuck (fix loops come in #363)', () => {
    test('a failed red check makes the ticket stuck, with its problems', () => {
        expect(
            decideAfter([...stepsUpTo(2), redCheck({ ticket: 11, ok: false })])
        ).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'red_check_failed',
            detail: '"sum adds two numbers" passes already',
        })
    })

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

    test('failing gates make the ticket stuck, with the failing output', () => {
        expect(
            decideAfter([
                ...stepsUpTo(6),
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
            ])
        ).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'gates_failed',
            detail: 'test failed:\n1 fail',
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

    test('an implementer that calls a test bad makes the ticket stuck', () => {
        expect(
            decideAfter([
                ...stepsUpTo(5),
                implemented({ ticket: 11, outcome: 'bad_test' }),
            ])
        ).toMatchObject({ type: 'mark_stuck', reason: 'bad_test' })
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
