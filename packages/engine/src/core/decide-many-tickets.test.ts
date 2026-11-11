import { describe, expect, test } from 'bun:test'

import { decide } from './decide'
import {
    SUM,
    PRODUCT,
    AVERAGE,
    stepsAfter,
    twoSteps,
    oneSteps,
    clashed,
    codeClash,
    fixedOnRunBranch,
} from './decide-many-tickets-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentSession,
    agentStarted,
    billingStopped,
    commitMade,
    gatesRun,
    implemented,
    intakePassed,
    joinClashed,
    joined,
    leftoverScan,
    limitWaitEnded,
    limitWaitStarted,
    practiceTicket,
    pullRequestOpened,
    pushed,
    rateLimitReading,
    redCheck,
    RUN_BRANCH,
    RUN_BRANCH_PATH,
    runBranchCreated,
    testsWritten,
    ticketApproved,
    ticketBuilt,
    ticketPath,
    ticketRebased,
    ticketStuck,
    withInstalls,
    worktreesRemoved,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * The PR's story turned off (#743), as `pr_story: false` reloads it: these
 * older tests are about what follows the PR with no story step between.
 */
const STORY_OFF: JournalEntry = {
    kind: 'config_reloaded',
    ticket: null,
    role: null,
    content: { changes: [{ field: 'pr_story', from: true, to: false }] },
}

/**
 * Seam 1 for many tickets in one run: the decision step returns every action
 * that can run now, one per ticket at most.
 */

describe('decision step: many tickets at once', () => {
    test('two independent tickets both get their worktree in one step', () => {
        expect(twoSteps([runBranchCreated()])).toEqual([
            {
                type: 'create_ticket_worktree',
                ticket: 11,
                run_branch: RUN_BRANCH,
            },
            {
                type: 'create_ticket_worktree',
                ticket: 12,
                run_branch: RUN_BRANCH,
            },
        ])
    })

    test('two tickets move on together, each with its own next step', () => {
        const steps = twoSteps([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 2),
            // From a newer commit than #11's, so #12 runs its own baseline.
            {
                kind: 'ticket_worktree_created',
                ticket: 12,
                role: null,
                content: {
                    branch: `${RUN_BRANCH}--ticket-12`,
                    path: ticketPath(12),
                    base_sha: 'b1',
                },
            },
        ])

        expect(steps).toMatchObject([
            { type: 'launch_agent', ticket: 11, role: 'test-writer' },
            { type: 'run_baseline_tests', ticket: 12 },
        ])
    })

    test('decide still returns the first step', () => {
        expect(
            decide({
                records: recordsFrom({
                    entries: [
                        ...intakePassed({ tickets: [SUM, PRODUCT] }),
                        ...withInstalls({ entries: [runBranchCreated()] }),
                    ],
                }),
            })
        ).toEqual({
            type: 'create_ticket_worktree',
            ticket: 11,
            run_branch: RUN_BRANCH,
        })
    })

    test('a blocked ticket waits until every blocker has pushed, then gets its worktree', () => {
        const tickets = [SUM, PRODUCT, AVERAGE]

        expect(
            stepsAfter({ tickets, entries: [runBranchCreated()] }).map(
                ({ type, ...rest }) => [type, 'ticket' in rest && rest.ticket]
            )
        ).toEqual([
            ['create_ticket_worktree', 11],
            ['create_ticket_worktree', 12],
        ])
        expect(
            stepsAfter({
                tickets,
                entries: [
                    runBranchCreated(),
                    ...ticketBuilt({ ticket: 11 }),
                    ...ticketBuilt({ ticket: 12 }).slice(0, 3),
                ],
            })
        ).toEqual([
            {
                type: 'run_red_check',
                ticket: 12,
                criteria_ids: ['AC1'],
                mapping: expect.any(Array),
            },
        ])
        expect(
            stepsAfter({
                tickets,
                entries: [
                    runBranchCreated(),
                    ...ticketBuilt({ ticket: 11 }),
                    ...ticketBuilt({ ticket: 12 }),
                ],
            })
        ).toEqual([
            {
                type: 'create_ticket_worktree',
                ticket: 13,
                run_branch: RUN_BRANCH,
            },
        ])
    })

    test('a ticket does not start while another is waiting to join, so it never builds on ungated commits', () => {
        const waiting = practiceTicket({ number: 13, blockers: [11] })

        expect(
            stepsAfter({
                tickets: [SUM, PRODUCT, waiting],
                entries: [
                    runBranchCreated(),
                    ...ticketBuilt({ ticket: 11 }),
                    ...ticketApproved({ ticket: 12 }),
                    joined({ ticket: 12 }),
                ],
            })
        ).toEqual([{ type: 'run_gates', ticket: 12, target: 'run_branch' }])
    })

    test('approved tickets join one at a time, in the order they were approved', () => {
        const bothApproved = [
            runBranchCreated(),
            ...ticketApproved({ ticket: 12 }),
            ...ticketApproved({ ticket: 11 }),
        ]

        expect(twoSteps(bothApproved)).toEqual([
            { type: 'join_run_branch', ticket: 12 },
        ])
        expect(
            twoSteps([
                ...bothApproved,
                ...ticketBuilt({ ticket: 12 }).slice(11),
            ])
        ).toEqual([{ type: 'join_run_branch', ticket: 11 }])
    })

    test('a ticket still building goes on while another joins', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...ticketApproved({ ticket: 11 }),
                ...ticketBuilt({ ticket: 12 }).slice(0, 2),
            ])
        ).toMatchObject([
            { type: 'join_run_branch', ticket: 11 },
            { type: 'launch_agent', ticket: 12, role: 'test-writer' },
        ])
    })

    test('once every ticket has pushed, the final review runs, then one PR opens', () => {
        const allPushed = [
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }),
            ...ticketBuilt({ ticket: 12 }),
        ]
        expect(twoSteps(allPushed)).toMatchObject([
            { type: 'start_final_review', round: 1 },
        ])
        expect(twoSteps([...allPushed, ...finalReviewClean()])).toMatchObject([
            { type: 'open_pull_request', head: RUN_BRANCH },
        ])
    })
})

