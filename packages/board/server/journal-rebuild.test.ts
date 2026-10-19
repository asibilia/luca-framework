import { rm } from 'node:fs/promises'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    dirs,
    disk,
    inRepo,
    writeJournal,
    plugin,
    finishedRun,
    stuckRun,
    nothingToDoRun,
    launchedRun,
} from './journal-rebuild-helpers'
import {
    intakeOfThree,
    runStopped,
    stamp,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

/**
 * The board rebuilds every run from its journal on disk (#412): on start,
 * after a reload, and for runs it didn't launch. This file is the reload:
 * each run is rebuilt from its journal on disk. The helpers are in
 * `journal-rebuild-helpers.ts`; the other topics are in the
 * `journal-rebuild-*.test.ts` files beside this one.
 */

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** Spec 10 stopped at intake for a wrong login. */
const stoppedRun = (): Entry[] => [
    ...intakeOfThree(),
    runStopped({ ticket: null, role: null, reason: 'the login is wrong' }),
]

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
