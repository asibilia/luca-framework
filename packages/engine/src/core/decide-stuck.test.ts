import { describe, expect, test } from 'bun:test'

import { decideSteps } from './decide'
import { MAX_FIX_ROUNDS } from './decide-build'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    baselineTests,
    commentRead,
    gatesRun,
    implemented,
    intakePassed,
    practiceTicket,
    replyReceived,
    runBranchCreated,
    SESSIONS,
    stuckReported,
    ticketBuilt,
    ticketPath,
    ticketRetried,
    ticketSkipped,
    ticketStuck,
    testsWritten,
    worktreesRemoved,
    RUN_BRANCH_PATH,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1 for stuck work (#366): a stuck ticket is told to the spec's owner
 * on the spec issue, the rest of the run keeps building, and the owner's
 * one-word replies move the stuck ticket on.
 */

const SUM = practiceTicket({ number: 11, title: 'Add sum' })
const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })
const AVERAGE = practiceTicket({
    number: 13,
    title: 'Add average',
    blockers: [11],
})

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

const twoSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM, PRODUCT], entries })

const oneSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM], entries })

/** #11 failed its gates after every fix round. */
const gatesFailedForGood = (): JournalEntry[] => [
    ticketWorktreeCreated({ ticket: 11 }),
    baselineTests({ ticket: 11 }),
    ...ticketBuilt({ ticket: 11 }).slice(2, 6),
    implemented({ ticket: 11 }),
    gatesRun({ ticket: 11, target: 'ticket', ok: false }),
    ...Array.from({ length: MAX_FIX_ROUNDS }, () => [
        agentStarted({
            ticket: 11,
            role: 'implementer',
            follow_up_of: SESSIONS.implementer,
        }),
        implemented({ ticket: 11 }),
        gatesRun({ ticket: 11, target: 'ticket', ok: false }),
    ]).flat(),
    ticketStuck({
        ticket: 11,
        reason: 'gates_failed',
        detail: 'The gates still fail after 3 fix rounds:\ntest: 1 fail',
    }),
]

/** #12 has its worktree and baseline: its test-writer is next. */
const productStarted = (): JournalEntry[] => [
    ticketWorktreeCreated({ ticket: 12 }),
    baselineTests({ ticket: 12 }),
]

describe('a stuck ticket reaches the spec owner', () => {
    test('the spec issue hears which ticket, why, what was tried, the last error, and a suggestion', () => {
        const steps = oneSteps([runBranchCreated(), ...gatesFailedForGood()])

        expect(steps).toEqual([
            {
                type: 'report_stuck',
                ticket: 11,
                spec_number: 10,
                body: expect.any(String),
            },
        ])
        const body = steps[0]?.type === 'report_stuck' ? steps[0].body : ''
        expect(body).toContain('Ticket #11 is stuck: Add sum')
        expect(body).toContain('Why: The checks still fail')
        expect(body).toContain(`Tried: ${MAX_FIX_ROUNDS} fix rounds`)
        expect(body).toContain('test: 1 fail')
        expect(body).toContain('Suggestion:')
        expect(body).toContain(ticketPath(11))
        expect(body).toContain('`retry #11`')
        expect(body).toContain('`skip #11`')
        expect(body).toContain('`stop`')
    })

    test('other tickets keep building while one is stuck', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...productStarted(),
                ...gatesFailedForGood(),
            ]).map(({ type, ...rest }) => [
                type,
                'ticket' in rest ? rest.ticket : null,
            ])
        ).toEqual([
            ['report_stuck', 11],
            ['launch_agent', 12],
        ])
    })

    test('once told, the run waits for a reply beside the tickets that can move', () => {
        const told = [
            runBranchCreated(),
            ...productStarted(),
            ...gatesFailedForGood(),
            stuckReported({ ticket: 11, comment_id: 111 }),
        ]
        expect(twoSteps(told).map(({ type }) => type)).toEqual([
            'launch_agent',
            'wait_for_reply',
        ])
        expect(twoSteps(told).at(-1)).toEqual({
            type: 'wait_for_reply',
            spec_number: 10,
            since_id: 111,
        })
    })

    test('with nothing else able to move, the run only waits: no PR, and no ticket that waits on the stuck one starts', () => {
        expect(
            stepsAfter({
                tickets: [SUM, PRODUCT, AVERAGE],
                entries: [
                    runBranchCreated(),
                    ...ticketBuilt({ ticket: 12 }),
                    ...gatesFailedForGood(),
                    stuckReported({ ticket: 11, comment_id: 111 }),
                ],
            })
        ).toEqual([{ type: 'wait_for_reply', spec_number: 10, since_id: 111 }])
    })

    test('a ticket stuck after its join undoes the join before anything else, so no other ticket builds on it', () => {
        const entries = [
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 12),
            gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ticketStuck({ ticket: 11, reason: 'join_gates_failed' }),
        ]
        expect(twoSteps(entries)).toEqual([
            { type: 'undo_join', ticket: 11, first_sha: 'r1' },
        ])
        expect(
            twoSteps([
                ...entries,
                {
                    kind: 'join_undone',
                    ticket: 11,
                    role: null,
                    content: { shas: ['r1', 'g1'] },
                },
            ]).map(({ type }) => type)
        ).toEqual(['report_stuck', 'create_ticket_worktree'])
    })
})