describe('decision step: cleaning up worktrees', () => {
    const allPushed = [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 11 }),
        ...ticketBuilt({ ticket: 12 }),
        STORY_OFF,
        pullRequestOpened(),
    ]

    test('once the PR is open, every ticket worktree and the run branch worktree are removed', () => {
        expect(twoSteps(allPushed)).toEqual([
            {
                type: 'remove_worktrees',
                paths: [ticketPath(11), ticketPath(12), RUN_BRANCH_PATH],
            },
        ])
    })

    test('then the run is done', () => {
        expect(
            twoSteps([
                ...allPushed,
                worktreesRemoved({
                    paths: [ticketPath(11), ticketPath(12), RUN_BRANCH_PATH],
                }),
            ])
        ).toEqual([
            {
                type: 'done',
                outcome: 'pr_opened',
                pull_request: {
                    number: 99,
                    url: 'https://github.com/acme/app/pull/99',
                },
            },
        ])
    })

    test('a stuck ticket is told to the spec issue while the pushed ticket keeps its worktree until the run ends', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }),
                ...ticketBuilt({ ticket: 12 }).slice(0, 11),
                joinClashed({ ticket: 12 }),
                ticketStuck({ ticket: 12, reason: 'join_failed' }),
            ])
        ).toMatchObject([{ type: 'report_stuck', ticket: 12 }])
    })

    test('while a ticket is stuck, the ticket that does not wait on it keeps building', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 2),
                ticketStuck({ ticket: 11, reason: 'red_check_failed' }),
            ]).map(({ type }) => type)
        ).toEqual(['report_stuck', 'create_ticket_worktree'])
    })

    test('pushed and pushed again after a clash only counts the latest push', () => {
        expect(
            oneSteps([
                ...clashed(),
                codeClash(),
                ...fixedOnRunBranch(),
                joined({ ticket: 11 }),
                gatesRun({ ticket: 11, target: 'run_branch', ok: true }),
                pushed({ ticket: 11 }),
                ...finalReviewClean(),
            ])
        ).toMatchObject([{ type: 'open_pull_request' }])
    })
})

