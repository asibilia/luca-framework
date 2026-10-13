import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFinished,
    intakeOfThree,
    ticketAlreadyDone,
    ticketClosed,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

import { ALL_STEPS_DONE } from '../shared/board-state'

/**
 * A ticket whose work is already on the base branch (#484) is done, not
 * stuck: the board shows it calmly in DONE, never in NEEDS YOU, and the run
 * isn't stuck because of it.
 */

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
}

const eventRows = () =>
    harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event'
                ? [{ text: row.data.text, tone: row.data.tone }]
                : []
        )

const SHA = '3559c25f5a1b2c3d4e5f60718293a4b5c6d7e8f9'

/** Ticket 11's worktree, its test-writer's "already done", and the engine's note. */
const doneEleven = (): Entry[] => [
    ticketWorktreeCreated({ ticket: 11 }),
    agentFinished({
        ticket: 11,
        role: 'test-writer',
        result: {
            outcome: 'already_done',
            done_by: [{ sha: SHA, title: 'feat: rename' }],
            criteria: [],
            summary: 'Already on main.',
            assumptions: [],
            run_notes: [],
            finding_responses: [],
        },
    }),
    ticketAlreadyDone({ ticket: 11, shas: [SHA] }),
]

describe('an already-done ticket on the board', () => {
    test('is in DONE with its short commit, not in NEEDS YOU, and the run is not stuck', async () => {
        await runWith({ entries: doneEleven() })

        expect(await harness.ticket({ number: 11 })).toMatchObject({
            stage: 'done',
            step: ALL_STEPS_DONE,
            role: null,
            activity: 'already done · 3559c25',
        })
        const state = await harness.state()
        expect(state.needs_you).toEqual([])
        expect(state.run.status).not.toBe('stuck')
        expect(eventRows().at(-1)).toEqual({
            text: '#11: already done on the base branch, by 3559c25. Nothing to build.',
            tone: 'success',
        })
    })

    test('the ticket that waits on it is no longer blocked', async () => {
        await runWith({ entries: doneEleven() })

        expect(await harness.ticket({ number: 12 })).toMatchObject({
            stage: 'building',
            activity: 'queued',
        })
    })

    test('a run with nothing left to build closes it and ends with nothing to do', async () => {
        await runWith({
            entries: [
                ...doneEleven(),
                ticketClosed({ ticket: 11 }),
                {
                    kind: 'nothing_to_do',
                    ticket: null,
                    role: null,
                    content: { closed_tickets: [], already_done: [11] },
                },
            ],
        })

        const state = await harness.state()
        expect(state.run.status).toBe('nothing_to_do')
        expect(state.needs_you).toEqual([])
        expect(eventRows().slice(-2)).toEqual([
            {
                text: '#11: closed, since its work was already done.',
                tone: 'info',
            },
            {
                text: 'Nothing to do: the work of #11 was already on the base branch.',
                tone: 'info',
            },
        ])
    })
})
