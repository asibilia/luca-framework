import filter from 'lodash/filter'
import last from 'lodash/last'
import take from 'lodash/take'
import { z } from 'zod'

import type { JournalRecord } from '../journal/journal-record'

/** The most records one send carries. */
export const BOARD_BATCH_SIZE = 100

/** How the engine process ended: sent once, as the run's last event. */
export const BoardEndedSchema = z.object({
    ok: z.boolean(),
    message: z.string(),
})

export type BoardEnded = z.infer<typeof BoardEndedSchema>

/**
 * The board's answer to a send. `next_seq` is the next journal seq the board
 * wants; lower than what was sent means it lost state and wants a replay.
 */
export const BoardReplySchema = z.object({
    ok: z.boolean(),
    next_seq: z.number().int().min(1),
    message: z.string(),
})

export type BoardReply = z.infer<typeof BoardReplySchema>

/**
 * How the engine reaches the board. Journal records go over it verbatim; the
 * board keeps and reduces the run's state, the engine computes nothing for
 * it. `createPaseoBoardLink` is the real one; tests use one in memory.
 */
export type BoardLink = {
    send: (args: {
        records: JournalRecord[]
        ended: BoardEnded | null
    }) => Promise<BoardReply>
    /** Lets go of the connection, if any. Called once, by `end`. */
    close?: () => Promise<void>
}

/** What `runEngine` and the command line use to keep the board up to date. */
export type BoardSync = {
    /** Sends every record the board does not have yet. Never throws. */
    sync: (args: { records: JournalRecord[] }) => Promise<void>
    /**
     * Syncs `records` (if given), then tells the board the engine process
     * ended, then closes the link. Never throws.
     */
    end: (args: {
        records?: JournalRecord[]
        ok: boolean
        message: string
    }) => Promise<void>
}

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * Keeps the board in step with the journal. It holds a cursor, the next seq
 * the board wants (1 at first). Each `sync` sends every record from the
 * cursor on, in batches of `BOARD_BATCH_SIZE`, and moves the cursor to the
 * board's `next_seq`. A board that answers with a lower `next_seq` (it
 * restarted, or saw a gap) gets the journal again from there.
 *
 * The board must never break a run: a failed send or a not-ok answer is
 * logged (once per distinct message) and swallowed.
 *
 * @param link - The transport to the board.
 * @param log - Where problems go. Defaults to `console.error`.
 *
 * @example
 * const board = createBoardSync({ link: createPaseoBoardLink({ plugin_id, run_id, token }) })
 * await runEngine({ journal, tracker, board })
 * await board.end({ records: journal.read(), ok: true, message: 'PR opened' })
 */
export const createBoardSync = ({
    link,
    log,
}: {
    link: BoardLink
    log?: (message: string) => void
}): BoardSync => {
    const write = log ?? ((message: string) => console.error(message))
    const logged = new Set<string>()
    let cursor = 1

    const report = ({ message }: { message: string }) => {
        if (logged.has(message)) return
        logged.add(message)
        write(`[board] ${message}`)
    }

    const send = async ({
        records,
        ended,
    }: {
        records: JournalRecord[]
        ended: BoardEnded | null
    }): Promise<BoardReply | null> => {
        try {
            const reply = await link.send({ records, ended })
            if (!reply.ok) report({ message: `not ok: ${reply.message}` })
            return reply
        } catch (error) {
            report({ message: `send failed: ${errorText(error)}` })
            return null
        }
    }

    const sync: BoardSync['sync'] = async ({ records }) => {
        const newest = last(records)?.seq ?? 0
        // Each record once, plus room for a few replays from the start.
        const rounds = 2 * Math.ceil(records.length / BOARD_BATCH_SIZE) + 2
        for (let round = 0; round < rounds; round += 1) {
            const batch = take(
                filter(records, (record) => record.seq >= cursor),
                BOARD_BATCH_SIZE
            )
            if (batch.length === 0) return
            const reply = await send({ records: batch, ended: null })
            if (reply === null) return
            const before = cursor
            // Never past the newest record, or new ones would be skipped.
            cursor = Math.min(reply.next_seq, newest + 1)
            if (cursor === before) return
        }
    }

    const end: BoardSync['end'] = async ({ records, ok, message }) => {
        if (records !== undefined) await sync({ records })
        await send({ records: [], ended: { ok, message } })
        try {
            await link.close?.()
        } catch (error) {
            report({ message: `close failed: ${errorText(error)}` })
        }
    }

    return { sync, end }
}
