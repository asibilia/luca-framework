import { describe, expect, test } from 'bun:test'

import { parseAgyQuotaReset, runAgyStream } from './agy-stream'

import { sessionSignal } from '../limits/plan-signals'

const encoder = new TextEncoder()

const streamOf = ({ text }: { text: string }): ReadableStream<Uint8Array> =>
    new ReadableStream({
        start(controller) {
            if (text !== '') controller.enqueue(encoder.encode(text))
            controller.close()
        },
    })

describe('parseAgyQuotaReset (#779 AC4)', () => {
    const now_ms = 1_700_000_000_500
    const base_sec = 1_700_000_000

    test.each([
        ['Resets in 2h3m4s', 2 * 3600 + 3 * 60 + 4],
        ['Error: quota exhausted. Resets in 1h 30m', 1 * 3600 + 30 * 60],
        ['Resets in 45m', 45 * 60],
        ['Resets in 20s', 20],
        ['Resets in 1h5s', 3605],
        ['resets in 1H 2M 3S', 3723],
        ['Resets in 0s', 0],
    ])('parses %p into epoch seconds relative to now_ms', (text, delta) => {
        expect(parseAgyQuotaReset({ text, now_ms })).toBe(base_sec + delta)
    })

    test('returns null when reset duration is absent or malformed', () => {
        for (const text of [
            '',
            'Try again later',
            'Resets in ',
            'Resets in unknown time. Retry in 5m',
            'Resets in 5 days',
        ]) {
            expect(parseAgyQuotaReset({ text, now_ms })).toBeNull()
        }
    })
})

describe('agy quota failure & sessionSignal (#779 AC5)', () => {
    test('result ERROR matching quota/429/RESOURCE_EXHAUSTED emits rejected agy_quota event and plan failure', async () => {
        const now_ms = 1_700_000_000_000
        const with_reset = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-q1',
                        status: 'ERROR',
                        error: 'RESOURCE_EXHAUSTED: Model quota reached. Resets in 1h5m.',
                    },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            now: () => now_ms,
        })

        expect(with_reset).toMatchObject({
            ok: false,
            failure: 'plan',
            session_id: 'conv-q1',
        })
        expect(with_reset.session?.rate_limit_events).toEqual([
            {
                status: 'rejected',
                rateLimitType: 'agy_quota',
                resetsAt: 1_700_000_000 + 3900,
                arrived_at: new Date(now_ms).toISOString(),
            },
        ])
        if (with_reset.session === undefined) {
            throw new Error('expected session')
        }
        expect(sessionSignal({ session: with_reset.session })).toEqual({
            kind: 'limit',
            rate_limit_type: 'agy_quota',
            resets_at: 1_700_000_000 + 3900,
        })

        const without_reset = await runAgyStream({
            stdout: streamOf({
                text: JSON.stringify({
                    event: 'result',
                    result: {
                        conversation_id: 'conv-q2',
                        status: 'ERROR',
                        error: 'HTTP 429 Too Many Requests',
                    },
                }),
            }),
            stderr: streamOf({ text: '' }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            now: () => now_ms,
        })

        expect(without_reset.ok).toBe(false)
        expect(without_reset.session?.rate_limit_events).toEqual([
            {
                status: 'rejected',
                rateLimitType: 'agy_quota',
                arrived_at: new Date(now_ms).toISOString(),
            },
        ])
        expect(without_reset.session?.rate_limit_events[0]).not.toHaveProperty(
            'resetsAt'
        )
    })

    test('exit without result whose stderr matches quota regex returns plan failure and sessionSignal limit', async () => {
        const now_ms = 1_700_001_000_000
        const turn = await runAgyStream({
            stdout: streamOf({ text: '' }),
            stderr: streamOf({
                text: 'Fatal: quota exceeded. Resets in 30m\n',
            }),
            exited: Promise.resolve(1),
            kill: () => {},
            role: 'implementer',
            worktree: '/repo',
            is_follow_up: false,
            turn_timeout_ms: 500,
            now: () => now_ms,
        })

        expect(turn).toMatchObject({
            ok: false,
            failure: 'plan',
            error: 'Fatal: quota exceeded. Resets in 30m',
        })
        expect(turn.session?.rate_limit_events).toEqual([
            {
                status: 'rejected',
                rateLimitType: 'agy_quota',
                resetsAt: 1_700_001_000 + 1800,
                arrived_at: new Date(now_ms).toISOString(),
            },
        ])
        if (turn.session === undefined) throw new Error('expected session')
        expect(sessionSignal({ session: turn.session })).toEqual({
            kind: 'limit',
            rate_limit_type: 'agy_quota',
            resets_at: 1_700_001_000 + 1800,
        })
    })
})
