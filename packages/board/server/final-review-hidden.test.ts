import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    intakeOfThree,
    intakeRefused,
    nothingToDo,
    runStarted,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

import { ROW_KIND } from '../shared/board-rows'
import { showsFinalReview } from '../shared/board-state'

/**
 * A run with nothing to review (#412): a run that ends with "nothing to do",
 * or one intake refused, shows no final review, neither in the side panel
 * nor as a pending one in the chat's header row.
 */

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

/** Starts a run and sends `entries`, then closes the engine. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({
        run_id,
        token,
        entries,
        ended: { ok: true, message: 'The run finished.' },
    })
    await harness.board.idle()
    return { run_id }
}

const refusedRun = (): Entry[] => [
    runStarted({ spec: 10 }),
    intakeRefused({
        problems: [{ ticket: 11, missing: ['acceptance criteria'] }],
    }),
]

/** The final review's text in the run's latest header row. */
const headerReviewText = () => {
    const headers = harness
        .latestRows()
        .flatMap(({ row }) => (row.kind === ROW_KIND.run ? [row.data] : []))
    const header = headers.at(-1)
    if (!header) throw new Error('no header row')
    return `${header.final_review}`
}

describe('a run with nothing to review', () => {
    test('a nothing-to-do run shows no final review in the side panel', async () => {
        await runWith({ entries: [runStarted({ spec: 10 }), nothingToDo()] })

        const state = await harness.state()

        expect(state.run.status).toBe('nothing_to_do')
        expect(showsFinalReview({ state })).toBe(false)
    })

    test('a run refused at intake shows no final review in the side panel', async () => {
        await runWith({ entries: refusedRun() })

        const state = await harness.state()

        expect(state.run.status).toBe('refused')
        expect(showsFinalReview({ state })).toBe(false)
    })

    test('a run building its tickets still shows its final review', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        await harness.send({
            run_id,
            token,
            entries: [
                ...intakeOfThree(),
                ticketWorktreeCreated({ ticket: 11 }),
            ],
        })

        const state = await harness.state()

        expect(state.run.status).toBe('building')
        expect(showsFinalReview({ state })).toBe(true)
    })

    test('a nothing-to-do run header row shows no pending final review', async () => {
        await runWith({ entries: [runStarted({ spec: 10 }), nothingToDo()] })

        const text = headerReviewText()

        expect(text).not.toMatch(/starts when|about to start/)
    })

    test('a refused run header row shows no pending final review', async () => {
        await runWith({ entries: refusedRun() })

        const text = headerReviewText()

        expect(text).not.toMatch(/starts when|about to start/)
    })
})
