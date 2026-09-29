import { describe, expect, test } from 'bun:test'

import { decide } from './decide'
import { pullRequestText } from './pull-request-text'

import type { EngineConfig } from '../config/engine-config'
import type { IntakeRead } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { recordsFrom, specIssue, ticketIssue } from '../testing/intake-fixtures'

/**
 * A spec can hold tickets for a person (#499). An open ticket labeled
 * `ready-for-human` is left out of the run, not refused, and so is every
 * ticket that waits on one. The rest builds.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const started: JournalEntry = {
    kind: 'run_started',
    ticket: null,
    role: null,
    content: { spec_number: 10, config: CONFIG },
}

const read = (content: IntakeRead): JournalEntry => ({
    kind: 'intake_read',
    ticket: null,
    role: null,
    content,
})

const decideAfterIntake = (intake: IntakeRead) =>
    decide({ records: recordsFrom({ entries: [started, read(intake)] }) })

const human = (options: Parameters<typeof ticketIssue>[0]) =>
    ticketIssue({ labels: ['ready-for-human'], ...options })

const url = (number: number) => `https://github.com/acme/app/issues/${number}`

describe('intake with tickets for a person', () => {
    test('a ready-for-human ticket is left out and the rest builds', () => {
        const action = decideAfterIntake({
            spec: specIssue({ number: 10 }),
            sub_tickets: [
                ticketIssue({ number: 11, title: 'Add sum' }),
                human({ number: 12, title: 'Rename the repo' }),
            ],
            outside_blockers: [],
        })

        expect(action).toMatchObject({
            type: 'snapshot_intake',
            snapshot: {
                tickets: [{ number: 11 }],
                left_out: [
                    {
                        number: 12,
                        title: 'Rename the repo',
                        url: url(12),
                        reason: 'for_a_person',
                        waits_on: [],
                        through: [],
                    },
                ],
            },
        })
    })

    test('a ticket for a person needs no What to build or checkboxes', () => {
        const action = decideAfterIntake({
            spec: specIssue({ number: 10 }),
            sub_tickets: [
                ticketIssue({ number: 11 }),
                human({ number: 12, what_to_build: '', criteria: [] }),
            ],
            outside_blockers: [],
        })

        expect(action).toMatchObject({ type: 'snapshot_intake' })
    })

    test('a ticket for a person blocked by agent tickets is fine', () => {
        const action = decideAfterIntake({
            spec: specIssue({ number: 10 }),
            sub_tickets: [
                ticketIssue({ number: 11 }),
                human({ number: 12, blocked_by: [11] }),
            ],
            outside_blockers: [],
        })

        expect(action).toMatchObject({
            type: 'snapshot_intake',
            snapshot: {
                tickets: [{ number: 11, blockers: [] }],
                left_out: [{ number: 12, reason: 'for_a_person' }],
            },
        })
    })

    test('a ticket blocked by one for a person, and the tickets that wait on it, are left out with the reason', () => {
        const action = decideAfterIntake({
            spec: specIssue({ number: 10 }),
            sub_tickets: [
                ticketIssue({ number: 11, title: 'Add sum' }),
                human({ number: 12, title: 'Make the store page' }),
                ticketIssue({
                    number: 13,
                    title: 'Link the store',
                    blocked_by: [12, 11],
                }),
                ticketIssue({
                    number: 14,
                    title: 'Ship it',
                    blocked_by_section: '- #13',
                }),
                ticketIssue({
                    number: 15,
                    title: 'Add total',
                    blocked_by: [11],
                }),
            ],
            outside_blockers: [],
        })

        expect(action).toMatchObject({
            type: 'snapshot_intake',
            snapshot: {
                tickets: [
                    { number: 11, blockers: [] },
                    { number: 15, blockers: [11] },
                ],
                left_out: [
                    { number: 12, reason: 'for_a_person' },
                    {
                        number: 13,
                        title: 'Link the store',
                        reason: 'waits_on_person',
                        waits_on: [12],
                        through: [],
                    },
                    {
                        number: 14,
                        title: 'Ship it',
                        reason: 'waits_on_person',
                        waits_on: [12],
                        through: [13],
                    },
                ],
            },
        })
    })

    test('a ticket with both ready labels is for a person: left out, not built', () => {
        const action = decideAfterIntake({
            spec: specIssue({ number: 10 }),
            sub_tickets: [
                ticketIssue({ number: 11 }),
                ticketIssue({
                    number: 12,
                    labels: ['ready-for-agent', 'ready-for-human'],
                }),
            ],
            outside_blockers: [],
        })

        expect(action).toMatchObject({
            type: 'snapshot_intake',
            snapshot: {
                tickets: [{ number: 11 }],
                left_out: [{ number: 12, reason: 'for_a_person' }],
            },
        })
    })

    test('a ticket with no ready label is still refused, as is one with needs-info', () => {
        const action = decideAfterIntake({
            spec: specIssue({ number: 10 }),
            sub_tickets: [
                ticketIssue({ number: 11, labels: [] }),
                ticketIssue({ number: 12, labels: ['needs-info'] }),
                human({ number: 13 }),
            ],
            outside_blockers: [],
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: 11,
                    missing: [
                        'The ticket does not have the ready-for-agent label.',
                    ],
                },
                {
                    ticket: 12,
                    missing: [
                        'The ticket does not have the ready-for-agent label.',
                    ],
                },
            ],
        })
    })

    test('when every open ticket is for a person or waits on one, the run has nothing to do and says why', () => {
        const action = decideAfterIntake({
            spec: specIssue({ number: 10 }),
            sub_tickets: [
                ticketIssue({ number: 11, state: 'closed' }),
                human({ number: 12, title: 'Make the store page' }),
                ticketIssue({ number: 13, title: 'Link it', blocked_by: [12] }),
            ],
            outside_blockers: [],
        })

        expect(action).toEqual({
            type: 'finish_nothing_to_do',
            closed_tickets: [11],
            already_done: [],
            left_out: [
                {
                    number: 12,
                    title: 'Make the store page',
                    url: url(12),
                    reason: 'for_a_person',
                    waits_on: [],
                    through: [],
                },
                {
                    number: 13,
                    title: 'Link it',
                    url: url(13),
                    reason: 'waits_on_person',
                    waits_on: [12],
                    through: [],
                },
            ],
        })
    })
})

/**
 * Turbo's spec (asibilia/range-finder--classic#23): 18 tickets, #24 and
 * #26 closed, four for a person (#25 #38 #40 #41), the rest for an agent.
 * No agent ticket waits on a person's, so #27 to #37 and #39 build.
 */
