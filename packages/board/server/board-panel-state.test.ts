import { afterEach, describe, expect, test } from 'bun:test'

import {
    harness,
    runWith,
    rowsOfKind,
    eventRows,
    failedGatesRound,
    codedTicket13,
} from './board-panel-state-helpers'
import {
    gatesRun,
    replyIgnored,
    replyReceived,
    ticketRetried,
    ticketSkipped,
    ticketSnapshot,
    ticketStuck,
    ticketWorktreeCreated,
} from './testing/journal-fixtures'

/**
 * The board's panel state, from the journal records the engine sends: stuck
 * work, the "Needs you" list, and the replies the engine reads. The helpers
 * are in `board-panel-state-helpers.ts`; the other topics are in the
 * `board-panel-state-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('stuck work: "Needs you" and stuck rows', () => {
    test('a stuck ticket goes to Needs you with what was tried and the exact replies', async () => {
        const { run_id } = await runWith({
            entries: [
                ...codedTicket13(),
                ...failedGatesRound({ ticket: 13 }),
                gatesRun({ ticket: 13, ok: false }),
                ticketStuck({
                    ticket: 13,
                    reason: 'gates_failed',
                    detail: 'bun test: 2 tests fail in menu.test.ts',
                }),
            ],
        })

        const state = await harness.state()
        expect(state.needs_you).toEqual([
            {
                key: 'ticket-13',
                ticket: 13,
                subject: 'Ticket #13 is stuck: Add the menu item',
                reason: 'The checks failed.',
                detail: 'bun test: 2 tests fail in menu.test.ts',
                tried: [
                    'The checks failed: test',
                    'Fix round 1/3 after the checks',
                    'The checks failed: test',
                ],
                replies: ['retry #13', 'skip #13', 'stop'],
                since: expect.any(String),
            },
        ])
        expect(await harness.ticket({ number: 13 })).toMatchObject({
            stage: 'stuck',
            fix_round: 1,
        })

        const stuck = rowsOfKind({ kind: 'luca-board-stuck' })
        expect(stuck).toHaveLength(1)
        expect(stuck[0]?.row).toMatchObject({
            id: `${run_id}-stuck-13`,
            data: {
                status: 'waiting',
                spec_number: 10,
                replies: ['retry #13', 'skip #13', 'stop'],
            },
        })
    })

    test('the run is stuck only when nothing else is moving', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({ ticket: 13, reason: 'agent_failed', detail: '' }),
            ],
        })
        expect((await harness.state()).run.status).toBe('building')
    })

    test('a skip reply resolves the stuck row in place and skips the ticket', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'red_check_failed',
                    detail: 'x',
                }),
            ],
        })
        expect((await harness.state()).run.status).toBe('stuck')

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                replyReceived({ word: 'skip', ticket: 13 }),
                ticketSkipped({ ticket: 13 }),
            ],
        })

        const state = await harness.state()
        expect(state.needs_you).toEqual([])
        expect(state.tickets.find((t) => t.number === 13)?.stage).toBe(
            'skipped'
        )
        const stuck = rowsOfKind({ kind: 'luca-board-stuck' })
        expect(stuck).toHaveLength(1)
        expect(stuck[0]?.row).toMatchObject({
            id: `${run_id}-stuck-13`,
            data: { status: 'resolved', resolution: 'You replied `skip #13`.' },
        })
    })
})

describe('stuck work: replies the engine reads (#366)', () => {
    /** Ticket 13 stuck on its checks, then the owner's `retry #13`. */
    const stuckThenRetry = async () => {
        const started = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                gatesRun({ ticket: 13, ok: false }),
                ticketStuck({
                    ticket: 13,
                    reason: 'gates_failed',
                    detail: 'bun test: 1 test fails',
                }),
            ],
        })
        const reply = await harness.send({
            run_id: started.run_id,
            token: started.token,
            first_seq: started.next,
            entries: [
                replyReceived({
                    word: 'retry',
                    ticket: 13,
                    comment_id: 9001,
                    author: 'alec',
                }),
            ],
        })
        return { ...started, next: reply.next_seq }
    }

    test('a retry resolves the stuck item; a refused retry puts it back in Needs you', async () => {
        const { run_id, token, next } = await stuckThenRetry()

        const retrying = await harness.state()
        expect(retrying.needs_you).toEqual([])
        expect(await harness.ticket({ number: 13 })).toMatchObject({
            stage: 'building',
            activity: 'retrying',
        })
        expect(rowsOfKind({ kind: 'luca-board-stuck' })[0]?.row).toMatchObject({
            data: {
                status: 'resolved',
                resolution: 'You replied `retry #13`.',
            },
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                ticketSnapshot({ number: 13, title: 'Add the menu item' }),
                ticketRetried({
                    ticket: 13,
                    mode: 'refused',
                    problems: [
                        'No acceptance criteria.',
                        'Missing the ready-for-agent label.',
                    ],
                }),
            ],
        })

        const refused = await harness.state()
        expect(refused.needs_you).toEqual([
            {
                key: 'ticket-13',
                ticket: 13,
                subject: 'Retry of #13 was refused: Add the menu item',
                reason: "Its new text or labels aren't ready to build.",
                detail: 'No acceptance criteria. Missing the ready-for-agent label.',
                tried: ['The checks failed: test'],
                replies: ['retry #13', 'skip #13', 'stop'],
                since: expect.any(String),
            },
        ])
        expect(await harness.ticket({ number: 13 })).toMatchObject({
            stage: 'stuck',
            role: null,
        })
        expect(refused.run.status).toBe('stuck')
        const stuck = rowsOfKind({ kind: 'luca-board-stuck' })
        expect(stuck).toHaveLength(1)
        expect(stuck[0]?.row).toMatchObject({
            id: `${run_id}-stuck-13`,
            data: {
                status: 'waiting',
                replies: ['retry #13', 'skip #13', 'stop'],
            },
        })
        expect(eventRows().at(-1)).toEqual({
            text: "#13: the retry was refused: its new text or labels aren't ready to build. No acceptance criteria. Missing the ready-for-agent label.",
            tone: 'warning',
        })
    })

    test('a restart after an edited ticket starts it over from scratch', async () => {
        const { run_id, token, next } = await stuckThenRetry()
        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                ticketSnapshot({ number: 13, title: 'Add the menu entry' }),
                ticketRetried({ ticket: 13, mode: 'restart' }),
            ],
        })

        expect(await harness.ticket({ number: 13 })).toMatchObject({
            title: 'Add the menu entry',
            stage: 'building',
            activity: 'starting over from the edited ticket',
        })
        expect((await harness.state()).needs_you).toEqual([])
        expect(eventRows().at(-1)).toEqual({
            text: '#13: starts over from the edited ticket.',
            tone: 'info',
        })
    })

    test('a resume is quiet: no row beyond the reply', async () => {
        const { run_id, token, next } = await stuckThenRetry()
        const rowsBefore = harness.latestRows().length
        const before = await harness.ticket({ number: 13 })
        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [ticketRetried({ ticket: 13, mode: 'resume' })],
        })
        expect(await harness.ticket({ number: 13 })).toEqual(before)
        expect(harness.latestRows()).toHaveLength(rowsBefore)
    })

    test('a ticket skipped because it waits on a skipped ticket goes to Skipped', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ticketStuck({ ticket: 11, reason: 'agent_failed', detail: '' }),
                replyReceived({ word: 'skip', ticket: 11 }),
                ticketSkipped({ ticket: 11 }),
                ticketSkipped({ ticket: 12, because: 11 }),
            ],
        })

        const state = await harness.state()
        expect(state.needs_you).toEqual([])
        expect(await harness.ticket({ number: 12 })).toMatchObject({
            stage: 'skipped',
            activity: 'skipped: waits on skipped #11',
        })
        expect(eventRows().at(-1)).toEqual({
            text: '#12: skipped, since it waits on #11, which was skipped. It stays open for a later run.',
            tone: 'info',
        })
    })

    test('a setup-change stuck says only the owner may change a test setup file', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({
                    ticket: 13,
                    reason: 'setup_change_needed',
                    detail: 'test/setup.ts needs a new global',
                }),
            ],
        })
        expect((await harness.state()).needs_you[0]).toMatchObject({
            reason: 'An agent needs a test setup file changed; only you may change one.',
            detail: 'test/setup.ts needs a new global',
        })
    })

    test('an ignored reply adds a row and changes nothing on the panel', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 13 }),
                ticketStuck({ ticket: 13, reason: 'gates_failed', detail: '' }),
            ],
        })
        const before = await harness.state()
        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [replyIgnored({ reason: 'no_ticket_named' })],
        })

        const after = await harness.state()
        expect(after.needs_you).toEqual(before.needs_you)
        expect(after.tickets).toEqual(before.tickets)
        expect(eventRows().at(-1)).toEqual({
            text: 'Your reply was sent back: name the ticket, like `retry #13`. The answer is on the spec issue.',
            tone: 'warning',
        })
    })
})
