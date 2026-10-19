import { afterEach, describe, expect, test } from 'bun:test'

import { harness, runWith, eventRows } from './board-panel-state-helpers'
import {
    agentMessage,
    agentMessageDelivered,
    agentStarted,
    runStopped,
    ticketWorktreeCreated,
} from './testing/journal-fixtures'

/**
 * The board's panel state for messages to and from agents. The helpers are
 * in `board-panel-state-helpers.ts`; the other topics are in the
 * `board-panel-state-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('agent messages', () => {
    test('messages are counted and shown as rows, but the tickets and the run do not change', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
            ],
        })
        const before = await harness.state()

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                agentMessage({
                    ticket: 11,
                    role: 'test-writer',
                    id: 'msg-1',
                    to: 'implementer#11',
                    text: 'The sum helper lives in src/math.ts.\nKeep its signature.',
                }),
                agentMessage({
                    ticket: 11,
                    role: 'test-writer',
                    id: 'msg-2',
                    to: 'implementer#12',
                    text: 'Heads-up about the fixtures.',
                    status: 'not_delivered',
                    reason: 'implementer#12 already finished',
                }),
                agentMessage({
                    ticket: 11,
                    role: 'test-writer',
                    id: 'msg-3',
                    to: 'reviewer#11',
                    text: 'Go easy on me.',
                    status: 'refused',
                    reason: 'no such address',
                }),
                agentMessageDelivered({
                    ticket: 11,
                    role: 'implementer',
                    ids: ['msg-1'],
                }),
            ],
        })

        const after = await harness.state()
        expect(after.messages).toEqual({ sent: 2, refused: 1, delivered: 1 })
        expect(after.tickets).toEqual(before.tickets)
        expect(after.run.status).toBe(before.run.status)
        expect(after.run.phase).toBe(before.run.phase)
        expect(eventRows().slice(-3)).toEqual([
            {
                text: 'test-writer#11 → implementer#11: The sum helper lives in src/math.ts.',
                tone: 'info',
            },
            {
                text: 'test-writer#11 → implementer#12: Heads-up about the fixtures. (not delivered: implementer#12 already finished)',
                tone: 'warning',
            },
            {
                text: "test-writer#11's message to reviewer#11 was refused: no such address",
                tone: 'warning',
            },
        ])
    })

    test('a long message is clipped to one short line in its row', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentMessage({
                    ticket: 11,
                    role: 'implementer',
                    id: 'msg-1',
                    to: 'all',
                    text: 'x'.repeat(500),
                }),
            ],
        })

        const text = eventRows().at(-1)?.text ?? ''
        expect(text.startsWith('implementer#11 → all: xxx')).toBe(true)
        expect(text.endsWith('…')).toBe(true)
        expect(text.length).toBeLessThan(200)
    })

    test('a message does not count as the engine moving on after a stop', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                runStopped({
                    ticket: 11,
                    role: 'test-writer',
                    reason: 'overage',
                }),
            ],
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                agentMessage({
                    ticket: 11,
                    role: 'test-writer',
                    id: 'msg-1',
                    to: 'implementer#11',
                    text: 'One more thing.',
                }),
                agentMessageDelivered({
                    ticket: 11,
                    role: 'implementer',
                    ids: ['msg-1'],
                }),
            ],
        })

        const state = await harness.state()
        expect(state.run.status).toBe('stopped')
        expect(state.run.stopped).not.toBeNull()
    })
})