const turboIntake = (): IntakeRead => {
    const agent = (number: number, blocked_by: number[]) =>
        ticketIssue({ number, title: `Ticket ${number}`, blocked_by })
    return {
        spec: specIssue({ number: 23, title: 'Spec: Turbo v1' }),
        sub_tickets: [
            ticketIssue({ number: 24, state: 'closed' }),
            human({ number: 25, title: 'Retire RangeFinder Classic publicly' }),
            ticketIssue({ number: 26, state: 'closed', blocked_by: [24] }),
            agent(27, [26]),
            agent(28, [27]),
            agent(29, [28]),
            agent(30, [27]),
            agent(31, [27]),
            agent(32, [31]),
            agent(33, [27]),
            agent(34, [27]),
            agent(35, [27]),
            agent(36, [27]),
            agent(37, [27]),
            human({
                number: 38,
                title: 'Store projects set up',
                blocked_by: [37],
            }),
            agent(39, [24]),
            human({
                number: 40,
                title: 'First beta release',
                blocked_by: [28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39],
            }),
            human({
                number: 41,
                title: 'Level-gated checks',
                blocked_by: [40],
            }),
        ],
        outside_blockers: [],
    }
}

describe("Turbo's spec", () => {
    test('passes, builds #27 to #37 and #39, and leaves the four tickets for a person out', () => {
        const action = decideAfterIntake(turboIntake())

        if (action.type !== 'snapshot_intake') {
            throw new Error(`intake did not pass: ${JSON.stringify(action)}`)
        }
        expect(
            action.snapshot.tickets
                .map(({ number }) => number)
                .toSorted((a, b) => a - b)
        ).toEqual([27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39])
        expect(action.snapshot.closed_tickets).toEqual([24, 26])
        expect(
            action.snapshot.left_out.map(({ number, reason }) => ({
                number,
                reason,
            }))
        ).toEqual([
            { number: 25, reason: 'for_a_person' },
            { number: 38, reason: 'for_a_person' },
            { number: 40, reason: 'for_a_person' },
            { number: 41, reason: 'for_a_person' },
        ])
    })
})

