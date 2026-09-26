import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness } from './testing/board-harness'
import {
    intakeOfThree,
    intakeRefused,
    nothingToDo,
    pullRequestOpened,
    runStarted,
    runStopped,
    stamp,
    ticketStuck,
    ticketWorktreeCreated,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

import type { BoardRow } from '../shared/board-rows'
import type { BoardState } from '../shared/board-state'

/**
 * The board rebuilds every run from its journal on disk (#412): on start,
 * after a reload, and for runs it didn't launch. Each test writes journals
 * to a runs folder (`<runs_dir>/<run_id>/journal.jsonl`, as the engine
 * does) and reads the board a plugin built from them.
 */

const dirs: string[] = []

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

const tempDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-board-journal-'))
    dirs.push(dir)
    return dir
}

/** A registry folder and a runs folder that outlive one plugin. */
const disk = async () => ({
    registry_dir: await tempDir(),
    runs_dir: await tempDir(),
})

/** The repo of the harness's chats, and so the folder of workspace `ws-1`. */
const REPO = '/repo'

/**
 * The entries with their `run_started` naming the repo the run is on, as
 * the engine journals it.
 */
const inRepo = ({ entries }: { entries: Entry[] }): Entry[] =>
    entries.map((entry) =>
        entry.kind === 'run_started'
            ? {
                  ...entry,
                  content: { ...(entry.content as object), repo: REPO },
              }
            : entry
    )

/**
 * Writes a run on `REPO`'s journal the way the engine does: one JSON line
 * per record.
 */
const writeJournal = async ({
    runs_dir,
    run_id,
    entries,
}: {
    runs_dir: string
    run_id: string
    entries: Entry[]
}) => {
    await mkdir(join(runs_dir, run_id), { recursive: true })
    const lines = stamp({ entries: inRepo({ entries }) }).map((record) =>
        JSON.stringify(record)
    )
    await writeFile(
        join(runs_dir, run_id, 'journal.jsonl'),
        `${lines.join('\n')}\n`
    )
}

/**
 * A board plugin on `registry_dir` and `runs_dir`, built with the shared
 * harness. Making a second one on the same folders is a reload.
 */
const plugin = async ({
    registry_dir,
    runs_dir,
}: {
    registry_dir: string
    runs_dir: string
}) => {
    const harness = await createHarness({ registry_dir, runs_dir })

    /** Starts a run from a chat, as `/luca-run 10` does. */
    const start = async () => {
        const { output, run_id, token } = await harness.start()
        if (!output.ok) throw new Error(output.message)
        return { run_id, token }
    }

    /** One run's full state, as the side panel of `ws-1` (in `REPO`) reads it. */
    const stateOf = async ({
        run_id,
    }: {
        run_id: string
    }): Promise<BoardState> => {
        const { selected } = await harness.board.readBoard({
            workspace_id: 'ws-1',
            directory: REPO,
            run_id,
        })
        if (selected?.run.run_id !== run_id) {
            throw new Error(`the board doesn't show run ${run_id}`)
        }
        return selected
    }

    return { ...harness, start, stateOf }
}

/** A whole run of spec 10: three tickets built, the review passed, a PR. */
const finishedRun = (): Entry[] => [
    ...intakeOfThree(),
    ...wholeTicket({ ticket: 11 }),
    ...wholeTicket({ ticket: 12 }),
    ...wholeTicket({ ticket: 13 }),
    pullRequestOpened({
        number: 408,
        url: 'https://github.com/acme/app/pull/408',
    }),
]

/** Spec 10 stopped at intake for a wrong login. */
const stoppedRun = (): Entry[] => [
    ...intakeOfThree(),
    runStopped({ ticket: null, role: null, reason: 'the login is wrong' }),
]

/** Spec 10 with ticket 13 stuck and nothing else running. */
const stuckRun = (): Entry[] => [
    ...intakeOfThree(),
    ticketWorktreeCreated({ ticket: 13 }),
    ticketStuck({ ticket: 13, reason: 'red_check_failed', detail: 'x' }),
]

const nothingToDoRun = (): Entry[] => [runStarted({ spec: 10 }), nothingToDo()]

/** A run the board launched, whose journal then went on without it. */
const launchedRun = async ({
    registry_dir,
    runs_dir,
    entries,
}: {
    registry_dir: string
    runs_dir: string
    entries: Entry[]
}) => {
    const first = await plugin({ registry_dir, runs_dir })
    const { run_id, token } = await first.start()
    await first.board.handleEngineEvent({
        run_id,
        token,
        records: stamp({ entries: [runStarted({ spec: 10 })] }),
        ended: null,
    })
    await first.board.idle()
    await writeJournal({ runs_dir, run_id, entries })
    return { run_id, token }
}

