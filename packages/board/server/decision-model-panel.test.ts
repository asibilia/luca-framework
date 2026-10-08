import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    intakeOfThree,
    jevAnswered,
    jevAsked,
    jevFailed,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

/**
 * The decision model on the board (#534): shadow mode's asks are only
 * counted, and `decision_model_off { model, reason, detail }` (no
 * credentials, or Cloudflare turned them down) adds one quiet line to the
 * run's chat. Neither changes a ticket or the run's status.
 */

let harness: Harness | null = null

afterEach(async () => {
    await harness?.cleanup()
    harness = null
})

const decisionModelOff = (): Entry => ({
    kind: 'decision_model_off',
    ticket: null,
    role: null,
    content: {
        model: '@cf/cloudflare/clef',
        reason: 'no_credentials',
        detail: 'No Cloudflare credentials: add CLOUDFLARE_API_TOKEN to /home/me/.config/luca/.env.',
    },
})

/** Starts a run from a chat, sends `entries`, and returns its event rows. */
const eventsAfter = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({
        run_id,
        token,
        entries: [
            ...intakeOfThree(),
            ticketWorktreeCreated({ ticket: 11 }),
            ...entries,
        ],
    })
    const rows = harness
        .latestRows()
        .flatMap(({ row }) =>
            row.kind === 'luca-board-event'
                ? [{ text: row.data.text, tone: row.data.tone }]
                : []
        )
    return { rows, state: await harness.state() }
}

describe('the decision model in the chat', () => {
    test('turning off adds one line with the detail, and the run keeps going', async () => {
        const { rows, state } = await eventsAfter({
            entries: [decisionModelOff()],
        })

        expect(rows.at(-1)).toEqual({
            text: 'Decision model off: No Cloudflare credentials: add CLOUDFLARE_API_TOKEN to /home/me/.config/luca/.env.',
            tone: 'info',
        })
        expect(state.run.status).toBe('building')
        expect(state.jev).toEqual({ asked: 0, answered: 0, failed: 0 })
    })

    test('old Jev records, with no model and a missing_key failure, are still counted', async () => {
        const { state } = await eventsAfter({
            entries: [
                jevAsked({ ticket: 11 }),
                jevAnswered({ ticket: 11, asked_seq: 7 }),
                jevAsked({ ticket: 11 }),
                jevFailed({ ticket: 11, asked_seq: 9 }),
            ],
        })

        expect(state.jev).toEqual({ asked: 2, answered: 1, failed: 1 })
        expect(state.run.status).toBe('building')
    })
})

describe('the board README', () => {
    test('its vocabulary table has a row for decision_model_off', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', 'README.md')
        ).text()
        const rows = readme.split('\n').filter((line) => line.startsWith('| `'))

        expect(
            rows.some((line) => line.startsWith('| `decision_model_off`'))
        ).toBe(true)
    })
})
