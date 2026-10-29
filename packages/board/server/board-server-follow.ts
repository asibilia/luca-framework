/**
 * Following the runs this plugin started on disk (#701): their journals are
 * read again when they grow, so a run whose engine can't push (such as one
 * resumed with `luca-run --resume`) still shows live. A run marked ended
 * comes back when its journal grows and a live engine runs it.
 */
import type { RunStore } from './board-server-store'
import type { BoardServerConfig, RunMemory } from './board-server-types'
import { RESUMED_CLI_TEXT, resumedCliRow } from './engine-watch'
import type { JournalFile } from './run-journals'

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

    /**
     * Reads again the journal of each run this plugin started that changed
     * since the last read, and applies the records past its `next_seq`
     * (the cursor pushes share), adding their rows to the chat at once.
     */
    const readFollowed = async ({ journals }: { journals: JournalFile[] }) => {
        await Promise.all(
            journals.map(({ run_id, size, changed_ms }) => {
                const memory = runs.get(run_id)
                if (
                    !memory ||
                    (memory.size === size && memory.changed_ms === changed_ms)
                ) {
                    return
                }
                return enqueue({
                    run_id,
                    work: async () => {
                        const records = await journalOf({ run_id })
                        const { rows, applied } = applyInOrder({
                            memory,
                            records,
                        })
                        memory.size = size
                        memory.changed_ms = changed_ms
                        if (applied === 0) return
                        await appendRows({
                            memory,
                            rows: [
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
                memory.state = {
                    ...memory.state,
                    run: { ...memory.state.run, engine_ended: null },
                    latest: RESUMED_CLI_TEXT,
                    latest_at: time,
                }
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