describe('a reload rebuilds each run from its journal on disk', () => {
    test('a finished run shows done with its pull request after a reload', async () => {
        const folders = await disk()
        const { run_id } = await launchedRun({
            ...folders,
            entries: finishedRun(),
        })

        const reloaded = await plugin(folders)
        const state = await reloaded.stateOf({ run_id })

        expect(state.run.status).toBe('done')
        expect(state.run.pr_number).toBe(408)
        expect(state.run.pr_url).toBe('https://github.com/acme/app/pull/408')
        expect(state.tickets.map((ticket) => ticket.stage)).toEqual([
            'done',
            'done',
            'done',
        ])
        expect(state.event_count).toBe(finishedRun().length)
    })

    test('a stopped run shows stopped with its reason after a reload', async () => {
        const folders = await disk()
        const { run_id } = await launchedRun({
            ...folders,
            entries: stoppedRun(),
        })

        const state = await (await plugin(folders)).stateOf({ run_id })

        expect(state.run.status).toBe('stopped')
        expect(state.run.stopped?.reason).toBe('the login is wrong')
    })

    test('a stuck run shows stuck with what needs you after a reload', async () => {
        const folders = await disk()
        const { run_id } = await launchedRun({
            ...folders,
            entries: stuckRun(),
        })

        const state = await (await plugin(folders)).stateOf({ run_id })

        expect(state.run.status).toBe('stuck')
        expect(state.needs_you.map((item) => item.ticket)).toEqual([13])
    })

    test('a nothing-to-do run shows nothing to do after a reload', async () => {
        const folders = await disk()
        const { run_id } = await launchedRun({
            ...folders,
            entries: nothingToDoRun(),
        })

        const state = await (await plugin(folders)).stateOf({ run_id })

        expect(state.run.status).toBe('nothing_to_do')
    })

    test('the run list shows the rebuilt status of every run after a reload', async () => {
        const folders = await disk()
        const done = await launchedRun({ ...folders, entries: finishedRun() })
        const stopped = await launchedRun({ ...folders, entries: stoppedRun() })
        const stuck = await launchedRun({ ...folders, entries: stuckRun() })

        const { runs } = await (await plugin(folders)).read()
        const statusOf = (run_id: string) =>
            runs.find((run) => run.run_id === run_id)?.status

        expect(statusOf(done.run_id)).toBe('done')
        expect(statusOf(stopped.run_id)).toBe('stopped')
        expect(statusOf(stuck.run_id)).toBe('stuck')
    })

    test('a reload rebuilds the same state the engine events built', async () => {
        const folders = await disk()
        const first = await plugin(folders)
        const { run_id, token } = await first.start()
        const records = stamp({ entries: inRepo({ entries: finishedRun() }) })
        await writeJournal({ ...folders, run_id, entries: finishedRun() })
        await first.board.handleEngineEvent({
            run_id,
            token,
            records,
            ended: { ok: true, message: 'The run finished.' },
        })
        await first.board.idle()
        const live = await first.stateOf({ run_id })

        const rebuilt = await (await plugin(folders)).stateOf({ run_id })

        expect({ ...rebuilt, latest: null }).toEqual({ ...live, latest: null })
    })

    test('the engine check after a reload neither restarts nor stops a finished run', async () => {
        const folders = await disk()
        const { run_id } = await launchedRun({
            ...folders,
            entries: finishedRun(),
        })

        const reloaded = await plugin(folders)
        const check = await reloaded.board.checkEngines()

        expect(check).toEqual({ restarted: [], stopped: [] })
        expect(reloaded.spawns).toEqual([])
        expect((await reloaded.stateOf({ run_id })).run.status).toBe('done')
    })

    test('after a reload the engine resending its journal applies only the new records', async () => {
        const folders = await disk()
        const { run_id, token } = await launchedRun({
            ...folders,
            entries: stuckRun(),
        })
        const reloaded = await plugin(folders)
        const before = await reloaded.stateOf({ run_id })

        const reply = await reloaded.board.handleEngineEvent({
            run_id,
            token,
            records: stamp({
                entries: [...stuckRun(), ticketWorktreeCreated({ ticket: 11 })],
            }),
            ended: null,
        })
        await reloaded.board.idle()

        expect(before.event_count).toBe(stuckRun().length)
        expect(reply.ok).toBe(true)
        expect(reply.next_seq).toBe(stuckRun().length + 2)
        const after = await reloaded.stateOf({ run_id })
        expect(after.event_count).toBe(stuckRun().length + 1)
        expect(after.needs_you.map((item) => item.ticket)).toEqual([13])
    })
})

/** Spec 10 with ticket 11 built and ticket 13 stuck: rows of every kind. */
const resentRun = (): Entry[] => [
    ...intakeOfThree(),
    ...wholeTicket({ ticket: 11 }),
    ticketWorktreeCreated({ ticket: 13 }),
    ticketStuck({ ticket: 13, reason: 'red_check_failed', detail: 'x' }),
]

