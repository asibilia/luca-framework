import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import type { JournalEntry } from '../journal/journal-record'
import { commentRead, replyReceived } from '../testing/build-fixtures'
import { SPEC_OWNER } from '../testing/intake-fixtures'
import {
    BUDGET,
    oneSteps,
    runStuck,
    runStuckReported,
    sumSpent,
    told,
    turnOf,
} from '../testing/run-budget-fixtures'

/**
 * Seam 1 for run budget top-ups (#543): the owner's `retry` on a run stuck
 * on its budget tops it up instead of handing out a whole new budget. A
 * bare `retry` grants half the run budget, rounded down; `retry +500k`,
 * `retry +3M` or `retry +3000000` the amount named. The top-up is
 * journaled with the reply (`top_up`), and replay adds it to the run's
 * allowed tokens. An amount on any other stop, or a zero or unreadable
 * one, is sent back and grants nothing.
 */

/** The owner's `retry` for the run, journaled with the top-up it granted. */
const retryToppedUp = ({
    comment_id,
    top_up,
}: {
    comment_id: number
    top_up: number
}): JournalEntry => ({
    kind: 'reply_received',
    ticket: null,
    role: null,
    content: {
        word: 'retry',
        ticket: null,
        comment_id,
        author: SPEC_OWNER,
        top_up,
    },
})

/** The run stuck for `reason`, and the spec issue told in comment 150. */
const toldOther = (
    reason: 'pull_request_failed' | 'repo_busy'
): JournalEntry[] => [
    ...sumSpent(100),
    {
        kind: 'run_stuck',
        ticket: null,
        role: null,
        content: { reason, detail: 'Stuck for another reason.' },
    },
    runStuckReported(),
]

/** The steps with #11's test-writer having spent `counted` tokens more. */
const afterSpending = (entries: JournalEntry[], counted: number) =>
    oneSteps(
        [...entries, turnOf({ ticket: 11, role: 'test-writer', counted })],
        BUDGET
    )

describe('run budget top-ups: what a retry grants', () => {
    test('a bare `retry` from the spec owner is taken as the reply for the run, with a top-up of half the run budget', () => {
        expect(
            oneSteps(
                [...told(), commentRead({ comment_id: 160, body: 'retry' })],
                BUDGET
            )
        ).toEqual([
            {
                type: 'take_reply',
                comment_id: 160,
                word: 'retry',
                ticket: null,
                top_up: BUDGET / 2,
            },
        ])
    })

    test('a bare `retry` grants half the run budget rounded down: 25,000 of a budget of 50,001', () => {
        expect(
            oneSteps(
                [...told(), commentRead({ comment_id: 160, body: 'retry' })],
                50_001
            )
        ).toMatchObject([
            { type: 'take_reply', comment_id: 160, top_up: 25_000 },
        ])
    })

    test('`retry +500k`, `retry +3M` and `retry +3000000` grant the amount named, with `k` and `M` in any case', () => {
        const amounts: [string, number][] = [
            ['retry +500k', 500_000],
            ['retry +500K', 500_000],
            ['retry +3M', 3_000_000],
            ['retry +3m', 3_000_000],
            ['retry +3000000', 3_000_000],
        ]
        for (const [body, top_up] of amounts) {
            expect(
                oneSteps(
                    [...told(), commentRead({ comment_id: 160, body })],
                    BUDGET
                )
            ).toEqual([
                {
                    type: 'take_reply',
                    comment_id: 160,
                    word: 'retry',
                    ticket: null,
                    top_up,
                },
            ])
        }
    })
})