describe('decision step: a plan limit with many tickets in flight', () => {
    const RESET = '2026-01-01T03:00:00.000Z'
    const UNTIL = '2026-01-01T03:01:00.000Z'
    const rejected = [
        rateLimitReading({
            status: 'rejected',
            rate_limit_type: 'five_hour',
            resets_at: RESET,
        }),
    ]
    /** #11's test-writer and #12's implementer both started, neither finished. */
    const bothRunning = (): JournalEntry[] => [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 11 }).slice(0, 2),
        ...ticketBuilt({ ticket: 12 }).slice(0, 6),
        agentStarted({ ticket: 11, role: 'test-writer' }),
        agentStarted({ ticket: 12, role: 'implementer' }),
    ]
    /** Both turns cut off by the plan: only their sessions are journaled. */
    const bothCutOff = (): JournalEntry[] => [
        ...bothRunning(),
        agentSession({
            ticket: 11,
            role: 'test-writer',
            rate_limit_events: rejected,
        }),
        agentSession({
            ticket: 12,
            role: 'implementer',
            rate_limit_events: rejected,
        }),
    ]

    test('a rejected limit is one wait for the whole run: no ticket gets a step meanwhile', () => {
        expect(twoSteps(bothCutOff())).toEqual([
            {
                type: 'start_limit_wait',
                spec_number: 10,
                rate_limit_type: 'five_hour',
                resets_at: RESET,
                until: UNTIL,
                ticket: 12,
                role: 'implementer',
                announce: true,
            },
        ])
        expect(
            twoSteps([
                ...bothCutOff(),
                limitWaitStarted({ until: UNTIL, resets_at: RESET }),
            ])
        ).toEqual([{ type: 'wait_for_limit', until: UNTIL }])
    })

    test('after the wait, every ticket takes the same cut-off step again, using no try or round', () => {
        const before = twoSteps(bothRunning())

        expect(before).toMatchObject([
            { type: 'launch_agent', ticket: 11, role: 'test-writer' },
            { type: 'launch_agent', ticket: 12, role: 'implementer' },
        ])
        expect(
            twoSteps([
                ...bothCutOff(),
                limitWaitStarted({ until: UNTIL, resets_at: RESET }),
                limitWaitEnded({ until: UNTIL }),
            ])
        ).toEqual(before)
    })

    test('a billing sign stops the whole run, whatever else is in flight', () => {
        const billing = [
            ...bothRunning(),
            agentSession({
                ticket: 11,
                role: 'test-writer',
                billing_error: true,
            }),
        ]

        expect(twoSteps(billing)).toMatchObject([{ type: 'stop_for_billing' }])
        const stopped = twoSteps([
            ...billing,
            billingStopped({ reason: 'billing_error' }),
        ])
        // The run's usage first, as it is ending; then it is over.
        expect(stopped).toMatchObject([
            { type: 'record_usage', usage: { scope: 'run' } },
        ])
    })
})

describe('decision step: run notes across tickets building at once', () => {
    /** One ticket's steps up to its red commit, its test-writer leaving these notes. */
    const redCommitted = ({
        ticket,
        run_notes,
    }: {
        ticket: number
        run_notes: string[]
    }): JournalEntry[] => [
        ...ticketBuilt({ ticket }).slice(0, 2),
        testsWritten({ ticket, run_notes }),
        redCheck({ ticket, ok: true }),
        leftoverScan({ ticket, stage: 'red' }),
        commitMade({ ticket, stage: 'red' }),
    ]

    const promptsOf = (steps: ReturnType<typeof twoSteps>) =>
        steps.flatMap((step) =>
            step.type === 'launch_agent' ? [step.prompt] : []
        )

    test("a note from #11's test-writer reaches both implementers launched in the next step", () => {
        const steps = twoSteps([
            runBranchCreated(),
            ...redCommitted({
                ticket: 11,
                run_notes: ['Tests import from src/index.ts.'],
            }),
            ...redCommitted({ ticket: 12, run_notes: [] }),
        ])

        expect(steps).toMatchObject([
            { type: 'launch_agent', ticket: 11, role: 'implementer' },
            { type: 'launch_agent', ticket: 12, role: 'implementer' },
        ])
        for (const prompt of promptsOf(steps)) {
            expect(prompt).toContain(
                '- Tests import from src/index.ts. (test-writer, #11)'
            )
        }
    })

    test("a fresh test-writer fixing #11 on the run branch gets #12's notes", () => {
        const steps = twoSteps([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 12 }).map((entry) =>
                entry.kind === 'agent_finished' &&
                entry.content.role === 'implementer'
                    ? implemented({
                          ticket: 12,
                          run_notes: ['src/index.ts exports every module.'],
                      })
                    : entry
            ),
            ...clashed().slice(1),
            ticketRebased({
                ticket: 11,
                cause: 'clash',
                tests: ['src/sum.test.ts'],
            }),
        ])

        expect(steps).toMatchObject([
            { type: 'launch_agent', ticket: 11, role: 'test-writer' },
        ])
        const [prompt] = promptsOf(steps)
        expect(prompt).toContain('clashed with the run branch')
        expect(prompt).toContain(
            '- src/index.ts exports every module. (implementer, #12)'
        )
    })
})
