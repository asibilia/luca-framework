import { describe, expect, test } from 'bun:test'

import { oneSteps } from './decide-stuck-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentFailed,
    agentStarted,
    commentRead,
    replyReceived,
    runBranchCreated,
    ticketBuilt,
    ticketPath,
    worktreesRemoved,
    RUN_BRANCH_PATH,
} from '../testing/build-fixtures'
import {
    finalReviewShipped,
    finalReviewStarted,
    finalReviewStuck,
    lensFinding,
    lensRound,
} from '../testing/final-review-fixtures'

/** Seam 1 for stuck work (#366): a stuck final review. */

describe('the final review (#367)', () => {
    /** #11 pushed; the final review asked for changes, then got stuck. */
    const finalStuck = (): JournalEntry[] => [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 11 }),
        ...lensRound({
            round: 1,
            findings: {
                security: [
                    lensFinding({ id: 'S1', title: 'Sum trusts its input' }),
                ],
            },
        }),
        finalReviewStuck({
            reason: 'changes_requested',
            detail: 'The final review still asks for changes after 3 fix rounds:\nsecurity-S1',
        }),
        worktreesRemoved({ paths: [ticketPath(11)] }),
    ]
    const told = (): JournalEntry[] => [
        ...finalStuck(),
        {
            kind: 'stuck_reported',
            ticket: null,
            role: null,
            content: { comment_id: 150, body: 'stuck' },
        },
    ]
    const reply = (body: string, author?: string): JournalEntry =>
        commentRead({ comment_id: 160, body, author })

    test('a stuck final review is told to the spec issue, with the replies retry, stop, and ship', () => {
        const [step] = oneSteps(finalStuck())
        expect(step).toMatchObject({
            type: 'report_final_review_stuck',
            spec_number: 10,
        })
        const body = step?.type === 'report_final_review_stuck' ? step.body : ''
        expect(body).toContain('The final review is stuck')
        expect(body).toContain('Why: The final review still asks for changes.')
        expect(body).toContain('security-S1')
        expect(body).toContain(RUN_BRANCH_PATH)
        expect(body).toContain('`retry`')
        expect(body).toContain('`stop`')
        expect(body).toContain('`ship`')
        expect(body).not.toContain('`skip')
    })

    test("a lens's failed tries are counted as tries in the stuck comment", () => {
        const lensFailed = (): JournalEntry[] => [
            agentStarted({ ticket: null, role: 'security-lens' }),
            agentFailed({
                ticket: null,
                role: 'security-lens',
                failure: 'agent',
            }),
        ]
        const [step] = oneSteps([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }),
            finalReviewStarted({ round: 1 }),
            ...lensFailed(),
            ...lensFailed(),
            ...lensFailed(),
            finalReviewStuck({ reason: 'agent_failed' }),
            worktreesRemoved({ paths: [ticketPath(11)] }),
        ])
        const body = step?.type === 'report_final_review_stuck' ? step.body : ''
        expect(body).toContain('Tried: 3 failed tries by the security-lens.')
    })

    test('once told, the run waits for a reply', () => {
        expect(oneSteps(told())).toEqual([
            { type: 'wait_for_reply', spec_number: 10, since_id: 150 },
        ])
    })

    test('`ship` from the owner ships the final review, and the PR starts with the open findings', () => {
        expect(oneSteps([...told(), reply('ship')])).toEqual([
            { type: 'take_reply', comment_id: 160, word: 'ship', ticket: null },
        ])
        const shipping = [
            ...told(),
            reply('ship'),
            replyReceived({ word: 'ship', ticket: null, comment_id: 160 }),
        ]
        expect(oneSteps(shipping)).toEqual([{ type: 'ship_final_review' }])
        const [step] = oneSteps([...shipping, finalReviewShipped()])
        expect(step?.type).toBe('open_pull_request')
        const body = step?.type === 'open_pull_request' ? step.body : ''
        expect(body.startsWith('## Open findings')).toBe(true)
        expect(body).toContain('security-S1 Sum trusts its input')
    })

    test('`ship` from anyone else is ignored', () => {
        expect(oneSteps([...told(), reply('ship', 'passer-by')])).toEqual([
            { type: 'wait_for_reply', spec_number: 10, since_id: 160 },
        ])
    })

    test('`retry` restarts the final review fix round with fresh fixers and fresh counts', () => {
        expect(oneSteps([...told(), reply('retry')])).toEqual([
            {
                type: 'take_reply',
                comment_id: 160,
                word: 'retry',
                ticket: null,
            },
        ])
        const retrying = [
            ...told(),
            reply('retry'),
            replyReceived({ word: 'retry', ticket: null, comment_id: 160 }),
        ]
        expect(oneSteps(retrying)).toEqual([{ type: 'retry_final_review' }])
        expect(
            oneSteps([
                ...retrying,
                {
                    kind: 'final_review_retried',
                    ticket: null,
                    role: null,
                    content: {},
                },
            ])
        ).toEqual([{ type: 'start_final_fix', round: 1 }])
    })

    test('an amount after `retry` on the stuck final review is sent back with the reason amount_only_for_run_budget', () => {
        expect(oneSteps([...told(), reply('retry +3M')])).toEqual([
            {
                type: 'ignore_reply',
                comment_id: 160,
                spec_number: 10,
                reason: 'amount_only_for_run_budget',
                answer: expect.stringMatching(/\S/),
            },
        ])
    })

    test('`skip` does not apply to the final review', () => {
        expect(oneSteps([...told(), reply('skip')])).toEqual([
            {
                type: 'ignore_reply',
                comment_id: 160,
                spec_number: 10,
                reason: 'skip_not_for_final_review',
                answer: expect.stringContaining('`ship`'),
            },
        ])
    })

    test('a reply naming a ticket is sent back: only the final review is stuck', () => {
        expect(oneSteps([...told(), reply('retry #11')])).toMatchObject([
            { type: 'ignore_reply', reason: 'not_stuck' },
        ])
    })

    test('`stop` ends the run without a PR', () => {
        expect(
            oneSteps([
                ...told(),
                reply('stop'),
                replyReceived({ word: 'stop', ticket: null, comment_id: 160 }),
            ])
        ).toEqual([{ type: 'done', outcome: 'stopped_by_user' }])
    })
})