/** The first seq the engine resends after the reload: past the intake. */
const RESENT_FROM = intakeOfThree().length + 1

/** A row with its run id taken out, to compare rows of two runs. */
const withoutRunId = ({ run_id, row }: { run_id: string; row: BoardRow }) =>
    JSON.parse(JSON.stringify(row).replaceAll(run_id, '<run>')) as BoardRow

/** The seq of an event row, from its id (`<run_id>-e<seq>`). */
const eventSeq = ({ run_id, row }: { run_id: string; row: BoardRow }) =>
    row.kind === 'luca-board-event'
        ? Number(row.id.slice(`${run_id}-e`.length))
        : null

/**
 * The rows a board that got the run live adds when records `from`..M come
 * in, after records 1..`from`-1 came in first, without the header row.
 */
const liveRowsFrom = async ({
    entries,
    from,
}: {
    entries: Entry[]
    from: number
}) => {
    const live = await plugin(await disk())
    const { run_id, token } = await live.start()
    const records = stamp({ entries })
    await live.board.handleEngineEvent({
        run_id,
        token,
        records: records.slice(0, from - 1),
        ended: null,
    })
    await live.board.idle()
    const before = live.rows.map(({ row }) => row)
    const seen = live.rows.length
    await live.board.handleEngineEvent({
        run_id,
        token,
        records: records.slice(from - 1),
        ended: null,
    })
    await live.board.idle()
    return {
        before: before.map((row) => withoutRunId({ run_id, row })),
        after: live.rows
            .slice(seen)
            .map(({ row }) => withoutRunId({ run_id, row }))
            .filter((row) => row.kind !== 'luca-board-run'),
    }
}

describe('after a reload the engine resends records the board rebuilt from disk', () => {
    test('the rows of the resent records and a new header reach the chat, none below the first resent seq', async () => {
        const folders = await disk()
        const entries = resentRun()
        const { run_id, token } = await launchedRun({ ...folders, entries })
        const reloaded = await plugin(folders)
        await reloaded.stateOf({ run_id })
        await reloaded.board.idle()
        const seen = reloaded.rows.length

        const reply = await reloaded.board.handleEngineEvent({
            run_id,
            token,
            records: stamp({ entries }).slice(RESENT_FROM - 1),
            ended: null,
        })
        await reloaded.board.idle()
        const added = reloaded.rows.slice(seen).map(({ row }) => row)
        const live = await liveRowsFrom({ entries, from: RESENT_FROM })

        expect(reply.ok).toBe(true)
        expect(reply.next_seq).toBe(entries.length + 1)
        expect(
            added
                .filter((row) => row.kind !== 'luca-board-run')
                .map((row) => withoutRunId({ run_id, row }))
        ).toEqual(live.after)
        expect(live.after.length).toBeGreaterThan(0)
        expect(added.at(-1)).toMatchObject({
            id: `${run_id}-run`,
            kind: 'luca-board-run',
            data: { status: 'stuck', needs_you: 1 },
        })
        const seqs = added
            .map((row) => eventSeq({ run_id, row }))
            .filter((seq) => seq !== null)
        expect(seqs.length).toBeGreaterThan(0)
        expect(seqs.every((seq) => seq >= RESENT_FROM)).toBe(true)
        // Records below the first resent seq did make event rows live.
        expect(
            live.before.some(
                (row) =>
                    row.kind === 'luca-board-event' && row.id !== '<run>-e1'
            )
        ).toBe(true)
    })

    test('resending the same records a second time adds no rows', async () => {
        const folders = await disk()
        const entries = resentRun()
        const { run_id, token } = await launchedRun({ ...folders, entries })
        const reloaded = await plugin(folders)
        const resent = stamp({ entries }).slice(RESENT_FROM - 1)
        await reloaded.board.handleEngineEvent({
            run_id,
            token,
            records: resent,
            ended: null,
        })
        await reloaded.board.idle()
        const seen = reloaded.rows.length

        const reply = await reloaded.board.handleEngineEvent({
            run_id,
            token,
            records: resent,
            ended: null,
        })
        await reloaded.board.idle()

        expect(seen).toBeGreaterThan(0)
        expect(reply.ok).toBe(true)
        expect(reply.next_seq).toBe(entries.length + 1)
        expect(reloaded.rows.slice(seen)).toEqual([])
    })

    test('a run whose engine ended adds no rebuilt rows when records are resent', async () => {
        const folders = await disk()
        const entries = resentRun()
        const first = await plugin(folders)
        const { run_id, token } = await first.start()
        await first.board.handleEngineEvent({
            run_id,
            token,
            records: stamp({ entries: [runStarted({ spec: 10 })] }),
            ended: { ok: false, message: 'The engine stopped.' },
        })
        await first.board.idle()
        await writeJournal({ ...folders, run_id, entries })
        const reloaded = await plugin(folders)
        await reloaded.stateOf({ run_id })
        await reloaded.board.idle()
        const seen = reloaded.rows.length

        const reply = await reloaded.board.handleEngineEvent({
            run_id,
            token,
            records: stamp({ entries }).slice(RESENT_FROM - 1),
            ended: null,
        })
        await reloaded.board.idle()

        expect(reply.ok).toBe(true)
        expect(reply.next_seq).toBe(entries.length + 1)
        expect(reloaded.rows.slice(seen)).toEqual([])
    })
})