describe('run budget top-ups: the allowed tokens in replay', () => {
    test('replay adds the top-up journaled with the retry: the run goes stuck again at its budget plus that top-up, no longer at two budgets', () => {
        const retried = [
            ...told(),
            commentRead({ comment_id: 160, body: 'retry +10k' }),
            retryToppedUp({ comment_id: 160, top_up: 10_000 }),
        ]
        expect(afterSpending(retried, 9_999).map(({ type }) => type)).toEqual([
            'run_red_check',
        ])
        expect(afterSpending(retried, 10_000)).toMatchObject([
            { type: 'mark_run_stuck', reason: 'run_budget' },
        ])
    })

    test('a `run_budget` retry journaled with no top-up counts as one whole budget, beside a later retry with a top-up', () => {
        const retried = [
            ...told(),
            commentRead({ comment_id: 160, body: 'retry' }),
            // A retry from before top-ups: no top_up in its record.
            replyReceived({ word: 'retry', ticket: null, comment_id: 160 }),
            turnOf({ ticket: 11, role: 'test-writer', counted: BUDGET }),
            runStuck(),
            {
                kind: 'stuck_reported',
                ticket: null,
                role: null,
                content: { comment_id: 170, body: 'stuck' },
            } satisfies JournalEntry,
            commentRead({ comment_id: 180, body: 'retry +10k' }),
            retryToppedUp({ comment_id: 180, top_up: 10_000 }),
        ]
        // Allowed: one budget, one whole budget for the old retry, and 10,000.
        expect(afterSpending(retried, 9_999).map(({ type }) => type)).toEqual([
            'run_red_check',
        ])
        expect(afterSpending(retried, 10_000)).toMatchObject([
            { type: 'mark_run_stuck', reason: 'run_budget' },
        ])
    })
})

describe('run budget top-ups: amounts that are sent back', () => {
    test('an amount on a run stuck on its pull request or its repo wait is sent back with the reason amount_only_for_run_budget', () => {
        for (const reason of ['pull_request_failed', 'repo_busy'] as const) {
            expect(
                oneSteps(
                    [
                        ...toldOther(reason),
                        commentRead({ comment_id: 160, body: 'retry +3M' }),
                    ],
                    BUDGET
                )
            ).toEqual([
                {
                    type: 'ignore_reply',
                    comment_id: 160,
                    spec_number: 10,
                    reason: 'amount_only_for_run_budget',
                    answer: expect.stringMatching(/\S/),
                },
            ])
        }
    })

    test('a zero, negative or unreadable amount is sent back with the reason bad_amount, and grants nothing: the run keeps waiting', () => {
        for (const body of [
            'retry +0',
            'retry +0k',
            'retry +-500k',
            'retry +1.5M',
            'retry +lots',
        ]) {
            expect(
                oneSteps(
                    [...told(), commentRead({ comment_id: 160, body })],
                    BUDGET
                )
            ).toEqual([
                {
                    type: 'ignore_reply',
                    comment_id: 160,
                    spec_number: 10,
                    reason: 'bad_amount',
                    answer: expect.stringMatching(/\S/),
                },
            ])
        }
        expect(
            oneSteps(
                [
                    ...told(),
                    commentRead({ comment_id: 160, body: 'retry +0' }),
                    {
                        kind: 'reply_ignored',
                        ticket: null,
                        role: null,
                        content: {
                            comment_id: 160,
                            reason: 'bad_amount',
                            answer_id: 161,
                        },
                    } satisfies JournalEntry,
                ],
                BUDGET
            )
        ).toEqual([{ type: 'wait_for_reply', spec_number: 10, since_id: 161 }])
    })
})

describe('the docs on the run budget', () => {
    test('the glossary says a retry adds more tokens to the run budget, not a whole new budget', async () => {
        const root = join(import.meta.dir, '../../../..')
        const glossary = await Bun.file(join(root, 'GLOSSARY.md')).text()
        const entry =
            glossary.match(/^\*\*Run budget\*\*:\n(.+)$/m)?.[1] ?? null

        expect(entry).toMatch(/retry/i)
        expect(entry).toMatch(/more tokens/i)
        expect(entry).toMatch(/not a whole new budget/i)
    })
})
