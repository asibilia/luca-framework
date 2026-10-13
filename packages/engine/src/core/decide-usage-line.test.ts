import { describe, expect, test } from 'bun:test'

import { decide, decideSteps } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentSession,
    agentStarted,
    epochSeconds,
    intakePassed,
    limitWaitEnded,
    limitWaitStarted,
    practiceTicket,
    rateLimitReading,
    runBranchCreated,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1 for the usage line (#434): the decision step, handed a journal, the
 * usage lines from the `luca-board` settings (`weekly_line`,
 * `five_hour_line`), and the newest plan-window readings every run shares.
 * Without `usage_lines` there is no usage line, as before.
 */

const TICKET = practiceTicket({ number: 11 })
const SECOND = practiceTicket({ number: 12, title: 'Add product' })

/** The default lines: 80% of the weekly window, 85% of the 5-hour one. */
const LINES = { weekly_line: 80, five_hour_line: 85 }

const WEEKLY_RESET = '2026-01-04T11:00:00.000Z'
const FIVE_HOUR_RESET = '2026-01-01T03:00:00.000Z'

/** `n` minutes after the fixtures' time. */
const minute = (n: number): string =>
    new Date(Date.parse('2026-01-01T00:00:00.000Z') + n * 60_000).toISOString()

/**
 * One reading as the launcher journals it (and as runs share it): `window`
 * at `fill` (0 to 1), resetting at `resets_at`, arrived at `arrived_at`.
 */
const reading = ({
    window,
    fill,
    resets_at,
    arrived_at,
}: {
    window: 'seven_day' | 'five_hour'
    fill: number
    resets_at?: string
    arrived_at: string
}): Record<string, unknown> => ({
    status: 'allowed',
    rateLimitType: window,
    isUsingOverage: false,
    overageStatus: 'rejected',
    unifiedWindows: {
        [window]: {
            utilization: fill,
            resetsAt: epochSeconds(
                resets_at ??
                    (window === 'seven_day' ? WEEKLY_RESET : FIVE_HOUR_RESET)
            ),
        },
    },
    arrived_at,
})

/** The journal of a run with these tickets and these entries after intake. */
const journalOf = ({
    entries,
    tickets,
}: {
    entries: JournalEntry[]
    tickets?: ReturnType<typeof practiceTicket>[]
}) =>
    recordsFrom({
        entries: [
            ...intakePassed({ tickets: tickets ?? [TICKET] }),
            ...withInstalls({ entries }),
        ],
    })

/** Decide with the usage lines on, and these shared readings. */
const decideAt = ({
    entries,
    shared,
    lines,
}: {
    entries: JournalEntry[]
    shared?: Record<string, unknown>[]
    lines?: { weekly_line: number; five_hour_line: number }
}) =>
    decide({
        records: journalOf({ entries }),
        usage_lines: lines ?? LINES,
        shared_readings: shared ?? [],
    })

/** Decide as before the usage line: no lines, no shared readings. */
const decideWithout = (entries: JournalEntry[]) =>
    decide({ records: journalOf({ entries }) })

/** Ticket #11 up to its test-writer's launch. */
const beforeTestWriter = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 2),
]

/** Ticket #11's test-writer finished, with these readings in its session. */
const testWriterDone = (events: Record<string, unknown>[]): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 3),
    agentSession({
        ticket: 11,
        role: 'test-writer',
        rate_limit_events: events,
    }),
]

/** Then its red check, leftover scan, and red commit: the implementer is next. */
const beforeImplementer = (events: Record<string, unknown>[]) => [
    ...testWriterDone(events),
    ...ticketBuilt({ ticket: 11 }).slice(3, 6),
]

