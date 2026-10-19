import { afterEach, describe, expect, test } from 'bun:test'

import { harness, runWith, rowsOfKind } from './board-panel-state-helpers'
import {
    finalReviewFixing,
    finalReviewPassed,
    finalReviewStarted,
    finalReviewStuck,
    jevAnswered,
    jevAsked,
    jevFailed,
    lensFinished,
    lensStarted,
    pullRequestOpened,
    replyReceived,
    ticketSkipped,
    ticketStuck,
    ticketWorktreeCreated,
    wholeTicket,
    finalReviewShipped,
    unshownStuckRecord,
} from './testing/journal-fixtures'

/**
 * The board's panel state for the end of a run: the final review, the pull
 * request, and Jev in shadow mode. The helpers are in
 * `board-panel-state-helpers.ts`; the other topics are in the
 * `board-panel-state-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('the pull request', () => {
    test('pull_request_opened marks the run done with the PR url', async () => {
        await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                ...wholeTicket({ ticket: 12 }),
                ...wholeTicket({ ticket: 13 }),
                pullRequestOpened({
                    number: 99,
                    url: 'https://github.com/o/r/pull/99',
                }),
            ],
        })

        const state = await harness.state()
        expect(state.run).toMatchObject({
            status: 'done',
            pr_url: 'https://github.com/o/r/pull/99',
            pr_number: 99,
        })
        expect(state.tickets.map((ticket) => ticket.stage)).toEqual([
            'done',
            'done',
            'done',
        ])
        const header = rowsOfKind({ kind: 'luca-board-run' })[0]?.row
        expect(header).toMatchObject({
            data: {
                status: 'done',
                pr_url: 'https://github.com/o/r/pull/99',
                counts: [{ stage: 'done', count: 3 }],
            },
        })
    })
})

describe('Jev in shadow mode', () => {
    test('its calls are counted quietly: no rows, and the tickets do not change', async () => {
        const { run_id, token, next } = await runWith({
            entries: [ticketWorktreeCreated({ ticket: 11 })],
        })
        const before = await harness.state()
        const rowsBefore = harness.latestRows().length

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                jevAsked({ ticket: 11 }),
                jevAnswered({ ticket: 11, asked_seq: next }),
                jevAsked({ ticket: 11 }),
                jevFailed({ ticket: 11, asked_seq: next + 2 }),
            ],
        })

        const after = await harness.state()
        expect(after.jev).toEqual({ asked: 2, answered: 1, failed: 1 })
        expect(after.tickets).toEqual(before.tickets)
        expect(after.run.status).toBe(before.run.status)
        expect(after.latest).toBe(before.latest)
        expect(harness.latestRows()).toHaveLength(rowsBefore)
    })
})

describe('the final review', () => {
    test('its lenses are a dimmed second stack until every ticket is done or skipped', async () => {
        const { run_id, token, next } = await runWith({
            entries: [...wholeTicket({ ticket: 11 })],
        })

        const early = await harness.state()
        expect(early.final_review).toMatchObject({
            state: 'waiting',
            active: false,
        })
        expect(early.final_review.lenses.map((lens) => lens.name)).toEqual([
            'architecture',
            'simplification',
            'security',
            'integration',
            'rules',
        ])

        const rest = [
            ...wholeTicket({ ticket: 12 }),
            ticketWorktreeCreated({ ticket: 13 }),
            ticketStuck({ ticket: 13, reason: 'gates_failed', detail: '' }),
            replyReceived({ word: 'skip', ticket: 13 }),
            ticketSkipped({ ticket: 13 }),
            finalReviewStarted(),
            lensStarted({ lens: 'security' }),
            lensStarted({ lens: 'rules' }),
            lensFinished({
                lens: 'rules',
                findings: { blocker: 0, should_fix: 0, nit: 2 },
            }),
            lensFinished({
                lens: 'security',
                findings: { blocker: 1, should_fix: 0, nit: 0 },
            }),
        ]
        await harness.send({ run_id, token, first_seq: next, entries: rest })

        const reviewing = await harness.state()
        expect(reviewing.run.status).toBe('final_review')
        expect(reviewing.final_review).toMatchObject({
            state: 'reviewing',
            active: true,
            round: 1,
        })
        expect(
            reviewing.final_review.lenses.map(({ name, state }) => [
                name,
                state,
            ])
        ).toEqual([
            ['architecture', 'waiting'],
            ['simplification', 'waiting'],
            ['security', 'fixing'],
            ['integration', 'waiting'],
            ['rules', 'clean'],
        ])
        expect(
            reviewing.final_review.lenses.find((lens) => lens.name === 'rules')
                ?.findings
        ).toEqual({ blocker: 0, should_fix: 0, nit: 2 })
    })

    test("the engine's ship reply to a stuck final review resolves it and passes the final review", async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                finalReviewStarted(),
                finalReviewFixing({ round: 3 }),
                finalReviewStuck({
                    reason: 'changes_requested',
                    detail: 'security-S1 is still open.',
                }),
                unshownStuckRecord({ kind: 'stuck_reported' }),
            ],
        })
        expect((await harness.state()).needs_you).toEqual([
            expect.objectContaining({
                key: 'final',
                replies: ['retry', 'stop', 'ship'],
            }),
        ])

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                replyReceived({ word: 'ship', ticket: null }),
                finalReviewShipped(),
            ],
        })

        const shipped = await harness.state()
        expect(shipped.needs_you).toEqual([])
        expect(shipped.final_review.state).toBe('passed')
        expect(rowsOfKind({ kind: 'luca-board-stuck' })[0]?.row).toMatchObject({
            data: { status: 'resolved' },
        })
    })

    test("the engine's retry of a stuck final review sends it back to reviewing", async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                finalReviewStarted(),
                finalReviewFixing({ round: 3 }),
                finalReviewStuck({ reason: 'gates_failed', detail: 'red' }),
            ],
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                replyReceived({ word: 'retry', ticket: null }),
                unshownStuckRecord({ kind: 'final_review_retried' }),
            ],
        })

        const retried = await harness.state()
        expect(retried.needs_you).toEqual([])
        expect(retried.final_review.state).toBe('reviewing')
    })

    test('a stuck final review asks for retry, stop, or ship; passing clears it', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                ...wholeTicket({ ticket: 12 }),
                ...wholeTicket({ ticket: 13 }),
                finalReviewStarted(),
                finalReviewFixing({ round: 3 }),
                finalReviewStuck({
                    reason: 'fix_loop_capped',
                    detail: 'The security blocker is still there.',
                }),
            ],
        })

        const stuck = await harness.state()
        expect(stuck.run.status).toBe('stuck')
        expect(stuck.needs_you).toEqual([
            expect.objectContaining({
                key: 'final',
                ticket: null,
                subject: 'The final review is stuck',
                replies: ['retry', 'stop', 'ship'],
                tried: ["Fix round 3/3 on the lenses' findings"],
            }),
        ])
        expect(rowsOfKind({ kind: 'luca-board-stuck' })[0]?.row).toMatchObject({
            id: `${run_id}-stuck-final`,
            data: { status: 'waiting', replies: ['retry', 'stop', 'ship'] },
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                replyReceived({ word: 'retry', ticket: null }),
                finalReviewPassed(),
            ],
        })

        const passed = await harness.state()
        expect(passed.needs_you).toEqual([])
        expect(passed.final_review.state).toBe('passed')
        expect(
            passed.final_review.lenses.every((lens) => lens.state === 'clean')
        ).toBe(true)
        expect(rowsOfKind({ kind: 'luca-board-stuck' })[0]?.row).toMatchObject({
            data: { status: 'resolved', resolution: 'You replied `retry`.' },
        })
    })
})
