import { afterEach, describe, expect, test } from 'bun:test'

import { eventRows, harness, runWith } from './board-panel-state-helpers'
import { entry } from './testing/journal-fixture-base'
import {
    autoRetried,
    finalReviewStarted,
    finalReviewStuck,
    stuckReported,
    ticketStuck,
    ticketWorktreeCreated,
    wholeTicket,
} from './testing/journal-fixtures'

/**
 * The engine's automatic retry on the board (#705): its comment is a chat
 * row, Needs you waits for the engine's stuck report rather than the raw
 * stuck record, and an automatic retry leaves nothing to reply to.
 */

afterEach(async () => {
    await harness.cleanup()
})

const TICKET_BODY =
    "Luca retried #13 by itself after agent_failed. If it gets stuck the same way again, it'll wait for a reply."

const FINAL_BODY =
    "Luca retried the final review by itself after agent_failed. If it gets stuck the same way again, it'll wait for a reply."

const runStuck = () =>
    entry({
        kind: 'run_stuck',
        content: {
            reason: 'pull_request_failed',
            detail: 'gh pr create failed: HTTP 422',
        },
    })

const keys = async () => (await harness.state()).needs_you.map(({ key }) => key)

describe('the automatic retry on the board', () => {
    test("an auto_retried record's comment body is a chat row, word for word", async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'agent_failed',
                    detail: 'The implementer failed 3 tries.',
                }),
                autoRetried({
                    item: 'ticket',
                    ticket: 13,
                    reason: 'agent_failed',
                    body: TICKET_BODY,
                }),
            ],
        })

        expect(eventRows().map(({ text }) => text)).toContain(TICKET_BODY)
    })

    test('a raw ticket_stuck or run_stuck makes no Needs-you item until its stuck_reported', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'red_check_failed',
                    detail: 'The red check failed 3 times.',
                }),
            ],
        })
        expect(await keys()).toEqual([])

        const told = await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                stuckReported({ ticket: 13, comment_id: 401 }),
                runStuck(),
            ],
        })
        expect(await keys()).toEqual(['ticket-13'])

        await harness.send({
            run_id,
            token,
            first_seq: told.next_seq,
            entries: [stuckReported({ ticket: null, comment_id: 402 })],
        })
        expect((await keys()).toSorted()).toEqual(['run', 'ticket-13'])
    })

    test('an auto_retried record resolves an older Needs-you item of the same item, and no reply is offered for it', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'agent_failed',
                    detail: 'The implementer failed 3 tries.',
                }),
                stuckReported({ ticket: 13, comment_id: 401 }),
                runStuck(),
                stuckReported({ ticket: null, comment_id: 402 }),
            ],
        })
        expect((await keys()).toSorted()).toEqual(['run', 'ticket-13'])

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                autoRetried({
                    item: 'ticket',
                    ticket: 13,
                    reason: 'agent_failed',
                    comment_id: 451,
                    body: TICKET_BODY,
                }),
                autoRetried({
                    item: 'run',
                    reason: 'pull_request_failed',
                    comment_id: 452,
                    body: "Luca retried the run by itself after pull_request_failed. If it gets stuck the same way again, it'll wait for a reply.",
                }),
            ],
        })

        expect(await keys()).toEqual([])
        const output = await harness.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })
        expect(output).toMatchObject({ ok: false, status: 'refused' })
    })

    test('a stuck final review makes no Needs-you item before its stuck_reported, and its auto_retried leaves no reply to offer', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                finalReviewStarted(),
                finalReviewStuck({
                    reason: 'agent_failed',
                    detail: 'The security lens failed 3 tries.',
                }),
            ],
        })
        expect(await keys()).toEqual([])
        const early = await harness.board.postReply({
            run_id,
            key: 'final',
            reply: 'retry',
        })
        expect(early).toMatchObject({ ok: false, status: 'refused' })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                autoRetried({
                    item: 'final_review',
                    reason: 'agent_failed',
                    body: FINAL_BODY,
                }),
            ],
        })

        expect(await keys()).toEqual([])
        expect(eventRows().map(({ text }) => text)).toContain(FINAL_BODY)
        const output = await harness.board.postReply({
            run_id,
            key: 'final',
            reply: 'retry',
        })
        expect(output).toMatchObject({ ok: false, status: 'refused' })
    })
})