describe('the journal keeps what was left out', () => {
    const snapshotEntry = (content: Record<string, unknown>): JournalEntry =>
        ({
            kind: 'spec_snapshot',
            ticket: 10,
            role: null,
            content: {
                spec: {
                    number: 10,
                    title: 'Spec',
                    body: '',
                    labels: [],
                    url: url(10),
                },
                ticket_order: [11],
                closed_tickets: [],
                ...content,
            },
        }) as JournalEntry

    test('replay reads the left-out tickets from the spec snapshot', () => {
        const left_out = [
            {
                number: 12,
                title: 'Make the store page',
                url: url(12),
                reason: 'for_a_person' as const,
                waits_on: [],
                through: [],
            },
        ]
        const state = replayRun({
            records: recordsFrom({
                entries: [started, snapshotEntry({ left_out })],
            }),
        })

        expect(state.snapshot?.left_out).toEqual(left_out)
    })

    test('an older spec snapshot, from before #499, reads as nothing left out', () => {
        const state = replayRun({
            records: recordsFrom({ entries: [started, snapshotEntry({})] }),
        })

        expect(state.snapshot?.left_out).toEqual([])
    })
})

describe('the PR names the tickets left for a person', () => {
    test('"For a person" and "Waiting on a person" come after the tickets', () => {
        const { body } = pullRequestText({
            snapshot: {
                spec: {
                    number: 10,
                    title: 'Spec',
                    body: '',
                    labels: [],
                    url: url(10),
                    author: 'owner',
                },
                ticket_order: [11],
                closed_tickets: [],
                tickets: {
                    11: {
                        number: 11,
                        title: 'Add sum',
                        body: '',
                        labels: ['ready-for-agent'],
                        url: url(11),
                        criteria: [],
                        blockers: [],
                    },
                },
                left_out: [
                    {
                        number: 12,
                        title: 'Make the store page',
                        url: url(12),
                        reason: 'for_a_person',
                        waits_on: [],
                        through: [],
                    },
                    {
                        number: 13,
                        title: 'Link the store',
                        url: url(13),
                        reason: 'waits_on_person',
                        waits_on: [12],
                        through: [],
                    },
                    {
                        number: 14,
                        title: 'Ship it',
                        url: url(14),
                        reason: 'waits_on_person',
                        waits_on: [12],
                        through: [13],
                    },
                ],
            },
            tickets: {},
        })

        expect(body).toBe(
            [
                'Built by the Luca engine from spec #10.',
                '## Tickets\n\n- Closes #11: Add sum',
                "## For a person\n\nTickets labeled `ready-for-human`. An agent doesn't build them, so this PR doesn't close them.\n\n- #12 Make the store page",
                "## Waiting on a person\n\nTickets that can't be built until a person's ticket is done. A later run builds them.\n\n" +
                    '- #13 Link the store: waits on #12, which is for a person\n' +
                    '- #14 Ship it: waits on #12, which is for a person (through #13)',
            ].join('\n\n')
        )
    })

    test('with nothing left out, the PR has neither section', () => {
        const { body } = pullRequestText({
            snapshot: {
                spec: {
                    number: 10,
                    title: 'Spec',
                    body: '',
                    labels: [],
                    url: url(10),
                    author: 'owner',
                },
                ticket_order: [],
                closed_tickets: [],
                tickets: {},
                left_out: [],
            },
            tickets: {},
        })

        expect(body).not.toContain('For a person')
        expect(body).not.toContain('Waiting on a person')
    })
})
