import { rm } from 'node:fs/promises'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    dirs,
    disk,
    writeJournal,
    plugin,
    launchedRun,
} from './journal-rebuild-helpers'
import {
    intakeOfThree,
    runStarted,
    stamp,
    ticketStuck,
    ticketWorktreeCreated,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

import type { BoardRow } from '../shared/board-rows'

/**
 * After a reload the engine resends records the board already rebuilt from
 * disk (#412). The helpers are in `journal-rebuild-helpers.ts`; the other
 * topics are in the `journal-rebuild-*.test.ts` files beside this one.
 */

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
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
