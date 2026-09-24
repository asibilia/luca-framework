import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentSession,
    agentStarted,
    billingStopped,
    commitMade,
    finding,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    limitWaitEnded,
    limitWaitStarted,
    practiceTicket,
    rateLimitReading,
    reviewed,
    runBranchCreated,
    ticketBuilt,
    RUN_BRANCH_PATH,
    ticketPath,
    withInstalls,
    worktreesRemoved,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

const TICKET = practiceTicket({ number: 11 })

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

/** A session whose one reading puts these windows at these fractions. */
const readingSession = ({
    ticket,
    role,
    windows,
}: {
    ticket: number
    role: 'test-writer' | 'implementer' | 'ticket-reviewer'
    windows: Record<string, number>
}) =>
    agentSession({
        ticket,
        role,
        rate_limit_events: [rateLimitReading({ status: 'allowed', windows })],
    })

/** Ticket #n built, with a session after each agent's result. */
const builtWithSessions = ({
    ticket,
    readings,
}: {
    ticket: number
    /** The test-writer's, implementer's, and reviewer's windows. */
    readings: [
        Record<string, number>,
        Record<string, number>,
        Record<string, number>,
    ]
}): JournalEntry[] => {
    const steps = ticketBuilt({ ticket })
    return [
        ...steps.slice(0, 3),
        readingSession({ ticket, role: 'test-writer', windows: readings[0] }),
        ...steps.slice(3, 7),
        readingSession({ ticket, role: 'implementer', windows: readings[1] }),
        ...steps.slice(7, 11),
        readingSession({
            ticket,
            role: 'ticket-reviewer',
            windows: readings[2],
        }),
        ...steps.slice(11),
    ]
}

const usageRecorded = (content: Record<string, unknown>): JournalEntry =>
    ({
        kind: 'usage_recorded',
        ticket: content.ticket ?? null,
        role: null,
        content,
    }) as JournalEntry

const PR_OPENED: JournalEntry = {
    kind: 'pull_request_opened',
    ticket: null,
    role: null,
    content: {
        number: 12,
        url: 'https://github.com/acme/app/pull/12',
        head: 'luca/spec-10-run',
        base: 'main',
        title: 'Practice spec (#10)',
        body: '',
    },
}

describe('decision step: usage', () => {
    const built = builtWithSessions({
        ticket: 11,
        readings: [
            { five_hour: 0.1, seven_day: 0.2 },
            { five_hour: 0.12, seven_day: 0.21 },
            { five_hour: 0.13 },
        ],
    })
    const ticketUsage = {
        scope: 'ticket' as const,
        ticket: 11,
        agent_turns: 3,
        tokens: {
            input_tokens: 30,
            output_tokens: 300,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        },
        windows: {
            five_hour: { from: 10, to: 13, used: 3 },
            seven_day: { from: 20, to: 21, used: 1 },
        },
    }

    test("a pushed ticket's tokens and plan percent are recorded", () => {
        expect(decideAfter([runBranchCreated(), ...built])).toEqual({
            type: 'record_usage',
            usage: ticketUsage,
        })
    })

    test("the run's usage is recorded once its PR is open and its worktrees are removed, then it is done", () => {
        const runUsage = {
            ...ticketUsage,
            scope: 'run' as const,
            ticket: null,
        }
        const opened = [
            runBranchCreated(),
            ...built,
            usageRecorded(ticketUsage),
            PR_OPENED,
        ]
        const paths = [ticketPath(11), RUN_BRANCH_PATH]
        // The run is not ending yet: its worktrees come first.
        expect(decideAfter(opened)).toEqual({ type: 'remove_worktrees', paths })
        const entries = [...opened, worktreesRemoved({ paths })]
        expect(decideAfter(entries)).toEqual({
            type: 'record_usage',
            usage: runUsage,
        })
        expect(
            decideAfter([...entries, usageRecorded(runUsage)])
        ).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    })

    test('a window that reset counts from zero again', () => {
        const action = decideAfter([
            runBranchCreated(),
            ...builtWithSessions({
                ticket: 11,
                readings: [
                    { five_hour: 0.9 },
                    { five_hour: 0.05 },
                    { five_hour: 0.07 },
                ],
            }),
        ])
        expect(action).toMatchObject({
            type: 'record_usage',
            usage: { windows: { five_hour: { from: 90, to: 7, used: 7 } } },
        })
    })

    test("a ticket's plan percent starts from the reading before its first agent", () => {
        const second = practiceTicket({ number: 12, title: 'Add product' })
        const action = decide({
            records: recordsFrom({
                entries: withInstalls({
                    entries: [
                        ...intakePassed({ tickets: [TICKET, second] }),
                        runBranchCreated(),
                        ...built,
                        usageRecorded(ticketUsage),
                        ...builtWithSessions({
                            ticket: 12,
                            readings: [
                                { five_hour: 0.15 },
                                { five_hour: 0.16 },
                                { five_hour: 0.18 },
                            ],
                        }),
                    ],
                }),
            }),
        })
        expect(action).toMatchObject({
            type: 'record_usage',
            usage: {
                ticket: 12,
                windows: { five_hour: { from: 13, to: 18, used: 5 } },
            },
        })
    })

    test('a stuck ticket records its usage, then is told to the spec issue; the run goes on', () => {
        const stuck: JournalEntry = {
            kind: 'ticket_stuck',
            ticket: 11,
            role: null,
            content: { reason: 'agent_failed', detail: 'It broke.' },
        }
        const entries = [
            ...testWriterRunning(),
            readingSession({
                ticket: 11,
                role: 'test-writer',
                windows: { five_hour: 0.1 },
            }),
            stuck,
        ]
        expect(decideAfter(entries)).toMatchObject({
            type: 'record_usage',
            usage: { scope: 'ticket', ticket: 11 },
        })
        const ticketDone = usageRecorded({
            ...ticketUsage,
            agent_turns: 1,
            windows: {},
        })
        expect(decideAfter([...entries, ticketDone])).toMatchObject({
            type: 'report_stuck',
            ticket: 11,
        })
    })

    test('a run with no agent sessions records no usage', () => {
        expect(
            decideAfter([
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }),
                ...finalReviewClean(),
            ])
        ).toMatchObject({ type: 'open_pull_request' })
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
