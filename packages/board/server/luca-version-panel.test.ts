import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { createHarness, type Harness } from './testing/board-harness'
import {
    intakeOfThree,
    pullRequestOpened,
    stamp,
    ticketWorktreeCreated,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

/**
 * Luca's version on the board (#460), at `board.read`: the engine records
 * the version a run started on in `run_started.luca_version`, and the
 * version it resumed on in an `engine_resumed` record each time it starts
 * again on the run's journal. When a run resumed on a different version
 * than it started on, the run shows a note naming both (`run.version_note`);
 * otherwise the note is `null`. The run keeps going either way.
 */

let harness: Harness | null = null
const dirs: string[] = []

afterEach(async () => {
    await harness?.cleanup()
    harness = null
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

const STARTED_ON = '14.0.0-alpha.1'
const UPGRADED_TO = '14.0.0-alpha.2'

const RunStartedContentSchema = z.looseObject({})

/** Intake of three tickets, its `run_started` naming `luca_version`. */
const intakeOn = ({ version }: { version: string }): Entry[] =>
    intakeOfThree().map((entry) =>
        entry.kind === 'run_started'
            ? {
                  ...entry,
                  content: {
                      ...RunStartedContentSchema.parse(entry.content),
                      luca_version: version,
                  },
              }
            : entry
    )

/** The engine started again on the run's journal, on `version`. */
const engineResumed = ({ version }: { version: string }): Entry => ({
    kind: 'engine_resumed',
    ticket: null,
    role: null,
    content: { luca_version: version },
})

/** Starts a run from a chat and sends `entries` in one go. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({ run_id, token, entries })
    return harness.state()
}

describe('a run resumed on a different Luca version', () => {
    test('the run shows a note naming the version it started on and the one it resumed on', async () => {
        const state = await runWith({
            entries: [
                ...intakeOn({ version: STARTED_ON }),
                ticketWorktreeCreated({ ticket: 11 }),
                engineResumed({ version: UPGRADED_TO }),
            ],
        })

        expect(state.run.version_note).toEqual(expect.any(String))
        expect(state.run.version_note).toContain(STARTED_ON)
        expect(state.run.version_note).toContain(UPGRADED_TO)
    })

    test('the run keeps going: it stays building and its tickets go on', async () => {
        const state = await runWith({
            entries: [
                ...intakeOn({ version: STARTED_ON }),
                ticketWorktreeCreated({ ticket: 11 }),
                engineResumed({ version: UPGRADED_TO }),
                ticketWorktreeCreated({ ticket: 13 }),
            ],
        })

        expect(state.run.status).toBe('building')
        expect(state.run.stopped).toBeNull()
        expect(state.needs_you).toEqual([])
        expect(
            state.tickets
                .filter((ticket) => ticket.started)
                .map((ticket) => ticket.number)
        ).toEqual([11, 13])
        expect(state.run.version_note).toContain(UPGRADED_TO)
    })

    test('a run resumed first on the same version, then on a new one, shows the note', async () => {
        const state = await runWith({
            entries: [
                ...intakeOn({ version: STARTED_ON }),
                engineResumed({ version: STARTED_ON }),
                ticketWorktreeCreated({ ticket: 11 }),
                engineResumed({ version: UPGRADED_TO }),
            ],
        })

        expect(state.run.version_note).toContain(STARTED_ON)
        expect(state.run.version_note).toContain(UPGRADED_TO)
    })
})

describe('a run on one Luca version', () => {
    test('a run resumed on the same version shows no note', async () => {
        const state = await runWith({
            entries: [
                ...intakeOn({ version: STARTED_ON }),
                ticketWorktreeCreated({ ticket: 11 }),
                engineResumed({ version: STARTED_ON }),
            ],
        })

        expect(state.run.version_note).toBeNull()
        expect(state.run.status).toBe('building')
    })

    test('a run that never resumed shows no note', async () => {
        const state = await runWith({
            entries: [
                ...intakeOn({ version: STARTED_ON }),
                ticketWorktreeCreated({ ticket: 11 }),
            ],
        })

        expect(state.run.version_note).toBeNull()
    })
})

/** A whole run of spec 10, as journaled before #460: no version anywhere. */
const finishedOldRun = (): Entry[] => [
    ...intakeOfThree(),
    ...wholeTicket({ ticket: 11 }),
    ...wholeTicket({ ticket: 12 }),
    ...wholeTicket({ ticket: 13 }),
    pullRequestOpened({
        number: 408,
        url: 'https://github.com/acme/app/pull/408',
    }),
]

describe('a journal written before the version was recorded', () => {
    test('it still shows on the board, with no version note', async () => {
        const state = await runWith({ entries: finishedOldRun() })

        expect(state.run.status).toBe('done')
        expect(state.run.pr_number).toBe(408)
        expect(state.tickets.map((ticket) => ticket.stage)).toEqual([
            'done',
            'done',
            'done',
        ])
        expect(state.event_count).toBe(finishedOldRun().length)
        expect(state.run.version_note).toBeNull()
    })

    test('it is rebuilt from disk and shows on the board, with no version note', async () => {
        const runs_dir = await mkdtemp(join(tmpdir(), 'luca-board-version-'))
        dirs.push(runs_dir)
        const run_id = '20260925t013006z-ebe29030'
        const entries = finishedOldRun().map((entry) =>
            entry.kind === 'run_started'
                ? {
                      ...entry,
                      content: {
                          ...RunStartedContentSchema.parse(entry.content),
                          repo: '/repo',
                      },
                  }
                : entry
        )
        await mkdir(join(runs_dir, run_id), { recursive: true })
        await writeFile(
            join(runs_dir, run_id, 'journal.jsonl'),
            `${stamp({ entries })
                .map((record) => JSON.stringify(record))
                .join('\n')}\n`
        )

        harness = await createHarness({ runs_dir })
        const { selected } = await harness.board.readBoard({
            workspace_id: 'ws-1',
            directory: '/repo',
            run_id,
        })

        expect(selected?.run.run_id).toBe(run_id)
        expect(selected?.run.status).toBe('done')
        expect(selected?.run.pr_number).toBe(408)
        expect(selected?.run.version_note).toBeNull()
    })
})

describe('the board README', () => {
    test('its vocabulary table has a row for engine_resumed and names run_started’s luca_version', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', 'README.md')
        ).text()
        const rows = readme.split('\n').filter((line) => line.startsWith('| `'))
        const resumedRow = rows.find((line) =>
            line.startsWith('| `engine_resumed`')
        )
        const startedRow = rows.find((line) =>
            line.startsWith('| `run_started`')
        )

        expect(resumedRow).toBeDefined()
        expect(resumedRow).toContain('luca_version')
        expect(startedRow).toContain('luca_version')
    })
})
