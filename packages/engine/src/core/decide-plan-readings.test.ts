import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentSession,
    epochSeconds,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

const TICKET = practiceTicket({ number: 11 })

const WEEKLY_RESET = '2026-01-04T11:00:00.000Z'
const NEXT_WEEKLY_RESET = '2026-01-11T11:00:00.000Z'

/** Decide on a run with one ticket (#11) and these entries after intake. */
const decideAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET] }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** `n` minutes after the fixtures' time. */
const minute = (n: number): string =>
    new Date(Date.parse('2026-01-01T00:00:00.000Z') + n * 60_000).toISOString()

/**
 * One reading as the launcher journals it: the weekly window at `fill`
 * (0 to 1), resetting at `resets_at`, arrived at `arrived_at` (left out for
 * an older journal's).
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

/** Ticket #11 built and pushed, each agent's session with these readings. */
const builtWithReadings = (
    readings: [
        Record<string, unknown>[],
        Record<string, unknown>[],
        Record<string, unknown>[],
    ]
): JournalEntry[] => {
    const steps = ticketBuilt({ ticket: 11 })
    return [
        runBranchCreated(),
        ...steps.slice(0, 3),
        agentSession({
            ticket: 11,
            role: 'test-writer',
            rate_limit_events: readings[0],
        }),
        ...steps.slice(3, 7),
        agentSession({
            ticket: 11,
            role: 'implementer',
            rate_limit_events: readings[1],
        }),
        ...steps.slice(7, 11),
        agentSession({
            ticket: 11,
            role: 'ticket-reviewer',
            rate_limit_events: readings[2],
        }),
        ...steps.slice(11),
    ]
}

describe('decision step: honest plan-window readings', () => {
    test("a fill level that drops with the same reset time is not a reset: the real run's 62% to 63% records 1 point, not 190", () => {
        const at = (fill: number, n: number) =>
            weekly({ fill, arrived_at: minute(n) })
        const action = decideAfter(
            builtWithReadings([
                [at(0.62, 1), at(0.63, 2), at(0.62, 3)],
                [at(0.63, 4), at(0.62, 5), at(0.63, 6)],
                [at(0.62, 7), at(0.63, 8)],
            ])
        )
        expect(action).toMatchObject({
            type: 'record_usage',
            usage: {
                scope: 'ticket',
                ticket: 11,
                windows: { seven_day: { from: 62, to: 63, used: 1 } },
            },
        })
    })

    test('a changed reset time is counted as a reset, even when the fill level rose', () => {
        const action = decideAfter(
            builtWithReadings([
                [weekly({ fill: 0.2, arrived_at: minute(1) })],
                [weekly({ fill: 0.25, arrived_at: minute(2) })],
                [
                    weekly({
                        fill: 0.3,
                        resets_at: NEXT_WEEKLY_RESET,
                        arrived_at: minute(3),
                    }),
                ],
            ])
        )
        expect(action).toMatchObject({
            type: 'record_usage',
            usage: {
                windows: { seven_day: { from: 20, to: 30, used: 35 } },
            },
        })
    })

    test('an older journal whose readings have no arrival times still records usage, by its reset times', () => {
        const action = decideAfter(
            builtWithReadings([
                [weekly({ fill: 0.62 }), weekly({ fill: 0.63 })],
                [weekly({ fill: 0.62 })],
                [weekly({ fill: 0.63 })],
            ])
        )
        expect(action).toMatchObject({
            type: 'record_usage',
            usage: {
                scope: 'ticket',
                ticket: 11,
                agent_turns: 3,
                windows: { seven_day: { from: 62, to: 63, used: 1 } },
            },
        })
    })
})
