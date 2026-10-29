import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { dirs, disk, writeJournal } from './journal-rebuild-helpers'
import { createHarness, type Harness } from './testing/board-harness'
import {
    intakeOfThree,
    ticketWorktreeCreated,
    worktreeReset,
    type Entry,
} from './testing/journal-fixtures'

import { ROW_KIND } from '../shared/board-rows'

/**
 * A run the board marked ended comes back (#701): on the engine check, a
 * registry run whose journal grew past `ended_at_seq` and that has a live
 * engine in the process list (such as one a watcher resumed with
 * `luca-run --resume`) is live again, with a chat row saying so.
 */

const RUN = 'luca-20261028-234324-26rc'

const CRASH = {
    ok: false,
    message:
        'The engine crashed: gh api --paginate failed: error connecting to api.github.com',
}

const harnesses: Harness[] = []

afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** Spec 10's intake, then filler records up to `count` records in all. */
const journalOf = ({ count }: { count: number }): Entry[] => [
    ...intakeOfThree(),
    ...Array.from({ length: count - intakeOfThree().length - 1 }, () =>
        worktreeReset({ ticket: 11 })
    ),
    ticketWorktreeCreated({ ticket: 11 }),
]

type Registered = {
    run_id: string
    ended: unknown
    ended_at_seq?: number | null
    restarts: number
}

/** Writes a registry holding only `RUN`, started from chat `agent-1`. */
const writeRegistry = async ({
    registry_dir,
    ended_at_seq,
}: {
    registry_dir: string
    ended_at_seq: number | null
}) => {
    const entry = {
        run_id: RUN,
        token: 'a'.repeat(40),
        agent_id: 'agent-1',
        workspace_id: 'ws-1',
        repo: '/repo',
        spec: 10,
        demo: false,
        started_at: '2026-10-28T23:43:24.000Z',
        log_path: `/tmp/${RUN}.log`,
        ended: CRASH,
        restarts: 1,
        ...(ended_at_seq === null ? {} : { ended_at_seq }),
    }
    await writeFile(
        join(registry_dir, 'runs.json'),
        `${JSON.stringify({ version: 1, runs: [entry] }, null, 2)}\n`
    )
}

const registered = async ({
    registry_dir,
}: {
    registry_dir: string
}): Promise<Registered | undefined> => {
    const file = JSON.parse(
        await Bun.file(join(registry_dir, 'runs.json')).text()
    ) as { runs: Registered[] }
    return file.runs.find((entry) => entry.run_id === RUN)
}

/**
 * `RUN`, ended at seq 40 by a crash, seen by a plugin, whose journal then
 * grows to seq 45 while `processes` are the process list.
 */
const crashedThenGrown = async ({
    processes,
    ps_error = null,
}: {
    processes: string[]
    ps_error?: string | null
}) => {
    const folders = await disk()
    await writeRegistry({ ...folders, ended_at_seq: 40 })
    await writeJournal({
        ...folders,
        run_id: RUN,
        entries: journalOf({ count: 40 }),
    })
    const board = await createHarness({ ...folders, ps_error })
    harnesses.push(board)
    await board.board.idle()
    await writeJournal({
        ...folders,
        run_id: RUN,
        entries: journalOf({ count: 45 }),
    })
    board.processes.push(...processes)
    const seen = board.rows.length
    await board.board.checkEngines()
    await board.board.idle()
    const runOf = async () => {
        const { selected } = await board.read({ run_id: RUN })
        if (selected?.run.run_id !== RUN) throw new Error(`no run ${RUN}`)
        return selected
    }
    return { ...folders, board, seen, runOf }
}

const RESUMED_CLI = `luca-run --resume ${RUN}`

describe('a run the board marked ended comes back with a live engine', () => {
    test('a live engine and new records clear ended and ended_at_seq, and the run is no longer ended', async () => {
        const { registry_dir, board, seen, runOf } = await crashedThenGrown({
            processes: [RESUMED_CLI],
        })

        const entry = await registered({ registry_dir })
        expect(entry?.ended ?? null).toBeNull()
        expect(entry?.ended_at_seq ?? null).toBeNull()
        expect(entry?.restarts).toBe(1)
        const state = await runOf()
        expect(state.run.engine_ended).toBeNull()
        expect(state.run.status).not.toBe('ended_with_error')
        expect(state.event_count).toBe(45)
        const header = board.rows
            .slice(seen)
            .flatMap(({ row }) => (row.kind === ROW_KIND.run ? [row.data] : []))
            .at(-1)
        if (!header) throw new Error('no header row after the check')
        expect(header.engine_ended ?? null).toBeNull()
        expect(header.status).not.toBe('ended_with_error')
    })

    test('its chat gets the row "Resumed from the command line." with the id resumed-cli-45', async () => {
        const { board, seen } = await crashedThenGrown({
            processes: [RESUMED_CLI],
        })

        const resumed = board.rows
            .slice(seen)
            .filter(
                ({ row }) =>
                    row.kind === ROW_KIND.event &&
                    row.data.text === 'Resumed from the command line.'
            )
        expect(resumed).toHaveLength(1)
        expect(resumed[0]?.agent_id).toBe('agent-1')
        expect(resumed[0]?.row.id).toMatch(/(^|-)resumed-cli-45$/)
    })

    test('with no live engine in the process list, the run stays ended', async () => {
        const { registry_dir, board, seen, runOf } = await crashedThenGrown({
            processes: [],
        })

        expect(await registered({ registry_dir })).toMatchObject({
            ended: CRASH,
            ended_at_seq: 40,
        })
        const state = await runOf()
        expect(state.event_count).toBe(45)
        expect(state.run.engine_ended).toEqual(CRASH)
        expect(
            board.rows
                .slice(seen)
                .some(({ row }) => row.id.includes('resumed-cli'))
        ).toBe(false)
    })

    test('when the process list can not be read, the run stays ended', async () => {
        const { registry_dir, runOf } = await crashedThenGrown({
            processes: [RESUMED_CLI],
            ps_error: 'ps: not found',
        })

        expect(await registered({ registry_dir })).toMatchObject({
            ended: CRASH,
            ended_at_seq: 40,
        })
        const state = await runOf()
        expect(state.event_count).toBe(45)
        expect(state.run.engine_ended).toEqual(CRASH)
    })
})

describe('an ended registry entry from before ended_at_seq', () => {
    test('gets the newest seq of its journal as ended_at_seq when the plugin loads', async () => {
        const folders = await disk()
        await writeRegistry({ ...folders, ended_at_seq: null })
        await writeJournal({
            ...folders,
            run_id: RUN,
            entries: journalOf({ count: 30 }),
        })

        const board = await createHarness(folders)
        harnesses.push(board)
        await board.read()

        expect(await registered(folders)).toMatchObject({
            ended: CRASH,
            ended_at_seq: 30,
        })
    })
})
