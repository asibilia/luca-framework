/**
 * Following the runs this plugin started on disk (#701): their journals are
 * read again when they grow, so a run whose engine can't push (such as one
 * resumed with `luca-run --resume`) still shows live. A run marked ended
 * comes back when its journal grows and a live engine runs it.
 */
import type { RunStore } from './board-server-store'
import type { BoardServerConfig, RunMemory } from './board-server-types'
import { RESUMED_CLI_TEXT, resumedCliRow } from './engine-watch'
import { settle } from './reduce-board-settle'
import type { JournalFile } from './run-journals'

import type { BoardRow } from '../shared/board-rows'

export const createJournalFollow = ({
    config,
    store,
}: {
    config: BoardServerConfig
    store: RunStore
}) => {
    const { log, now } = config
    const {
        runs,
        enqueue,
        applyInOrder,
        appendRows,
        header,
        journalOf,
        updateEntry,
    } = store

    /** Takes the rows a run still holds from its rebuild at plugin load. */
    const takeHeld = ({ memory }: { memory: RunMemory }): BoardRow[] => {
        const rows = [...memory.unsent_rows.values()].flat()
        memory.unsent_rows.clear()
        return rows
    }

    /**
     * Reads again the journal of each run this plugin started that changed
     * since the last read, and applies the records past its `next_seq`
     * (the cursor pushes share), adding their rows to the chat at once.
     * The rows a run still holds from its rebuild at plugin load
     * (`unsent_rows`) go first, so they reach the chat even when no push
     * comes: with the first rows read from disk, or on an engine check
     * (`release_held`) after the first read since the load.
     */
    const readFollowed = async ({
        journals,
        release_held = false,
    }: {
        journals: JournalFile[]
        release_held?: boolean
    }) => {
        await Promise.all(
            journals.map(({ run_id, size, changed_ms }) => {
                const memory = runs.get(run_id)
                if (!memory) return
                const changed =
                    memory.size !== size || memory.changed_ms !== changed_ms
                // The first read since the load leaves a push its chance.
                const release =
                    release_held &&
                    memory.size !== null &&
                    memory.unsent_rows.size > 0
                if (!changed && !release) return
                return enqueue({
                    run_id,
                    work: async () => {
                        const { rows, applied } = applyInOrder({
                            memory,
                            records: changed ? await journalOf({ run_id }) : [],
                        })
                        memory.size = size
                        memory.changed_ms = changed_ms
                        const held =
                            applied > 0 || release ? takeHeld({ memory }) : []
                        if (applied === 0 && held.length === 0) return
                        await appendRows({
                            memory,
                            rows: [
                                ...held,
                                ...[...rows.values()].flat(),
                                header({ memory }),
                            ],
                        })
                    },
                })
            })
        )
    }

    /** The runs marked ended whose journal grew past `ended_at_seq`. */
    const returning = (): RunMemory[] =>
        [...runs.values()].filter(
            ({ entry, next_seq }) =>
                entry.ended !== null &&
                entry.ended_at_seq !== null &&
                next_seq - 1 > entry.ended_at_seq
        )

    /**
     * Brings back a run marked ended that has a live engine: clears its
     * `ended`, re-adds its header, and says so in its chat. Its restart
     * count is kept.
     */
    const comeBack = ({ memory }: { memory: RunMemory }) =>
        enqueue({
            run_id: memory.entry.run_id,
            work: async () => {
                if (memory.entry.ended === null) return
                const { run_id } = memory.entry
                const seq = memory.next_seq - 1
                updateEntry({ memory, change: { ended: null } })
                const time = now().toISOString()
                memory.rows_stopped = false
                memory.append_failures = 0
                memory.state = settle({
                    state: {
                        ...memory.state,
                        run: { ...memory.state.run, engine_ended: null },
                        latest: RESUMED_CLI_TEXT,
                        latest_at: time,
                    },
                })
                log(
                    `[${run_id}] came back: its journal grew to seq ${seq} and a live engine runs it.`
                )
                await appendRows({
                    memory,
                    rows: [
                        resumedCliRow({ run_id, seq, time }),
                        header({ memory }),
                    ],
                })
            },
        })

    return { readFollowed, returning, comeBack }
}

export type JournalFollow = ReturnType<typeof createJournalFollow>