describe('decision step: the usage line', () => {
    test('a shared weekly reading at the weekly line starts a usage-line wait instead of the next agent step', () => {
        expect(decideWithout(beforeTestWriter())).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
        // Just under the line changes nothing.
        expect(
            decideAt({
                entries: beforeTestWriter(),
                shared: [
                    reading({
                        window: 'seven_day',
                        fill: 0.79,
                        arrived_at: minute(5),
                    }),
                ],
            })
        ).toEqual(decideWithout(beforeTestWriter()))
        expect(
            decideAt({
                entries: beforeTestWriter(),
                shared: [
                    reading({
                        window: 'seven_day',
                        fill: 0.8,
                        arrived_at: minute(5),
                    }),
                ],
            })
        ).toMatchObject({
            type: 'start_usage_line_wait',
            spec_number: 10,
            window: 'seven_day',
            line: 80,
            percent: 80,
            resets_at: WEEKLY_RESET,
            until: '2026-01-04T11:01:00.000Z',
        })
    })

    test('a five-hour reading at the five-hour line starts a usage-line wait until the five-hour reset', () => {
        const at = (fill: number) => [
            reading({ window: 'five_hour', fill, arrived_at: minute(5) }),
        ]
        // Just under the line changes nothing.
        expect(
            decideAt({ entries: beforeTestWriter(), shared: at(0.84) })
        ).toEqual(decideWithout(beforeTestWriter()))
        expect(
            decideAt({ entries: beforeTestWriter(), shared: at(0.85) })
        ).toMatchObject({
            type: 'start_usage_line_wait',
            window: 'five_hour',
            line: 85,
            percent: 85,
            resets_at: FIVE_HOUR_RESET,
            until: '2026-01-01T03:01:00.000Z',
        })
    })

    test('a raised line lets the run go on: 82% pauses at a weekly line of 80, not at 90', () => {
        const shared = [
            reading({ window: 'seven_day', fill: 0.82, arrived_at: minute(5) }),
        ]
        expect(decideAt({ entries: beforeTestWriter(), shared })).toMatchObject(
            { type: 'start_usage_line_wait', percent: 82 }
        )
        expect(
            decideAt({
                entries: beforeTestWriter(),
                shared,
                lines: { weekly_line: 90, five_hour_line: 85 },
            })
        ).toEqual(decideWithout(beforeTestWriter()))
    })

    test("the run's own reading at the line lets a step that isn't an agent's run, then pauses before the next agent step", () => {
        const events = [
            reading({ window: 'seven_day', fill: 0.82, arrived_at: minute(1) }),
        ]
        // The red check is the engine's own step, not an agent's.
        expect(decideAt({ entries: testWriterDone(events) })).toEqual(
            decideWithout(testWriterDone(events))
        )
        expect(decideWithout(beforeImplementer(events))).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        expect(decideAt({ entries: beforeImplementer(events) })).toMatchObject({
            type: 'start_usage_line_wait',
            window: 'seven_day',
            line: 80,
            percent: 82,
            resets_at: WEEKLY_RESET,
        })
    })

    test("at the line, the usage-line wait is the run's only action, whichever tickets had an agent step next", () => {
        const entries = withInstalls({
            entries: [
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 2),
                ...ticketBuilt({ ticket: 12 }).slice(0, 2),
            ],
        })
        const records = recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET, SECOND] }),
                ...entries,
            ],
        })
        expect(decideSteps({ records })).toHaveLength(2)

        const steps = decideSteps({
            records,
            usage_lines: LINES,
            shared_readings: [
                reading({
                    window: 'seven_day',
                    fill: 0.85,
                    arrived_at: minute(5),
                }),
            ],
        })
        expect(steps).toHaveLength(1)
        expect(steps[0]).toMatchObject({
            type: 'start_usage_line_wait',
            window: 'seven_day',
        })
    })
})

