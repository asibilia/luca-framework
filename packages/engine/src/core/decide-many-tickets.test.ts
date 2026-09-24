import { describe, expect, test } from 'bun:test'

import { decide, decideSteps } from './decide'
import { MAX_FIX_ROUNDS, MAX_REJOINS } from './decide-build'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentSession,
    agentStarted,
    billingStopped,
    commitMade,
    finding,
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
    reviewed,
    RUN_BRANCH,
    RUN_BRANCH_PATH,
    runBranchCreated,
    SESSIONS,
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
 * Seam 1 for many tickets in one run: the decision step returns every action
 * that can run now, one per ticket at most.
 */

const SUM = practiceTicket({ number: 11, title: 'Add sum' })
const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })
const AVERAGE = practiceTicket({
    number: 13,
    title: 'Add average',
    blockers: [11, 12],
})

/** Every action that can run now, on a run with these tickets and entries. */
const stepsAfter = ({
    tickets,
    entries,
}: {
    tickets: TicketSnapshot[]
    entries: JournalEntry[]
}) =>
    decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** The same, on a run with #11 and #12 only. */
const twoSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM, PRODUCT], entries })

/** The same, on a run with #11 only. */
const oneSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM], entries })

/** #11 approved, then its join clashed. */
const clashed = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketApproved({ ticket: 11 }),
    joinClashed({ ticket: 11 }),
]

/** #11 rebased after `src/index.ts` clashed. */
const codeClash = (): JournalEntry =>
    ticketRebased({ ticket: 11, cause: 'clash', code: ['src/index.ts'] })

/** After a rebase, the ticket fixed and approved again, up to its green commit. */
const fixedOnRunBranch = (): JournalEntry[] => [
    agentStarted({
        ticket: 11,
        role: 'implementer',
        follow_up_of: SESSIONS.implementer,
    }),
    implemented({ ticket: 11 }),
    gatesRun({ ticket: 11, target: 'ticket', ok: true }),
    leftoverScan({ ticket: 11, stage: 'green' }),
    commitMade({ ticket: 11, stage: 'green' }),
    reviewed({ ticket: 11 }),
]

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
            ...ticketBuilt({ ticket: 12 }).slice(0, 1),
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

