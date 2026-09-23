import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { EngineConfig } from '../config/engine-config'
import type { IntakeRead } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import { recordsFrom, specIssue, ticketIssue } from '../testing/intake-fixtures'

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const started = ({ config }: { config: EngineConfig }): JournalEntry => ({
    kind: 'run_started',
    ticket: null,
    role: null,
    content: { spec_number: 10, config },
})

const read = (content: IntakeRead): JournalEntry => ({
    kind: 'intake_read',
    ticket: null,
    role: null,
    content,
})

const decideAfterIntake = ({
    intake,
    config,
}: {
    intake: IntakeRead
    config?: EngineConfig
}) =>
    decide({
        records: recordsFrom({
            entries: [started({ config: config ?? CONFIG }), read(intake)],
        }),
    })

describe('decision step: starting a run', () => {
    test('an empty journal is not a run', () => {
        expect(decide({ records: [] })).toEqual({
            type: 'invalid_journal',
            reason: 'The journal has no run_started record.',
        })
    })

    test('a started run reads intake for its spec', () => {
        expect(
            decide({
                records: recordsFrom({
                    entries: [started({ config: CONFIG })],
                }),
            })
        ).toEqual({ type: 'read_intake', spec_number: 10 })
    })
})

describe('decision step: intake refuses the run', () => {
    test('a spec without Testing Decisions is refused on the spec', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10, testing_decisions: '' }),
                sub_tickets: [ticketIssue({ number: 11 })],
                outside_blockers: [],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: 10,
                    missing: [
                        'The spec has no "Testing Decisions" section, or it is empty.',
                    ],
                },
            ],
        })
    })

    test('a ticket without What to build is refused', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [
                    ticketIssue({ number: 11, what_to_build: '' }),
                    ticketIssue({ number: 12 }),
                ],
                outside_blockers: [],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: 11,
                    missing: [
                        'The ticket has no "What to build" section, or it is empty.',
                    ],
                },
            ],
        })
    })

    test('a ticket without an acceptance checkbox is refused', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [ticketIssue({ number: 11, criteria: [] })],
                outside_blockers: [],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: 11,
                    missing: [
                        'The ticket has no checkbox under "Acceptance criteria".',
                    ],
                },
            ],
        })
    })

    test('a ticket without the ready-for-agent label is refused', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [ticketIssue({ number: 11, labels: ['bug'] })],
                outside_blockers: [],
            },
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
            ],
        })
    })

    test('a native blocker that is open and outside the spec is refused', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [ticketIssue({ number: 11, blocked_by: [99] })],
                outside_blockers: [
                    ticketIssue({ number: 99, title: 'Elsewhere' }),
                ],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: 11,
                    missing: [
                        'The ticket is blocked by #99, which is still open and is not part of spec #10.',
                    ],
                },
            ],
        })
    })

    test('a "Blocked by" section naming an open issue outside the spec is refused', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [
                    ticketIssue({ number: 11, blocked_by_section: '- #98' }),
                ],
                outside_blockers: [ticketIssue({ number: 98 })],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: 11,
                    missing: [
                        'The ticket is blocked by #98, which is still open and is not part of spec #10.',
                    ],
                },
            ],
        })
    })

    test('a blocker that cannot be found is refused', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [
                    ticketIssue({ number: 11, blocked_by_section: '- #97' }),
                ],
                outside_blockers: [],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: 11,
                    missing: [
                        'The ticket is blocked by #97, which could not be found.',
                    ],
                },
            ],
        })
    })

    test('blockers that form a loop are refused on every ticket in the loop', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [
                    ticketIssue({ number: 11 }),
                    ticketIssue({ number: 12, blocked_by: [13] }),
                    ticketIssue({ number: 13, blocked_by_section: '- #12' }),
                ],
                outside_blockers: [],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: 12,
                    missing: [
                        "The ticket's blockers form a loop: #12 -> #13 -> #12.",
                    ],
                },
                {
                    ticket: 13,
                    missing: [
                        "The ticket's blockers form a loop: #12 -> #13 -> #12.",
                    ],
                },
            ],
        })
    })

    test('a missing test command refuses the run as a whole', () => {
        const action = decideAfterIntake({
            config: { ...CONFIG, checks: { types: 'tsc' } },
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [ticketIssue({ number: 11 })],
                outside_blockers: [],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: null,
                    missing: [
                        'The engine config (luca.config.json) has no test command at checks.test.',
                    ],
                },
            ],
        })
    })

    test('every problem is collected, grouped by ticket', () => {
        const action = decideAfterIntake({
            config: { ...CONFIG, checks: {} },
            intake: {
                spec: specIssue({ number: 10, testing_decisions: '' }),
                sub_tickets: [
                    ticketIssue({
                        number: 12,
                        what_to_build: '',
                        criteria: [],
                        labels: [],
                    }),
                    ticketIssue({ number: 11, blocked_by: [99] }),
                    ticketIssue({ number: 14 }),
                ],
                outside_blockers: [ticketIssue({ number: 99 })],
            },
        })

        expect(action).toEqual({
            type: 'refuse_intake',
            spec_number: 10,
            problems: [
                {
                    ticket: null,
                    missing: [
                        'The engine config (luca.config.json) has no test command at checks.test.',
                    ],
                },
                {
                    ticket: 10,
                    missing: [
                        'The spec has no "Testing Decisions" section, or it is empty.',
                    ],
                },
                {
                    ticket: 11,
                    missing: [
                        'The ticket is blocked by #99, which is still open and is not part of spec #10.',
                    ],
                },
                {
                    ticket: 12,
                    missing: [
                        'The ticket has no "What to build" section, or it is empty.',
                        'The ticket has no checkbox under "Acceptance criteria".',
                        'The ticket does not have the ready-for-agent label.',
                    ],
                },
            ],
        })
    })

    test('closed tickets are not checked', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [
                    ticketIssue({ number: 11 }),
                    ticketIssue({
                        number: 12,
                        state: 'closed',
                        what_to_build: '',
                        labels: [],
                    }),
                ],
                outside_blockers: [],
            },
        })

        expect(action).toMatchObject({ type: 'snapshot_intake' })
    })
})

