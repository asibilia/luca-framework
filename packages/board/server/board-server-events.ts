/**
 * `engine.event`: applies a run's journal records, sent by the engine, in
 * seq order, and adds the rows they make.
 */
import { timingSafeEqual } from 'node:crypto'

import type { RunStore } from './board-server-store'
import type { RunMemory } from './board-server-types'
import { applyEnded } from './reduce-board'

import type { BoardRow } from '../shared/board-rows'
import type {
    EngineEventInput,
    EngineEventOutput,
    EngineRecord,
} from '../shared/board-rpc'

const sameToken = ({ left, right }: { left: string; right: string }) => {
    const a = Buffer.from(left)
    const b = Buffer.from(right)
    return a.length === b.length && timingSafeEqual(a, b)
}

export const createEngineEvents = ({ store }: { store: RunStore }) => {
    const {
        runs,
        enqueue,
        applyInOrder,
        appendRows,
        header,
        updateEntry,
        ready,
    } = store

    /**
     * The kept rows of records rebuilt from disk that the engine sent again.
     * The engine sends from the first record it hasn't had an answer for, so
     * the chat already has the rows of every lower seq: those are dropped.
     */
    const takeUnsentRows = ({
        memory,
        records,
    }: {
        memory: RunMemory
        records: EngineRecord[]
    }): { rows: BoardRow[]; taken: number } => {
        const rows: BoardRow[] = []
        let taken = 0
        if (memory.unsent_rows.size === 0 || records.length === 0) {
            return { rows, taken }
        }
        const lowest = Math.min(...records.map((record) => record.seq))
        const sent = new Set(records.map((record) => record.seq))
        for (const [seq, seq_rows] of memory.unsent_rows) {
            if (seq < lowest) {
                memory.unsent_rows.delete(seq)
            } else if (sent.has(seq)) {
                rows.push(...seq_rows)
                memory.unsent_rows.delete(seq)
                taken += 1
            }
        }
        return { rows, taken }
    }

    /**
     * `engine.event`: applies a run's journal records in seq order from its
     * `next_seq`. Lower seqs are duplicates and skipped (but a record rebuilt
     * from disk adds its rows the first time the engine sends it); a gap
     * stops there and the reply's `next_seq` asks the engine to resend from it.
     */
    const handleEngineEvent = async (
        input: EngineEventInput
    ): Promise<EngineEventOutput> => {
        await ready
        // A run this plugin didn't start is read-only: it isn't in `runs`.
        const memory = runs.get(input.run_id)
        if (!memory) {
            return {
                ok: false,
                next_seq: 0,
                message: `The board doesn't know run ${input.run_id}.`,
            }
        }
        if (!sameToken({ left: input.token, right: memory.entry.token })) {
            return {
                ok: false,
                next_seq: 0,
                message: `Wrong token for run ${input.run_id}.`,
            }
        }
        return enqueue({
            run_id: input.run_id,
            work: async () => {
                const unsent = takeUnsentRows({
                    memory,
                    records: input.records,
                })
                const {
                    rows: new_rows,
                    applied,
                    gap,
                } = applyInOrder({
                    memory,
                    records: input.records,
                })
                const rows = [...unsent.rows, ...[...new_rows.values()].flat()]
                if (gap === null && input.ended) {
                    memory.state = applyEnded({
                        state: memory.state,
                        ended: input.ended,
                    })
                    memory.unsent_rows.clear()
                    updateEntry({ memory, change: { ended: input.ended } })
                }
                if (
                    unsent.taken > 0 ||
                    applied > 0 ||
                    (gap === null && input.ended)
                ) {
                    rows.push(header({ memory }))
                }
                await appendRows({ memory, rows })
                const message =
                    gap === null
                        ? `Applied ${applied} records.`
                        : `Applied ${applied} records, then found seq ${gap} while waiting for ${memory.next_seq}: resend from ${memory.next_seq}.`
                return { ok: true, next_seq: memory.next_seq, message }
            },
        })
    }

    return { handleEngineEvent }
}