describe('decision step: a clash on the run branch', () => {
    test(`the rejoin cap is ${MAX_FIX_ROUNDS}, like the fix loops`, () => {
        expect(MAX_REJOINS).toBe(MAX_FIX_ROUNDS)
    })

    test("a join that clashes puts the ticket's change back on top of the run branch", () => {
        expect(oneSteps(clashed())).toEqual([
            {
                type: 'rebase_ticket',
                ticket: 11,
                cause: 'clash',
                undo_first_sha: null,
            },
        ])
    })

    test('clashed code goes back to the implementer session, naming the files', () => {
        const steps = oneSteps([...clashed(), codeClash()])

        expect(steps).toMatchObject([
            {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'implementer',
                session_id: SESSIONS.implementer,
            },
        ])
        const [step] = steps
        if (step?.type !== 'follow_up_agent') throw new Error(step?.type)
        expect(step.message).toContain('- src/index.ts')
        expect(step.message).toContain('onto-sha')
        expect(step.message).toContain('conflict markers')
    })

    test('clashed tests go to a fresh test-writer, naming the files', () => {
        const steps = oneSteps([
            ...clashed(),
            ticketRebased({
                ticket: 11,
                cause: 'clash',
                tests: ['src/sum.test.ts'],
                code: ['src/index.ts'],
            }),
        ])

        expect(steps).toMatchObject([
            {
                type: 'launch_agent',
                ticket: 11,
                role: 'test-writer',
                may_edit_tests: true,
            },
        ])
        const [step] = steps
        if (step?.type !== 'launch_agent') throw new Error(step?.type)
        expect(step.prompt).toContain('clashed with the run branch')
        expect(step.prompt).toContain('- src/sum.test.ts')
    })

    test('after the test-writer, the clashed code goes to the implementer; no fix round is counted', () => {
        const steps = oneSteps([
            ...clashed(),
            ticketRebased({
                ticket: 11,
                cause: 'clash',
                tests: ['src/sum.test.ts'],
                code: ['src/index.ts'],
            }),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            testsWritten({ ticket: 11, session_id: 'tw-2' }),
        ])

        expect(steps).toMatchObject([
            { type: 'follow_up_agent', role: 'implementer' },
        ])
    })

    test('then the gates run in the ticket worktree', () => {
        expect(
            oneSteps([
                ...clashed(),
                codeClash(),
                ...fixedOnRunBranch().slice(0, 2),
            ])
        ).toEqual([{ type: 'run_gates', ticket: 11, target: 'ticket' }])
    })

    test('passing gates make one new commit that says it rejoins the run branch', () => {
        expect(
            oneSteps([
                ...clashed(),
                codeClash(),
                ...fixedOnRunBranch().slice(0, 3),
            ])
        ).toEqual([
            {
                type: 'commit_ticket',
                ticket: 11,
                stage: 'green',
                message: 'fix: rejoin #11 Add sum onto the run branch',
            },
        ])
    })

    test('then a fresh reviewer re-reviews only the new changes, with the earlier findings', () => {
        const steps = oneSteps([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 10),
            reviewed({
                ticket: 11,
                findings: [
                    finding({
                        id: 'F1',
                        severity: 'nit',
                        title: 'Name the argument',
                    }),
                ],
            }),
            joinClashed({ ticket: 11 }),
            codeClash(),
            ...fixedOnRunBranch().slice(0, 5),
        ])

        expect(steps).toMatchObject([
            { type: 'launch_agent', ticket: 11, role: 'ticket-reviewer' },
        ])
        const [step] = steps
        if (step?.type !== 'launch_agent') throw new Error(step?.type)
        expect(step.prompt).toContain('Re-review only the new changes')
        expect(step.prompt).toContain('- src/index.ts')
        expect(step.prompt).toContain('onto-sha')
        expect(step.prompt).toContain(
            '- F1 [nit, code] (src/sum.ts): Name the argument'
        )
    })

    test('an approved re-review joins again', () => {
        expect(
            oneSteps([...clashed(), codeClash(), ...fixedOnRunBranch()])
        ).toEqual([{ type: 'join_run_branch', ticket: 11 }])
    })

    test('a clashed ticket leaves the join queue, so the next approved ticket joins', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...ticketApproved({ ticket: 11 }),
                ...ticketApproved({ ticket: 12 }),
                joinClashed({ ticket: 11 }),
                codeClash(),
            ])
        ).toMatchObject([
            { type: 'follow_up_agent', ticket: 11, role: 'implementer' },
            { type: 'join_run_branch', ticket: 12 },
        ])
    })

    test('a worktree whose dependencies moved under it gets its install again, before anything else', () => {
        expect(
            oneSteps([
                ...clashed(),
                {
                    kind: 'ticket_rebased',
                    ticket: 11,
                    role: null,
                    content: {
                        cause: 'clash',
                        base_sha: 'onto-sha',
                        tests: [],
                        code: ['src/index.ts'],
                        undone: [],
                        reinstall: true,
                    },
                },
            ])
        ).toEqual([
            { type: 'install_dependencies', target: 'ticket', ticket: 11 },
        ])
    })

    test('failing gates after the join undo the join and put the ticket back on top of the run branch', () => {
        expect(
            oneSteps([
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 12),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ])
        ).toEqual([
            {
                type: 'rebase_ticket',
                ticket: 11,
                cause: 'join_gates',
                undo_first_sha: 'r1',
            },
        ])
    })

    test('after that rebase the gates run in the worktree, and failing, go to the implementer', () => {
        const rebased = [
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 12),
            gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ticketRebased({
                ticket: 11,
                cause: 'join_gates',
                undone: ['r1', 'g1'],
            }),
        ]

        expect(oneSteps(rebased)).toEqual([
            { type: 'run_gates', ticket: 11, target: 'ticket' },
        ])
        expect(
            oneSteps([
                ...rebased,
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
            ])
        ).toMatchObject([
            {
                type: 'follow_up_agent',
                role: 'implementer',
                session_id: SESSIONS.implementer,
                message: expect.stringContaining('The gates failed'),
            },
        ])
    })

    test(`a clash after ${MAX_REJOINS} rebases makes the ticket stuck`, () => {
        const rounds = Array.from({ length: MAX_REJOINS }, () => [
            joinClashed({ ticket: 11 }),
            codeClash(),
            ...fixedOnRunBranch(),
        ]).flat()

        expect(
            oneSteps([
                runBranchCreated(),
                ...ticketApproved({ ticket: 11 }),
                ...rounds,
                joinClashed({ ticket: 11, error: 'CONFLICT again' }),
            ])
        ).toEqual([
            {
                type: 'mark_stuck',
                ticket: 11,
                reason: 'join_failed',
                detail: expect.stringContaining('CONFLICT again'),
            },
        ])
    })

    test('a bad test while fixing on the run branch is stuck: a reset would throw the ticket away', () => {
        expect(
            oneSteps([
                ...clashed(),
                codeClash(),
                agentStarted({
                    ticket: 11,
                    role: 'implementer',
                    follow_up_of: SESSIONS.implementer,
                }),
                implemented({ ticket: 11, outcome: 'bad_test' }),
            ])
        ).toMatchObject([
            { type: 'mark_stuck', ticket: 11, reason: 'bad_test' },
        ])
    })
})

describe('decision step: cleaning up worktrees', () => {
    const allPushed = [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 11 }),
        ...ticketBuilt({ ticket: 12 }),
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

    test('a stuck ticket keeps its worktree; only pushed tickets lose theirs, then the run ends stuck', () => {
        const stuck = [
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }),
            ...ticketBuilt({ ticket: 12 }).slice(0, 12),
            ticketStuck({ ticket: 12, reason: 'join_failed' }),
        ]

        expect(twoSteps(stuck)).toEqual([
            { type: 'remove_worktrees', paths: [ticketPath(11)] },
        ])
        expect(
            twoSteps([...stuck, worktreesRemoved({ paths: [ticketPath(11)] })])
        ).toEqual([
            {
                type: 'done',
                outcome: 'stuck',
                ticket: 12,
                reason: 'join_failed',
                detail: 'why',
            },
        ])
    })

    test('while a ticket is stuck, no other ticket starts or moves on', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 2),
                ticketStuck({ ticket: 11, reason: 'red_check_failed' }),
            ])
        ).toEqual([
            {
                type: 'done',
                outcome: 'stuck',
                ticket: 11,
                reason: 'red_check_failed',
                detail: 'why',
            },
        ])
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