describe('decision step: shared readings, newest first', () => {
    test("a newer shared reading from another run wins over the run's own older one", () => {
        const own = [
            reading({ window: 'seven_day', fill: 0.5, arrived_at: minute(1) }),
        ]
        expect(
            decideAt({
                entries: beforeImplementer(own),
                shared: [
                    reading({
                        window: 'seven_day',
                        fill: 0.82,
                        arrived_at: minute(5),
                    }),
                ],
            })
        ).toMatchObject({
            type: 'start_usage_line_wait',
            window: 'seven_day',
            percent: 82,
        })
    })

    test("an older shared reading loses to the run's own newer one", () => {
        const shared = [
            reading({ window: 'seven_day', fill: 0.82, arrived_at: minute(1) }),
        ]
        // Alone, the shared reading pauses the run.
        expect(
            decideAt({ entries: beforeImplementer([]), shared })
        ).toMatchObject({ type: 'start_usage_line_wait', percent: 82 })
        const own = [
            reading({ window: 'seven_day', fill: 0.5, arrived_at: minute(5) }),
        ]
        expect(decideAt({ entries: beforeImplementer(own), shared })).toEqual(
            decideWithout(beforeImplementer(own))
        )
    })

    test('of two shared readings for one window, the newer one counts, whatever their order', () => {
        const older = reading({
            window: 'five_hour',
            fill: 0.95,
            arrived_at: minute(2),
        })
        const newer = reading({
            window: 'five_hour',
            fill: 0.4,
            arrived_at: minute(7),
        })
        expect(
            decideAt({ entries: beforeTestWriter(), shared: [older] })
        ).toMatchObject({ type: 'start_usage_line_wait', percent: 95 })
        expect(
            decideAt({ entries: beforeTestWriter(), shared: [newer, older] })
        ).toEqual(decideWithout(beforeTestWriter()))
    })
})

describe('decision step: plan limits and overage beside the usage line', () => {
    /** Ticket #11's test-writer cut off with these readings. */
    const cutOff = (events: Record<string, unknown>[]): JournalEntry[] => [
        ...beforeTestWriter(),
        agentStarted({ ticket: 11, role: 'test-writer' }),
        agentSession({
            ticket: 11,
            role: 'test-writer',
            rate_limit_events: events,
        }),
    ]

    const OVER = [
        reading({ window: 'seven_day', fill: 0.9, arrived_at: minute(5) }),
    ]

    test('a rejected plan limit still starts a plan limit wait over the usage line, and the usage line pauses the run after it', () => {
        const hit = cutOff([
            rateLimitReading({
                status: 'rejected',
                rate_limit_type: 'five_hour',
                resets_at: FIVE_HOUR_RESET,
            }),
        ])
        expect(decideAt({ entries: hit, shared: OVER })).toEqual(
            decideWithout(hit)
        )
        expect(decideWithout(hit)).toMatchObject({
            type: 'start_limit_wait',
            rate_limit_type: 'five_hour',
            resets_at: FIVE_HOUR_RESET,
            until: '2026-01-01T03:01:00.000Z',
        })
        const waiting = [
            ...hit,
            limitWaitStarted({
                until: '2026-01-01T03:01:00.000Z',
                resets_at: FIVE_HOUR_RESET,
            }),
        ]
        expect(decideAt({ entries: waiting, shared: OVER })).toEqual({
            type: 'wait_for_limit',
            until: '2026-01-01T03:01:00.000Z',
        })
        // The plan's five-hour window reset; the weekly usage line still holds.
        expect(
            decideAt({
                entries: [
                    ...waiting,
                    limitWaitEnded({ until: '2026-01-01T03:01:00.000Z' }),
                ],
                shared: OVER,
            })
        ).toMatchObject({
            type: 'start_usage_line_wait',
            window: 'seven_day',
            percent: 90,
        })
    })

    test('overage still stops the run at once over the usage line, instead of pausing it', () => {
        expect(
            decideAt({ entries: beforeTestWriter(), shared: OVER })
        ).toMatchObject({ type: 'start_usage_line_wait' })
        const overage = cutOff([
            rateLimitReading({ status: 'allowed', is_using_overage: true }),
        ])
        expect(decideAt({ entries: overage, shared: OVER })).toEqual({
            type: 'stop_for_billing',
            reason: 'rate_limit_event isUsingOverage=true (five_hour)',
        })
    })
})
