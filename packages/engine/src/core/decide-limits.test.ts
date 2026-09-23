import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentSession,
    agentStarted,
    billingStopped,
    intakePassed,
    limitWaitEnded,
    limitWaitStarted,
    practiceTicket,
    rateLimitReading,
    runBranchCreated,
    ticketBuilt,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

const TICKET = practiceTicket({ number: 11 })

/** Decide on a run with one ticket (#11) and these entries after intake. */
const decideAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [...intakePassed({ tickets: [TICKET] }), ...entries],
        }),
    })

/** Ticket #11 up to its test-writer's launch, which has not finished. */
const testWriterRunning = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 2),
    agentStarted({ ticket: 11, role: 'test-writer' }),
]

/** The test-writer's turn, cut off with these readings. */
const testWriterSession = (events: Record<string, unknown>[]) =>
    agentSession({ ticket: 11, role: 'test-writer', rate_limit_events: events })

/** A weekly reset three and a half days after the fixtures' time. */
const WEEKLY_RESET = '2026-01-04T11:00:00.000Z'

describe('decision step: plan limits', () => {
    test('allowed and allowed_warning readings change nothing', () => {
        const before = decideAfter(testWriterRunning())
        for (const status of ['allowed', 'allowed_warning'] as const) {
            expect(
                decideAfter([
                    ...testWriterRunning(),
                    testWriterSession([
                        rateLimitReading({
                            status,
                            windows: { five_hour: 0.9 },
                        }),
                    ]),
                ])
            ).toEqual(before)
        }
    })

    test('a rejected limit starts a limit wait until it resets, for the window it names', () => {
        expect(
            decideAfter([
                ...testWriterRunning(),
                testWriterSession([
                    rateLimitReading({ status: 'allowed' }),
                    rateLimitReading({
                        status: 'rejected',
                        rate_limit_type: 'seven_day',
                        resets_at: WEEKLY_RESET,
                    }),
                ]),
            ])
        ).toEqual({
            type: 'start_limit_wait',
            spec_number: 10,
            rate_limit_type: 'seven_day',
            resets_at: WEEKLY_RESET,
            until: '2026-01-04T11:01:00.000Z',
            ticket: 11,
            role: 'test-writer',
            announce: true,
        })
    })

    test('a limit wait under way waits until its end, then the cut-off step is taken again', () => {
        const hit = [
            ...testWriterRunning(),
            testWriterSession([
                rateLimitReading({
                    status: 'rejected',
                    rate_limit_type: 'five_hour',
                    resets_at: '2026-01-01T03:00:00.000Z',
                }),
            ]),
        ]
        const started = limitWaitStarted({
            until: '2026-01-01T03:01:00.000Z',
            resets_at: '2026-01-01T03:00:00.000Z',
        })
        expect(decideAfter([...hit, started])).toEqual({
            type: 'wait_for_limit',
            until: '2026-01-01T03:01:00.000Z',
        })
        expect(
            decideAfter([
                ...hit,
                started,
                limitWaitEnded({ until: '2026-01-01T03:01:00.000Z' }),
            ])
        ).toEqual(decideAfter(testWriterRunning()))
    })

    test("when Opus's weekly cap runs out the whole run waits, then goes on with the same step", () => {
        const opusCap = [
            rateLimitReading({
                status: 'rejected',
                rate_limit_type: 'seven_day_opus',
                resets_at: WEEKLY_RESET,
            }),
        ]
        const action = decideAfter([
            ...testWriterRunning(),
            testWriterSession(opusCap),
        ])
        expect(action).toMatchObject({
            type: 'start_limit_wait',
            rate_limit_type: 'seven_day_opus',
            until: '2026-01-04T11:01:00.000Z',
        })
        expect(
            decideAfter([
                ...testWriterRunning(),
                testWriterSession(opusCap),
                limitWaitStarted({
                    until: '2026-01-04T11:01:00.000Z',
                    resets_at: WEEKLY_RESET,
                    rate_limit_type: 'seven_day_opus',
                }),
                limitWaitEnded({ until: '2026-01-04T11:01:00.000Z' }),
            ])
        ).toEqual(decideAfter(testWriterRunning()))
    })

    test('a rejected limit with no reset time waits a default 15 minutes from the hit', () => {
        expect(
            decideAfter([
                ...testWriterRunning(),
                testWriterSession([rateLimitReading({ status: 'rejected' })]),
            ])
        ).toMatchObject({
            type: 'start_limit_wait',
            resets_at: null,
            until: '2026-01-01T00:15:00.000Z',
            announce: true,
        })
    })

    test('a second wait for the same reset is not announced on the spec again', () => {
        const reading = rateLimitReading({
            status: 'rejected',
            resets_at: '2026-01-01T03:00:00.000Z',
        })
        expect(
            decideAfter([
                ...testWriterRunning(),
                testWriterSession([reading]),
                limitWaitStarted({
                    until: '2026-01-01T03:01:00.000Z',
                    resets_at: '2026-01-01T03:00:00.000Z',
                }),
                limitWaitEnded({ until: '2026-01-01T03:01:00.000Z' }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                testWriterSession([reading]),
            ])
        ).toMatchObject({ type: 'start_limit_wait', announce: false })
    })

    test('overage stops the run at once, even on an allowed or rejected reading', () => {
        const readings = [
            rateLimitReading({ status: 'allowed', is_using_overage: true }),
            rateLimitReading({ status: 'allowed', rate_limit_type: 'overage' }),
            rateLimitReading({
                status: 'rejected',
                rate_limit_type: 'overage',
            }),
            rateLimitReading({
                status: 'rejected',
                resets_at: WEEKLY_RESET,
                is_using_overage: true,
            }),
            { status: 'allowed', overageInUse: true },
        ]
        for (const reading of readings) {
            expect(
                decideAfter([
                    ...testWriterRunning(),
                    testWriterSession([reading]),
                ])
            ).toMatchObject({ type: 'stop_for_billing' })
        }
    })

    test('a billing error stops the run at once', () => {
        expect(
            decideAfter([
                ...testWriterRunning(),
                agentSession({
                    ticket: 11,
                    role: 'test-writer',
                    billing_error: true,
                }),
            ])
        ).toEqual({
            type: 'stop_for_billing',
            reason: 'assistant error billing_error',
        })
    })

    test('a billing stop sticks: the run is over, however often it starts again', () => {
        const entries = [
            ...testWriterRunning(),
            testWriterSession([
                rateLimitReading({ status: 'allowed', is_using_overage: true }),
            ]),
            billingStopped({ reason: 'rate_limit_event isUsingOverage=true' }),
        ]
        expect(decideAfter(entries)).toEqual({
            type: 'done',
            outcome: 'stopped',
            reason: 'rate_limit_event isUsingOverage=true',
        })
    })
})