describe('decision step: nothing to do', () => {
    test('a spec with no open tickets has nothing to do', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [ticketIssue({ number: 11, state: 'closed' })],
                outside_blockers: [],
            },
        })

        expect(action).toEqual({
            type: 'finish_nothing_to_do',
            closed_tickets: [11],
        })
    })

    test('a spec with no tickets at all has nothing to do', () => {
        const action = decideAfterIntake({
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [],
                outside_blockers: [],
            },
        })

        expect(action).toEqual({
            type: 'finish_nothing_to_do',
            closed_tickets: [],
        })
    })

    test('an empty spec with a bad config is still refused', () => {
        const action = decideAfterIntake({
            config: { ...CONFIG, checks: {} },
            intake: {
                spec: specIssue({ number: 10 }),
                sub_tickets: [],
                outside_blockers: [],
            },
        })

        expect(action).toMatchObject({ type: 'refuse_intake' })
    })
})

describe('decision step: intake passes', () => {
    const passingIntake: IntakeRead = {
        spec: specIssue({ number: 10, title: 'Checkout' }),
        sub_tickets: [
            ticketIssue({
                number: 11,
                title: 'Pay',
                criteria: ['Card is charged', 'Receipt is sent'],
                blocked_by_section: '- #12',
            }),
            ticketIssue({ number: 12, title: 'Cart', blocked_by: [9] }),
            ticketIssue({ number: 13, title: 'Old', state: 'closed' }),
            ticketIssue({ number: 14, title: 'Coupons', blocked_by: [13] }),
        ],
        outside_blockers: [ticketIssue({ number: 9, state: 'closed' })],
    }

    test('a ready spec is snapshotted with criteria and tickets in blocker order', () => {
        const action = decideAfterIntake({ intake: passingIntake })

        expect(action).toMatchObject({
            type: 'snapshot_intake',
            snapshot: {
                spec: {
                    number: 10,
                    title: 'Checkout',
                    labels: ['ready-for-agent'],
                    url: 'https://github.com/acme/app/issues/10',
                },
                tickets: [
                    { number: 12, title: 'Cart', blockers: [] },
                    {
                        number: 11,
                        title: 'Pay',
                        criteria: [
                            { id: 'AC1', text: 'Card is charged' },
                            { id: 'AC2', text: 'Receipt is sent' },
                        ],
                        blockers: [12],
                    },
                    { number: 14, title: 'Coupons', blockers: [] },
                ],
                closed_tickets: [13],
            },
        })
    })

    const snapshotEntries = ({
        ticket_numbers,
    }: {
        ticket_numbers: number[]
    }): JournalEntry[] => {
        const action = decideAfterIntake({ intake: passingIntake })
        if (action.type !== 'snapshot_intake') throw new Error('not passed')
        const { snapshot } = action
        return [
            started({ config: CONFIG }),
            read(passingIntake),
            {
                kind: 'spec_snapshot',
                ticket: 10,
                role: null,
                content: {
                    spec: snapshot.spec,
                    ticket_order: [12, 11, 14],
                    closed_tickets: [13],
                },
            },
            ...snapshot.tickets
                .filter((ticket) => ticket_numbers.includes(ticket.number))
                .map(
                    (ticket): JournalEntry => ({
                        kind: 'ticket_snapshot',
                        ticket: ticket.number,
                        role: null,
                        content: ticket,
                    })
                ),
        ]
    }

    test('once every ticket is snapshotted, the run waits to build them in order', () => {
        const records = recordsFrom({
            entries: snapshotEntries({ ticket_numbers: [11, 12, 14] }),
        })

        expect(decide({ records })).toEqual({
            type: 'await_build',
            tickets: [12, 11, 14],
        })
    })

    test('a snapshot cut short by a crash is taken again', () => {
        const records = recordsFrom({
            entries: snapshotEntries({ ticket_numbers: [12] }),
        })

        expect(decide({ records })).toMatchObject({ type: 'snapshot_intake' })
    })
})

describe('decision step: finished runs', () => {
    test('a refused run is done', () => {
        const records = recordsFrom({
            entries: [
                started({ config: CONFIG }),
                read({
                    spec: specIssue({ number: 10, testing_decisions: '' }),
                    sub_tickets: [],
                    outside_blockers: [],
                }),
                {
                    kind: 'intake_refused',
                    ticket: null,
                    role: null,
                    content: {
                        problems: [
                            { ticket: 10, missing: ['Testing Decisions'] },
                        ],
                    },
                },
            ],
        })

        expect(decide({ records })).toEqual({
            type: 'done',
            outcome: 'refused',
        })
    })

    test('a run with nothing to do is done', () => {
        const records = recordsFrom({
            entries: [
                started({ config: CONFIG }),
                read({
                    spec: specIssue({ number: 10 }),
                    sub_tickets: [],
                    outside_blockers: [],
                }),
                {
                    kind: 'nothing_to_do',
                    ticket: null,
                    role: null,
                    content: { closed_tickets: [] },
                },
            ],
        })

        expect(decide({ records })).toEqual({
            type: 'done',
            outcome: 'nothing_to_do',
        })
    })
})
