import { describe, expect, test } from 'bun:test'

import { MAX_FIX_ROUNDS } from './decide-build'
import {
    SUM,
    PRODUCT,
    AVERAGE,
    stepsAfter,
    twoSteps,
    oneSteps,
    gatesFailedForGood,
    emptyTestForGood,
    productStarted,
} from './decide-stuck-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    commentRead,
    gatesRun,
    replyReceived,
    runBranchCreated,
    stuckReported,
    ticketBuilt,
    ticketPath,
    ticketStuck,
    worktreesRemoved,
} from '../testing/build-fixtures'

/**
 * Seam 1 for stuck work (#366): a stuck ticket is told to the spec's owner
 * on the spec issue, the rest of the run keeps building, and the owner's
 * one-word replies move the stuck ticket on.
 */

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

    test("a bad test the engine found is not blamed on the implementer in the spec issue's comment (#581)", () => {
        const steps = oneSteps([runBranchCreated(), ...emptyTestForGood()])

        const body = steps[0]?.type === 'report_stuck' ? steps[0].body : ''
        expect(body).toContain(
            'Why: A test was sent back as bad (by the implementer, or because it checks nothing), and it cannot go back again.'
        )
        expect(body).not.toContain('The implementer sent')
        expect(body).toContain(
            'A mapped test still checks nothing after a fresh test-writer.'
        )
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
