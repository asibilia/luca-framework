import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    intakeOfThree,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

/**
 * A resume that re-read the repo's config, on the board (#PRNUM): the
 * engine journals `config_reloaded { changes }` when the build fields
 * changed, or `config_reload_refused { reason }` when it kept the run's
 * config. Each adds one short line to the run's chat; the run keeps going.
 */

let harness: Harness | null = null

afterEach(async () => {
    await harness?.cleanup()
    harness = null
})

const configReloaded = (): Entry => ({
    kind: 'config_reloaded',
    ticket: null,
    role: null,
    content: {
        changes: [
            { field: 'prepare', from: 'make rom', to: 'make rom-cached' },
            { field: 'prepare_timeout_ms', from: null, to: 60_000 },
        ],
    },
})

const configRefused = (): Entry => ({
    kind: 'config_reload_refused',
    ticket: null,
    role: null,
    content: { reason: '/repo/.luca/config.json is not valid JSON: oops' },
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

describe('a reloaded config in the chat', () => {
    test('a reload adds one line naming the fields that changed', async () => {
        const { rows, state } = await eventsAfter({
            entries: [configReloaded()],
        })

        expect(rows.at(-1)).toEqual({
            text: 'Config reloaded: prepare, prepare_timeout_ms changed.',
            tone: 'info',
        })
        expect(state.run.status).toBe('building')
    })

    test('a refused reload says the run keeps its config, and why', async () => {
        const { rows, state } = await eventsAfter({
            entries: [configRefused()],
        })

        expect(rows.at(-1)?.tone).toBe('warning')
        expect(rows.at(-1)?.text).toStartWith(
            'Config not reloaded, so the run keeps its own: /repo/.luca/config.json is not valid JSON'
        )
        expect(state.run.status).toBe('building')
    })
})

describe('the board README', () => {
    test('its vocabulary table has a row for each config reload record', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', 'README.md')
        ).text()
        const rows = readme.split('\n').filter((line) => line.startsWith('| `'))

        expect(
            rows.some((line) => line.startsWith('| `config_reloaded`'))
        ).toBe(true)
        expect(
            rows.some((line) => line.startsWith('| `config_reload_refused`'))
        ).toBe(true)
    })
})