describe('replies', () => {
    const told = (): JournalEntry[] => [
        runBranchCreated(),
        ...gatesFailedForGood(),
        stuckReported({ ticket: 11, comment_id: 111 }),
    ]

    /** #11 and #12 both stuck and told. */
    const bothTold = (): JournalEntry[] => [
        ...told(),
        ...productStarted(),
        ticketStuck({ ticket: 12, reason: 'red_check_failed' }),
        stuckReported({ ticket: 12, comment_id: 112 }),
    ]

    test('a comment from anyone but the spec owner is ignored', () => {
        expect(
            oneSteps([
                ...told(),
                commentRead({
                    comment_id: 120,
                    author: 'passer-by',
                    body: 'retry',
                }),
            ])
        ).toEqual([{ type: 'wait_for_reply', spec_number: 10, since_id: 120 }])
    })

    test('an owner comment that is not a reply word is ignored', () => {
        expect(
            oneSteps([
                ...told(),
                commentRead({ comment_id: 120, body: 'Looking at it now.' }),
            ])
        ).toEqual([{ type: 'wait_for_reply', spec_number: 10, since_id: 120 }])
    })

    test.each(['retry', 'skip', 'Retry', ' skip. ', 'retry #11', 'skip 11'])(
        'with one ticket stuck, %p from the owner is its reply',
        (body) => {
            expect(
                oneSteps([...told(), commentRead({ comment_id: 120, body })])
            ).toEqual([
                {
                    type: 'take_reply',
                    comment_id: 120,
                    word: body.trim().toLowerCase().startsWith('retry')
                        ? 'retry'
                        : 'skip',
                    ticket: 11,
                },
            ])
        }
    )

    test('`stop` is a reply for the whole run', () => {
        expect(
            oneSteps([
                ...told(),
                commentRead({ comment_id: 120, body: 'stop' }),
            ])
        ).toEqual([
            { type: 'take_reply', comment_id: 120, word: 'stop', ticket: null },
        ])
    })

    test('with more than one ticket stuck, a bare word is sent back asking which ticket', () => {
        expect(
            twoSteps([
                ...bothTold(),
                commentRead({ comment_id: 120, body: 'retry' }),
            ])
        ).toEqual([
            {
                type: 'ignore_reply',
                comment_id: 120,
                spec_number: 10,
                reason: 'no_ticket_named',
                answer: expect.stringContaining('`retry #11`'),
            },
        ])
    })

    test('with more than one ticket stuck, a reply that names one moves only that one', () => {
        expect(
            twoSteps([
                ...bothTold(),
                commentRead({ comment_id: 120, body: 'skip #12' }),
            ])
        ).toEqual([
            { type: 'take_reply', comment_id: 120, word: 'skip', ticket: 12 },
        ])
    })

    test('a reply naming a ticket that is not stuck is sent back', () => {
        expect(
            oneSteps([
                ...told(),
                commentRead({ comment_id: 120, body: 'retry #12' }),
            ])
        ).toEqual([
            {
                type: 'ignore_reply',
                comment_id: 120,
                spec_number: 10,
                reason: 'not_stuck',
                answer: expect.stringContaining('#12 is not stuck'),
            },
        ])
    })

    test('`ship` is only for the final review', () => {
        expect(
            oneSteps([
                ...told(),
                commentRead({ comment_id: 120, body: 'ship' }),
            ])
        ).toEqual([
            {
                type: 'ignore_reply',
                comment_id: 120,
                spec_number: 10,
                reason: 'ship_needs_final_review',
                answer: expect.stringContaining('final review'),
            },
        ])
    })

    test('a reply taken or sent back is never read again', () => {
        const entries = [
            ...bothTold(),
            commentRead({ comment_id: 120, body: 'retry' }),
            {
                kind: 'reply_ignored',
                ticket: null,
                role: null,
                content: {
                    comment_id: 120,
                    reason: 'no_ticket_named',
                    answer_id: 121,
                },
            } satisfies JournalEntry,
        ]
        expect(twoSteps(entries)).toEqual([
            { type: 'wait_for_reply', spec_number: 10, since_id: 121 },
        ])
        expect(
            oneSteps([
                ...told(),
                commentRead({ comment_id: 120, body: 'retry' }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ])
        ).toEqual([{ type: 'retry_ticket', ticket: 11, spec_number: 10 }])
    })
})

describe('retry', () => {
    const retried = (mode: 'resume' | 'restart' | 'refused') => [
        runBranchCreated(),
        ...gatesFailedForGood(),
        stuckReported({ ticket: 11, comment_id: 111 }),
        commentRead({ comment_id: 120, body: 'retry' }),
        replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
        ticketRetried({ ticket: 11, mode }),
    ]

    test('an unchanged ticket resumes with a fresh agent, told why it got stuck, not a follow-up in the old session', () => {
        const [step] = oneSteps(retried('resume'))
        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
        })
        const prompt = step?.type === 'launch_agent' ? step.prompt : ''
        expect(prompt).toContain('This ticket was retried')
        expect(prompt).toContain('keep their changes')
        expect(prompt).toContain('test: 1 fail')
    })

    test('run notes from earlier agents still reach the fresh agent after a retry', () => {
        const [step] = twoSteps([
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 12 }),
            baselineTests({ ticket: 12 }),
            testsWritten({
                ticket: 12,
                run_notes: ['Run lint with --fix before the gates.'],
            }),
            ...gatesFailedForGood(),
            stuckReported({ ticket: 11, comment_id: 111 }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])
        expect(step).toMatchObject({ type: 'launch_agent', ticket: 11 })
        const prompt = step?.type === 'launch_agent' ? step.prompt : ''
        expect(prompt).toContain('## Run notes from earlier agents in this run')
        expect(prompt).toContain(
            'Run lint with --fix before the gates. (test-writer, #12)'
        )
        expect(prompt).toContain('This ticket was retried')
    })

    test('a resumed ticket gets fresh counts: failing gates go back to the fresh agent, not straight to stuck', () => {
        expect(
            oneSteps([
                ...retried('resume'),
                agentStarted({ ticket: 11, role: 'implementer' }),
                implemented({ ticket: 11, session_id: 'impl-2' }),
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
            ])
        ).toEqual([
            {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'implementer',
                session_id: 'impl-2',
                message: expect.any(String),
            },
        ])
    })

    test('a resumed ticket that passes its gates goes on to its green commit', () => {
        expect(
            oneSteps([
                ...retried('resume'),
                agentStarted({ ticket: 11, role: 'implementer' }),
                implemented({ ticket: 11, session_id: 'impl-2' }),
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            ])
        ).toEqual([
            {
                type: 'commit_ticket',
                ticket: 11,
                stage: 'green',
                message: 'feat: build #11 Add sum',
            },
        ])
    })

    test('a ticket whose text or labels changed starts over from scratch, from its new copy', () => {
        const refactor = practiceTicket({
            number: 11,
            title: 'Rename sum',
            labels: ['ready-for-agent', 'refactor'],
        })
        const restarted = [
            runBranchCreated(),
            ...gatesFailedForGood(),
            stuckReported({ ticket: 11, comment_id: 111 }),
            commentRead({ comment_id: 120, body: 'retry' }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            {
                kind: 'ticket_snapshot',
                ticket: 11,
                role: null,
                content: refactor,
            } satisfies JournalEntry,
            ticketRetried({ ticket: 11, mode: 'restart' }),
        ]
        expect(oneSteps(restarted)).toEqual([
            { type: 'install_dependencies', target: 'ticket', ticket: 11 },
        ])
        const [step] = oneSteps([
            ...restarted,
            {
                kind: 'dependencies_installed',
                ticket: 11,
                role: null,
                content: { target: 'ticket', check: null },
            },
            baselineTests({ ticket: 11 }),
        ])
        // The new copy is a refactor ticket: no test-writer, a fresh
        // implementer with the new title, and no retry note.
        expect(step).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
            may_edit_tests: true,
        })
        const prompt = step?.type === 'launch_agent' ? step.prompt : ''
        expect(prompt).toContain('Rename sum')
        expect(prompt).not.toContain('This ticket was retried')
    })

    test('a refused retry leaves the ticket stuck, waiting for the next reply', () => {
        expect(oneSteps(retried('refused'))).toEqual([
            { type: 'wait_for_reply', spec_number: 10, since_id: 120 },
        ])
    })

    test('a ticket stuck in its test step resumes with a fresh test-writer', () => {
        const [step] = oneSteps([
            runBranchCreated(),
            ticketWorktreeCreated({ ticket: 11 }),
            baselineTests({ ticket: 11 }),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            testsWritten({ ticket: 11 }),
            ticketStuck({ ticket: 11, reason: 'red_check_failed' }),
            stuckReported({ ticket: 11 }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])
        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
    })

    test('a ticket stuck after its join undid joins again on retry, with fresh rebases', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 12),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
                ticketStuck({ ticket: 11, reason: 'join_gates_failed' }),
                {
                    kind: 'join_undone',
                    ticket: 11,
                    role: null,
                    content: { shas: ['r1', 'g1'] },
                },
                stuckReported({ ticket: 11 }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
                ticketRetried({ ticket: 11, mode: 'resume' }),
            ])
        ).toEqual([{ type: 'join_run_branch', ticket: 11 }])
    })
})

