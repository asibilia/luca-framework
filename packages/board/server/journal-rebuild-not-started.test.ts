import { rm } from 'node:fs/promises'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    dirs,
    disk,
    REPO,
    writeJournal,
    plugin,
    finishedRun,
    stuckRun,
    nothingToDoRun,
} from './journal-rebuild-helpers'
import {
    intakeOfThree,
    intakeRefused,
    runStarted,
    stamp,
    ticketWorktreeCreated,
} from './testing/journal-fixtures'

/**
 * A run the board did not start is rebuilt from its journal on disk too
 * (#412). The helpers are in `journal-rebuild-helpers.ts`; the other topics
 * are in the `journal-rebuild-*.test.ts` files beside this one.
 */

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
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
