import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    intakeRead,
    runStarted,
    specSnapshot,
    ticketSnapshot,
    type Entry,
} from './testing/journal-fixtures'

/**
 * Tickets for a person (#499), and the tickets that wait on them, are left
 * out of the run. The board shows them calmly, as a small list, never in
 * NEEDS YOU and never as a problem.
 */

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({ run_id, token, entries })
}

const eventRows = () =>
    harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event'
                ? [{ text: row.data.text, tone: row.data.tone }]
                : []
        )

const LEFT_OUT = [
    {
        number: 12,
        title: 'Make the store page',
        url: 'https://github.com/o/r/issues/12',
        reason: 'for_a_person',
        waits_on: [],
        through: [],
    },
    {
        number: 13,
        title: 'Link the store',
        url: 'https://github.com/o/r/issues/13',
        reason: 'waits_on_person',
        waits_on: [12],
        through: [],
    },
    {
        number: 14,
        title: 'Ship it',
        url: 'https://github.com/o/r/issues/14',
        reason: 'waits_on_person',
        waits_on: [12],
        through: [13],
    },
]

const withLeftOut = (entry: Entry): Entry => ({
    ...entry,
    content: { ...(entry.content as object), left_out: LEFT_OUT },
})

describe('tickets for a person on the board', () => {
    test('are listed under "for a person" with why, and nothing needs you', async () => {
        await runWith({
            entries: [
                runStarted({ spec: 10 }),
                intakeRead({ spec: 10 }),
                withLeftOut(
                    specSnapshot({ spec: 10, title: 'Spec', order: [11] })
                ),
                ticketSnapshot({ number: 11, title: 'Add sum' }),
            ],
        })

        const state = await harness.state()
        expect(state.for_a_person).toEqual([
            { number: 12, title: 'Make the store page', why: 'for a person' },
            {
                number: 13,
                title: 'Link the store',
                why: 'waits on #12, which is for a person',
            },
            {
                number: 14,
                title: 'Ship it',
                why: 'waits on #12, which is for a person (through #13)',
            },
        ])
        expect(state.needs_you).toEqual([])
        expect(state.tickets.map(({ number }) => number)).toEqual([11])
        expect(state.run.status).toBe('building')
        expect(eventRows().at(-1)).toEqual({
            text: 'Intake passed: spec #10, 1 tickets. 3 left for a person: #12, #13, #14.',
            tone: 'success',
        })
    })

    test('a run with only tickets for a person ends calmly with nothing to do, saying why', async () => {
        await runWith({
            entries: [
                runStarted({ spec: 10 }),
                intakeRead({ spec: 10 }),
                {
                    kind: 'nothing_to_do',
                    ticket: null,
                    role: null,
                    content: {
                        closed_tickets: [11],
                        already_done: [],
                        left_out: LEFT_OUT.slice(0, 2),
                    },
                },
            ],
        })

        const state = await harness.state()
        expect(state.run.status).toBe('nothing_to_do')
        expect(state.needs_you).toEqual([])
        expect(state.for_a_person.map(({ number }) => number)).toEqual([12, 13])
        expect(eventRows().at(-1)).toEqual({
            text: 'Nothing to do: #12 is for a person, and #13 waits on a ticket for a person.',
            tone: 'info',
        })
    })

    test('an older journal, with nothing left out, shows none', async () => {
        await runWith({
            entries: [
                runStarted({ spec: 10 }),
                intakeRead({ spec: 10 }),
                specSnapshot({ spec: 10, title: 'Spec', order: [11] }),
                ticketSnapshot({ number: 11, title: 'Add sum' }),
            ],
        })

        expect((await harness.state()).for_a_person).toEqual([])
        expect(eventRows().at(-1)).toEqual({
            text: 'Intake passed: spec #10, 1 tickets.',
            tone: 'success',
        })
    })
})