describe('skip', () => {
    const skippedEleven = (): JournalEntry[] => [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 12 }),
        ...gatesFailedForGood(),
        stuckReported({ ticket: 11, comment_id: 111 }),
        commentRead({ comment_id: 120, body: 'skip' }),
        replyReceived({ word: 'skip', ticket: 11, comment_id: 120 }),
    ]
    const threeSteps = (entries: JournalEntry[]) =>
        stepsAfter({ tickets: [SUM, PRODUCT, AVERAGE], entries })

    test('skip leaves the ticket out, with a comment saying why', () => {
        expect(threeSteps(skippedEleven())).toEqual([
            {
                type: 'skip_ticket',
                ticket: 11,
                because: null,
                body: expect.stringContaining('replied `skip`'),
            },
        ])
    })

    test('the tickets that wait on a skipped ticket are skipped too', () => {
        expect(
            threeSteps([...skippedEleven(), ticketSkipped({ ticket: 11 })])
        ).toEqual([
            {
                type: 'skip_ticket',
                ticket: 13,
                because: 11,
                body: expect.stringContaining('it waits on #11'),
            },
        ])
    })

    test('the rest ships: the final review runs, then the PR closes only the built tickets and lists the skipped ones', () => {
        const skippedAll = [
            ...skippedEleven(),
            ticketSkipped({ ticket: 11 }),
            ticketSkipped({ ticket: 13, because: 11 }),
        ]
        expect(threeSteps(skippedAll)[0]?.type).toBe('start_final_review')
        const [step] = threeSteps([...skippedAll, ...finalReviewClean()])
        expect(step?.type).toBe('open_pull_request')
        const body = step?.type === 'open_pull_request' ? step.body : ''
        expect(body).toContain('Closes #12')
        expect(body).not.toContain('Closes #11')
        expect(body).not.toContain('Closes #13')
        expect(body).toContain('## Skipped tickets')
        expect(body).toContain('#11 Add sum')
        expect(body).toContain('#13 Add average: waits on #11')
    })

    test('with every ticket skipped there is no PR', () => {
        const allSkipped = [
            runBranchCreated(),
            ...gatesFailedForGood(),
            stuckReported({ ticket: 11 }),
            replyReceived({ word: 'skip', ticket: 11, comment_id: 120 }),
            ticketSkipped({ ticket: 11 }),
        ]
        expect(oneSteps(allSkipped)).toEqual([
            {
                type: 'remove_worktrees',
                paths: [ticketPath(11), RUN_BRANCH_PATH],
            },
        ])
        expect(
            oneSteps([
                ...allSkipped,
                worktreesRemoved({ paths: [ticketPath(11), RUN_BRANCH_PATH] }),
            ])
        ).toEqual([{ type: 'done', outcome: 'all_skipped' }])
    })
})

