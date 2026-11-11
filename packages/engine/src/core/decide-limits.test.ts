import { describe, expect, test } from 'bun:test'

import { decideAfter, testWriterRunning } from './decide-limits-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    LIMIT_WAIT_NAP_MS,
    waitUntil,
    type EngineClock,
} from '../limits/limit-wait'
import {
    agentSession,
    agentStarted,
    billingStopped,
    commitMade,
    finding,
    gatesRun,
    implemented,
    leftoverScan,
    limitWaitEnded,
    limitWaitStarted,
    rateLimitReading,
    reviewed,
    runBranchCreated,
    ticketBuilt,
} from '../testing/build-fixtures'

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

    test('a billing stop sticks: the run records its usage, then is over however often it starts again', () => {
        const entries = [
            ...testWriterRunning(),
            testWriterSession([
                rateLimitReading({ status: 'allowed', is_using_overage: true }),
            ]),
            billingStopped({ reason: 'rate_limit_event isUsingOverage=true' }),
        ]
        expect(decideAfter(entries)).toMatchObject({
            type: 'record_usage',
            usage: { scope: 'run' },
        })
        const runUsage: JournalEntry = {
            kind: 'usage_recorded',
            ticket: null,
            role: null,
            content: {
                scope: 'run',
                ticket: null,
                agent_turns: 1,
                tokens: {
                    input_tokens: 10,
                    output_tokens: 100,
                    cache_read_input_tokens: 0,
                    cache_creation_input_tokens: 0,
                },
                windows: {},
            },
        }
        expect(decideAfter([...entries, runUsage])).toEqual({
            type: 'done',
            outcome: 'stopped',
            reason: 'rate_limit_event isUsingOverage=true',
        })
    })
})

describe('decision step: limit waits during a ticket review', () => {
    const CODE = finding({ id: 'R1-1', title: 'Sum drops negatives' })
    const TEST = finding({
        id: 'R1-2',
        kind: 'test',
        severity: 'blocker',
        file: 'src/sum.test.ts',
    })

    /** Ticket #11 built up to its green commit, before any review. */
    const committed = (): JournalEntry[] => [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 11 }).slice(0, 10),
    ]

    /** A review asking for a code fix, fixed, gated, and committed. */
    const codeFixed = (): JournalEntry[] => [
        ...committed(),
        reviewed({ ticket: 11, findings: [CODE] }),
        implemented({
            ticket: 11,
            finding_responses: [
                { finding_id: 'R1-1', response: 'fixed', reason: '' },
            ],
        }),
        gatesRun({ ticket: 11, target: 'ticket', ok: true }),
        leftoverScan({ ticket: 11, stage: 'fix' }),
        commitMade({
            ticket: 11,
            stage: 'fix',
            sha: 'fix-1-sha',
            files: ['src/sum.ts'],
        }),
    ]

    const cases: [string, JournalEntry[], string][] = [
        ['the ticket review', committed(), 'ticket-reviewer'],
        [
            "a review fix round's test-writer",
            [...committed(), reviewed({ ticket: 11, findings: [TEST] })],
            'test-writer',
        ],
        [
            "a review fix round's implementer",
            [...committed(), reviewed({ ticket: 11, findings: [CODE] })],
            'implementer',
        ],
        ['the re-review after a fix round', codeFixed(), 'ticket-reviewer'],
    ]

    test.each(cases)(
        'a limit hit in %s resumes that same step after the reset',
        (_, entries, role) => {
            const step = decideAfter(entries)
            expect(step).toMatchObject({ role })
            if (step.type !== 'launch_agent' && step.type !== 'follow_up_agent')
                throw new Error(step.type)
            const hit = [
                ...entries,
                agentStarted({
                    ticket: 11,
                    role: step.role,
                    ...(step.type === 'follow_up_agent'
                        ? { follow_up_of: step.session_id }
                        : {}),
                }),
                agentSession({
                    ticket: 11,
                    role: step.role,
                    rate_limit_events: [
                        rateLimitReading({
                            status: 'rejected',
                            resets_at: '2026-01-01T03:00:00.000Z',
                        }),
                    ],
                }),
            ]
            expect(decideAfter(hit)).toMatchObject({
                type: 'start_limit_wait',
                ticket: 11,
                role: step.role,
            })
            expect(
                decideAfter([
                    ...hit,
                    limitWaitStarted({
                        until: '2026-01-01T03:01:00.000Z',
                        resets_at: '2026-01-01T03:00:00.000Z',
                    }),
                    limitWaitEnded({ until: '2026-01-01T03:01:00.000Z' }),
                ])
            ).toEqual(step)
        }
    )
})

/** A clock that starts at `start` and moves only when slept. */
const fakeClock = ({ start }: { start: string }) => {
    let now = Date.parse(start)
    const slept: number[] = []
    const clock: EngineClock = {
        now: () => now,
        sleep: async (ms) => {
            slept.push(ms)
            now += ms
        },
    }
    return { clock, slept, now: () => new Date(now).toISOString() }
}

// Moved from `limit-wait.e2e.test.ts` (#566): a restarted engine's wait.
// What it decides after the restart (the same `until`, nothing new on the
// spec, the cut-off step again after the wait) is in
// `decide-crash-recovery.test.ts`'s "a crash during a limit wait"; this is
// the wait itself. A real run's whole wait is still end to end there.
describe('the limit wait itself (waitUntil)', () => {
    test('a restarted engine waits out the rest, in naps, until the same time', async () => {
        const time = fakeClock({ start: '2026-09-25T00:00:00.000Z' })

        await waitUntil({
            clock: time.clock,
            until: '2026-09-26T11:01:00.000Z',
        })

        expect(time.now()).toBe('2026-09-26T11:01:00.000Z')
        expect(time.slept.every((ms) => ms <= LIMIT_WAIT_NAP_MS)).toBe(true)
        expect(time.slept.reduce((sum, ms) => sum + ms, 0)).toBe(
            Date.parse('2026-09-26T11:01:00.000Z') -
                Date.parse('2026-09-25T00:00:00.000Z')
        )
    })

    test('a wait whose end passed while the engine was down ends at once', async () => {
        const time = fakeClock({ start: '2026-09-24T00:00:00.000Z' })

        await waitUntil({
            clock: time.clock,
            until: '2026-09-23T14:01:00.000Z',
        })

        expect(time.slept).toEqual([])
    })
})
