import { rm, utimes } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    dirs,
    disk,
    inRepo,
    nothingToDoRun,
    plugin,
    stuckRun,
    writeJournal,
} from './journal-rebuild-helpers'
import { stamp } from './testing/journal-fixtures'

import { ROW_KIND } from '../shared/board-rows'

/**
 * The board follows the journal on disk of every run, its own runs included
 * (#701): a run its engine can't push to (such as one resumed with
 * `luca-run --resume`) still shows live. Pushes and disk reads share one
 * cursor, so a record adds its chat rows once, whichever way it comes.
 */

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** A run the board started, with a live engine, whose journal is on disk. */
const followedRun = async () => {
    const folders = await disk()
    const board = await plugin(folders)
    const { run_id, token } = await board.start()
    board.engineRunning({ run_id })
    await writeJournal({ ...folders, run_id, entries: stuckRun() })
    return { ...folders, board, run_id, token }
}

describe('the board follows its own runs on disk', () => {
    test('records on disk, with no push and the panel never read, reach the chat after one engine check', async () => {
        const { board, run_id } = await followedRun()
        const seen = board.rows.length

        await board.board.checkEngines()
        await board.board.idle()

        const added = board.rows.slice(seen)
        expect(added.map(({ row }) => row.id)).toContain(
            `${run_id}-e${stuckRun().length}`
        )
        expect(added.some(({ row }) => row.kind === ROW_KIND.stuck)).toBe(true)
        expect(new Set(added.map(({ agent_id }) => agent_id))).toEqual(
            new Set(['agent-1'])
        )
    })

    test('a record read from disk and then pushed adds its chat rows once', async () => {
        const { board, run_id, token } = await followedRun()
        await board.board.checkEngines()
        await board.board.idle()
        const seen = board.rows.length

        const reply = await board.board.handleEngineEvent({
            run_id,
            token,
            records: stamp({ entries: inRepo({ entries: stuckRun() }) }),
            ended: null,
        })
        await board.board.idle()

        expect(reply).toMatchObject({
            ok: true,
            next_seq: stuckRun().length + 1,
        })
        expect(board.rows.slice(seen)).toEqual([])
        const stuck_event = `${run_id}-e${stuckRun().length}`
        expect(
            board.rows.filter(({ row }) => row.id === stuck_event)
        ).toHaveLength(1)
    })

    test('with 50 runs the board did not start, its own run is still read and shown', async () => {
        const { board, run_id, runs_dir } = await followedRun()
        // Older than all 50 others, so a shared cap would leave it out.
        const old = new Date(Date.now() - 60 * 60 * 1000)
        await utimes(join(runs_dir, run_id, 'journal.jsonl'), old, old)
        for (const index of Array.from({ length: 50 }, (_, at) => at)) {
            await writeJournal({
                runs_dir,
                run_id: `20260925t0130${String(index).padStart(2, '0')}z-outside`,
                entries: nothingToDoRun(),
            })
        }

        const { runs } = await board.board.readBoard({
            workspace_id: 'ws-1',
            directory: '/repo',
            run_id,
        })
        const state = await board.stateOf({ run_id })

        expect(runs).toHaveLength(51)
        expect(state.run.status).toBe('stuck')
        expect(state.event_count).toBe(stuckRun().length)
    })
})
