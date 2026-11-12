import { describe, expect, test } from 'bun:test'

import { decide } from './decide'
import { TICKET, decideAfter, testWriterRunning } from './decide-limits-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentSession,
    agentStarted,
    commentRead,
    intakePassed,
    practiceTicket,
    rateLimitReading,
    replyReceived,
    runBranchCreated,
    storyOff,
    stuckReported,
    ticketBuilt,
    ticketRetried,
    ticketStuck,
    RUN_BRANCH_PATH,
    ticketPath,
    withInstalls,
    worktreesRemoved,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * The decision step's usage records: a ticket's, then the run's once its
 * PR is open. Split from `decide-limits.test.ts`.
 */

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
            storyOff(),
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

    describe('a retried ticket', () => {
        const firstStuck = (): JournalEntry[] => [
            ...testWriterRunning(),
            readingSession({
                ticket: 11,
                role: 'test-writer',
                windows: { five_hour: 0.1 },
            }),
            ticketStuck({ ticket: 11, reason: 'agent_failed' }),
            usageRecorded({
                ...ticketUsage,
                agent_turns: 1,
                windows: { five_hour: { from: 10, to: 10, used: 0 } },
            }),
            stuckReported({ ticket: 11 }),
            commentRead({ comment_id: 120, body: 'retry' }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            readingSession({
                ticket: 11,
                role: 'test-writer',
                windows: { five_hour: 0.12 },
            }),
        ]

        test('records nothing new while it is still building', () => {
            expect(decideAfter(firstStuck())).not.toMatchObject({
                type: 'record_usage',
            })
        })

        test('that gets stuck again records its whole usage again, then is told', () => {
            const again = [
                ...firstStuck(),
                ticketStuck({ ticket: 11, reason: 'agent_failed' }),
            ]
            const whole = {
                scope: 'ticket' as const,
                ticket: 11,
                agent_turns: 2,
                windows: { five_hour: { from: 10, to: 12, used: 2 } },
            }
            expect(decideAfter(again)).toMatchObject({
                type: 'record_usage',
                usage: whole,
            })
            expect(
                decideAfter([
                    ...again,
                    usageRecorded({ ...ticketUsage, ...whole }),
                ])
            ).toMatchObject({ type: 'report_stuck', ticket: 11 })
        })

        test('that is pushed records its whole usage again', () => {
            const steps = ticketBuilt({ ticket: 11 })
            const pushedAfter = [...firstStuck(), ...steps.slice(2)]
            expect(decideAfter(pushedAfter)).toMatchObject({
                type: 'record_usage',
                usage: { ticket: 11, agent_turns: 2 },
            })
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