describe('stop', () => {
    test('stop starts nothing new and ends the run without a PR, keeping the branch and unfinished worktrees', () => {
        const stopped = [
            runBranchCreated(),
            ...ticketBuilt({ ticket: 12 }),
            ...gatesFailedForGood(),
            stuckReported({ ticket: 11 }),
            commentRead({ comment_id: 120, body: 'stop' }),
            replyReceived({ word: 'stop', ticket: null, comment_id: 120 }),
        ]
        expect(twoSteps(stopped)).toEqual([
            { type: 'remove_worktrees', paths: [ticketPath(12)] },
        ])
        expect(
            twoSteps([
                ...stopped,
                worktreesRemoved({ paths: [ticketPath(12)] }),
            ])
        ).toEqual([{ type: 'done', outcome: 'stopped_by_user' }])
    })

    test('stop halts tickets that were still building', () => {
        expect(
            twoSteps([
                runBranchCreated(),
                ...productStarted(),
                ...gatesFailedForGood(),
                stuckReported({ ticket: 11 }),
                replyReceived({ word: 'stop', ticket: null, comment_id: 120 }),
            ])
        ).toEqual([{ type: 'done', outcome: 'stopped_by_user' }])
    })
})

describe('a test setup file change', () => {
    test('an agent that needs a test setup file changed makes the ticket stuck with a clear message', () => {
        expect(
            oneSteps([
                runBranchCreated(),
                ticketWorktreeCreated({ ticket: 11 }),
                baselineTests({ ticket: 11 }),
                ...ticketBuilt({ ticket: 11 }).slice(2, 6),
                {
                    kind: 'agent_finished',
                    ticket: 11,
                    role: 'implementer',
                    content: {
                        role: 'implementer',
                        session_id: SESSIONS.implementer,
                        result: {
                            outcome: 'needs_setup_change',
                            setup_change: {
                                file: 'test/setup.ts',
                                reason: 'The fake clock must be installed before each test.',
                            },
                        },
                    },
                },
            ])
        ).toEqual([
            {
                type: 'mark_stuck',
                ticket: 11,
                reason: 'setup_change_needed',
                detail: expect.stringContaining(
                    'The implementer needs the test setup file `test/setup.ts` changed: The fake clock must be installed before each test.'
                ),
            },
        ])
    })
})
