import { afterEach, describe, expect, test } from 'bun:test'

import {
    harness,
    runWith,
    rowsOfKind,
    eventRows,
} from './board-panel-state-helpers'
import {
    agentSession,
    agentStarted,
    limitWaitEnded,
    limitWaitStarted,
    rateLimit,
    runStopped,
    ticketWorktreeCreated,
} from './testing/journal-fixtures'

import { stoppedText } from '../shared/board-state'

/**
 * The board's panel state for limit waits and stopped runs. The helpers are
 * in `board-panel-state-helpers.ts`; the other topics are in the
 * `board-panel-state-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe('limit waits', () => {
    test('a limit wait shows a banner and a limit row with its window, and both clear when it ends', async () => {
        const resets_at = '2026-09-23T17:00:00.000Z'
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentSession({
                    ticket: 11,
                    role: 'implementer',
                    rate_limits: [
                        rateLimit({ type: 'five_hour', utilization: 1 }),
                    ],
                }),
                limitWaitStarted({ resets_at }),
            ],
        })

        const waiting = await harness.state()
        expect(waiting.limit_wait).toEqual({
            resets_at,
            window: 'five-hour',
            since: expect.any(String),
        })
        expect(waiting.run.status).toBe('limit_wait')
        expect(rowsOfKind({ kind: 'luca-board-limit' })[0]?.row).toMatchObject({
            id: `${run_id}-limit`,
            data: {
                status: 'waiting',
                resets_at,
                window: 'five-hour',
                usage: { five_hour_level: 'high' },
            },
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [limitWaitEnded()],
        })

        const over = await harness.state()
        expect(over.limit_wait).toBeNull()
        expect(over.run.status).toBe('building')
        const limit = rowsOfKind({ kind: 'luca-board-limit' })
        expect(limit).toHaveLength(1)
        expect(limit[0]?.row).toMatchObject({
            data: { status: 'over', window: 'five-hour' },
        })
    })

    test.each([
        ['seven_day', 'weekly'],
        ['seven_day_opus', 'weekly Opus'],
        ['seven_day_sonnet', 'weekly Sonnet'],
        ['overage', 'overage'],
    ])('a %s limit reads as the %s window', async (type, words) => {
        await runWith({
            entries: [
                limitWaitStarted({
                    resets_at: '2026-09-26T09:00:00.000Z',
                    rate_limit_type: type,
                }),
            ],
        })

        expect((await harness.state()).limit_wait).toMatchObject({
            window: words,
        })
        expect(rowsOfKind({ kind: 'luca-board-limit' })[0]?.row).toMatchObject({
            data: { window: words },
        })
    })

    test('with no known reset time, the wait shows when the engine wakes', async () => {
        const until = '2026-09-23T17:05:00.000Z'
        await runWith({
            entries: [
                limitWaitStarted({
                    resets_at: null,
                    until,
                    rate_limit_type: null,
                }),
            ],
        })

        expect((await harness.state()).limit_wait).toEqual({
            resets_at: until,
            window: null,
            since: expect.any(String),
        })
    })

    test('the older placeholder shape still reads', async () => {
        const resets_at = '2026-09-23T17:00:00.000Z'
        await runWith({
            entries: [
                {
                    kind: 'limit_wait_started',
                    ticket: null,
                    role: null,
                    content: { resets_at },
                },
            ],
        })

        expect((await harness.state()).limit_wait).toEqual({
            resets_at,
            window: null,
            since: expect.any(String),
        })
    })
})

describe('a stopped run', () => {
    test('run_stopped shows the reason until the engine moves on again', async () => {
        const reason = 'accountInfo: an API key, not a Claude plan'
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                runStopped({ ticket: 11, role: 'test-writer', reason }),
            ],
        })

        const stopped = await harness.state()
        expect(stopped.run.status).toBe('stopped')
        expect(stopped.run.stopped).toEqual({
            reason,
            role: 'test-writer',
            ticket: 11,
            billing: false,
            crashed: false,
            since: expect.any(String),
        })
        expect(await harness.ticket({ number: 11 })).toMatchObject({
            role: null,
            activity: 'run stopped',
        })
        expect(eventRows().at(-1)).toEqual({
            text: `#11: the run stopped: ${reason}. Start it again with the same run id to pick up where it stopped.`,
            tone: 'danger',
        })
        expect(rowsOfKind({ kind: 'luca-board-run' })[0]?.row).toMatchObject({
            data: { status: 'stopped' },
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [agentStarted({ ticket: 11, role: 'test-writer' })],
        })

        const resumed = await harness.state()
        expect(resumed.run.stopped).toBeNull()
        expect(resumed.run.status).toBe('building')
    })

    test('a billing stop says the run will not go on', async () => {
        const reason = 'the session bills per token (overage in use)'
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'implementer' }),
                runStopped({
                    ticket: 11,
                    role: 'implementer',
                    reason,
                    billing: true,
                }),
            ],
        })

        const state = await harness.state()
        expect(state.run.status).toBe('stopped')
        expect(state.run.stopped).toMatchObject({ reason, billing: true })
        const words = `Stopped for billing: ${reason}. This run will not go on; start a new run once per-token billing is off.`
        expect(stoppedText({ reason, billing: true })).toBe(words)
        expect(eventRows().at(-1)).toEqual({
            text: `#11: stopped for billing: ${reason}. This run will not go on; start a new run once per-token billing is off.`,
            tone: 'danger',
        })
    })

    test('a stop after crashes says the run will not go on', async () => {
        const reason =
            'A crash cut off the step `create_run_branch` 3 times in a row.'
        await runWith({
            entries: [
                {
                    kind: 'run_stopped',
                    ticket: null,
                    role: null,
                    content: {
                        reason,
                        role: null,
                        billing: false,
                        crashed: true,
                    },
                },
            ],
        })

        const state = await harness.state()
        expect(state.run.status).toBe('stopped')
        expect(state.run.stopped).toMatchObject({ reason, crashed: true })
        expect(eventRows().at(-1)?.text).toContain('This run will not go on')
    })

    test('a stop with no billing flag is not a billing stop', async () => {
        await runWith({
            entries: [
                {
                    kind: 'run_stopped',
                    ticket: null,
                    role: null,
                    content: { reason: 'x', role: null },
                },
            ],
        })
        expect((await harness.state()).run.stopped).toMatchObject({
            billing: false,
            crashed: false,
        })
        expect(stoppedText({ reason: 'x', billing: false })).toBe(
            'The run stopped: x. Start it again with the same run id to pick up where it stopped.'
        )
    })
})