describe('a run the board did not start', () => {
    const OUTSIDE = '20260925t013006z-ebe29030'

    test('a run started from the command line shows up with its state', async () => {
        const folders = await disk()
        await writeJournal({
            ...folders,
            run_id: OUTSIDE,
            entries: finishedRun(),
        })

        const board = await plugin(folders)
        const { runs } = await board.board.readBoard({
            workspace_id: 'ws-1',
            directory: REPO,
            run_id: null,
        })
        const state = await board.stateOf({ run_id: OUTSIDE })

        expect(runs.map((run) => run.run_id)).toContain(OUTSIDE)
        expect(runs.find((run) => run.run_id === OUTSIDE)).toMatchObject({
            spec_number: 10,
            status: 'done',
        })
        expect(state.run.pr_number).toBe(408)
        expect(state.tickets.map((ticket) => ticket.number)).toEqual([
            11, 12, 13,
        ])
    })

    test('a run started from the command line while the board runs shows up on the next read', async () => {
        const folders = await disk()
        const board = await plugin(folders)
        await board.board.readBoard({
            workspace_id: 'ws-1',
            directory: REPO,
            run_id: null,
        })

        await writeJournal({
            ...folders,
            run_id: OUTSIDE,
            entries: stuckRun(),
        })
        const state = await board.stateOf({ run_id: OUTSIDE })

        expect(state.run.status).toBe('stuck')
        expect(state.needs_you.map((item) => item.ticket)).toEqual([13])
    })

    test('it adds no chat rows', async () => {
        const folders = await disk()
        await writeJournal({
            ...folders,
            run_id: OUTSIDE,
            entries: finishedRun(),
        })

        const board = await plugin(folders)
        await board.stateOf({ run_id: OUTSIDE })
        await board.board.checkEngines()
        await board.board.idle()

        expect(board.rows).toEqual([])
    })

    test('it is read-only: the board takes no engine events for it', async () => {
        const folders = await disk()
        await writeJournal({
            ...folders,
            run_id: OUTSIDE,
            entries: stuckRun(),
        })

        const board = await plugin(folders)
        const reply = await board.board.handleEngineEvent({
            run_id: OUTSIDE,
            token: 'any-token',
            records: stamp({
                entries: [...stuckRun(), ticketWorktreeCreated({ ticket: 11 })],
            }),
            ended: null,
        })
        await board.board.idle()

        expect(reply.ok).toBe(false)
        const state = await board.stateOf({ run_id: OUTSIDE })
        expect(state.event_count).toBe(stuckRun().length)
        expect(board.rows).toEqual([])
    })

    test('it is read-only: the engine check never restarts it', async () => {
        const folders = await disk()
        await writeJournal({
            ...folders,
            run_id: OUTSIDE,
            entries: [
                ...intakeOfThree(),
                ticketWorktreeCreated({ ticket: 11 }),
            ],
        })

        const board = await plugin(folders)
        await board.stateOf({ run_id: OUTSIDE })
        const check = await board.board.checkEngines()

        expect(check.restarted).toEqual([])
        expect(board.spawns).toEqual([])
    })

    test('a nothing-to-do run from the command line shows nothing to do', async () => {
        const folders = await disk()
        await writeJournal({
            ...folders,
            run_id: OUTSIDE,
            entries: nothingToDoRun(),
        })

        const board = await plugin(folders)
        const state = await board.stateOf({ run_id: OUTSIDE })

        expect(state.run.status).toBe('nothing_to_do')
    })

    test('a run refused at intake from the command line shows refused', async () => {
        const folders = await disk()
        await writeJournal({
            ...folders,
            run_id: OUTSIDE,
            entries: [
                runStarted({ spec: 10 }),
                intakeRefused({
                    problems: [
                        { ticket: 11, missing: ['acceptance criteria'] },
                    ],
                }),
            ],
        })

        const board = await plugin(folders)
        const state = await board.stateOf({ run_id: OUTSIDE })

        expect(state.run.status).toBe('refused')
        expect(state.run.refusal.length).toBeGreaterThan(0)
    })
})
