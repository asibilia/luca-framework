import { describe, expect, test } from 'bun:test'

import { usageFor, type SessionReading } from './plan-usage'

import { epochSeconds } from '../testing/build-fixtures'

/**
 * The usage replay: `usageFor` over agent sessions whose readings carry
 * their arrival time, and each window's fill level and reset time, as the
 * launcher journals them.
 */

const WEEKLY_RESET = '2026-01-04T11:00:00.000Z'
const NEXT_WEEKLY_RESET = '2026-01-11T11:00:00.000Z'

/** `n` minutes after the fixtures' time. */
const minute = (n: number): string =>
    new Date(Date.parse('2026-01-01T00:00:00.000Z') + n * 60_000).toISOString()

/**
 * One reading: the weekly window at `fill` (0 to 1), resetting at
 * `resets_at`, arrived at `arrived_at` (left out for an older journal's).
 */
const weekly = ({
    fill,
    resets_at,
    arrived_at,
}: {
    fill: number
    resets_at?: string
    arrived_at?: string
}): Record<string, unknown> => ({
    status: 'allowed',
    rateLimitType: 'seven_day',
    isUsingOverage: false,
    overageStatus: 'rejected',
    unifiedWindows: {
        seven_day: {
            utilization: fill,
            resetsAt: epochSeconds(resets_at ?? WEEKLY_RESET),
        },
    },
    ...(arrived_at === undefined ? {} : { arrived_at }),
})

const session = ({
    ticket,
    readings,
}: {
    ticket: number | null
    readings: Record<string, unknown>[]
}): SessionReading => ({
    ticket,
    session: {
        usage: {
            input_tokens: 10,
            output_tokens: 100,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        },
        rate_limit_events: readings,
    },
})

describe('usage replay: plan-window readings', () => {
    test('a fill level that drops and rises again with the same reset time is not a reset: 62% to 63% is 1 point, not 190', () => {
        const fills = [0.62, 0.63, 0.62, 0.63, 0.62, 0.63, 0.62, 0.63]
        const usage = usageFor({
            sessions: [
                session({
                    ticket: 11,
                    readings: fills.map((fill, index) =>
                        weekly({ fill, arrived_at: minute(index + 1) })
                    ),
                }),
            ],
            ticket: null,
        })
        expect(usage.windows.seven_day).toEqual({
            from: 62,
            to: 63,
            used: 1,
        })
    })

    test('a changed reset time is a reset, even when the fill level rose', () => {
        const usage = usageFor({
            sessions: [
                session({
                    ticket: 11,
                    readings: [
                        weekly({ fill: 0.2, arrived_at: minute(1) }),
                        weekly({ fill: 0.25, arrived_at: minute(2) }),
                        weekly({
                            fill: 0.3,
                            resets_at: NEXT_WEEKLY_RESET,
                            arrived_at: minute(3),
                        }),
                    ],
                }),
            ],
            ticket: null,
        })
        expect(usage.windows.seven_day).toEqual({
            from: 20,
            to: 30,
            used: 35,
        })
    })

    test('readings replay in arrival order, not the order their sessions were journaled', () => {
        // #12's agent started later but finished first, so its session was
        // journaled before #11's, whose readings arrived earlier.
        const usage = usageFor({
            sessions: [
                session({
                    ticket: 12,
                    readings: [weekly({ fill: 0.64, arrived_at: minute(5) })],
                }),
                session({
                    ticket: 11,
                    readings: [
                        weekly({ fill: 0.62, arrived_at: minute(1) }),
                        weekly({ fill: 0.63, arrived_at: minute(3) }),
                    ],
                }),
            ],
            ticket: null,
        })
        expect(usage.windows.seven_day).toEqual({
            from: 62,
            to: 64,
            used: 2,
        })
    })

    test('readings with no arrival times, from an older journal, replay in journal order without errors', () => {
        const fills = [0.62, 0.63, 0.62, 0.63]
        const usage = usageFor({
            sessions: [
                session({
                    ticket: 11,
                    readings: fills.slice(0, 2).map((fill) => weekly({ fill })),
                }),
                session({
                    ticket: 11,
                    readings: fills.slice(2).map((fill) => weekly({ fill })),
                }),
            ],
            ticket: 11,
        })
        expect(usage).toMatchObject({
            scope: 'ticket',
            ticket: 11,
            agent_turns: 2,
            windows: { seven_day: { from: 62, to: 63, used: 1 } },
        })
    })
})
