/**
 * The board server's runs in memory: each run the plugin started, its board
 * built from its journal records, the queue that keeps a run's work in
 * order, and the rows it adds to the chat.
 */
import type { BoardServerConfig, Replay, RunMemory } from './board-server-types'
import { errorText } from './board-server-util'
import { readRecord } from './board-vocabulary'
import { describeRecord, headerRow, rowsForRecord } from './make-rows'
import { applyEnded, applyRecord, createBoardState } from './reduce-board'
import { createReplyPoster } from './reply-post'
import { readJournal } from './run-journals'
import { createRunRegistry, type RunEntry } from './run-registry'

import type { BoardRow } from '../shared/board-rows'
import type { EngineRecord } from '../shared/board-rpc'
import type { EngineEnded } from '../shared/board-state'

/** After this many failed appends in a row, a run stops sending rows. */
const APPEND_FAILURES_BEFORE_STOP = 3

/**
 * The runs this plugin started, their queues, and the work on them. With a
 * `runs_dir`, every run in the registry is rebuilt from its journal there,
 * and `ready` resolves once that is done.
 */
export const createRunStore = ({ config }: { config: BoardServerConfig }) => {
    const {
        registry_path,
        runs_dir = null,
        append_row,
        run_command,
        env,
        home_dir,
        file_exists,
        now,
        log,
    } = config
    const registry = createRunRegistry({ path: registry_path, log })
    const runs = new Map<string, RunMemory>()
    const queues = new Map<string, Promise<unknown>>()
    const poster = createReplyPoster({
        run_command,
        env,
        home_dir,
        file_exists,
        now,
        log,
    })

    /** Runs `work` after everything already queued for the same run. */
    const enqueue = <Result>({
        run_id,
        work,
    }: {
        run_id: string
        work: () => Promise<Result>
    }): Promise<Result> => {
        const result = (queues.get(run_id) ?? Promise.resolve()).then(work)
        queues.set(
            run_id,
            result.catch(() => undefined)
        )
        return result
    }

    const appendRows = async ({
        memory,
        rows,
    }: {
        memory: RunMemory
        rows: BoardRow[]
    }) => {
        for (const row of rows) {
            if (memory.rows_stopped) return
            try {
                await append_row({ agent_id: memory.entry.agent_id, row })
                memory.append_failures = 0
            } catch (error) {
                memory.append_failures += 1
                log(
                    `[${memory.entry.run_id}] couldn't add row ${row.id} to chat ${memory.entry.agent_id}: ${errorText({ error })}`
                )
                if (memory.append_failures >= APPEND_FAILURES_BEFORE_STOP) {
                    memory.rows_stopped = true
                    log(
                        `[${memory.entry.run_id}] stopped adding rows: chat ${memory.entry.agent_id} seems gone. The side panel still updates.`
                    )
                }
            }
        }
    }

    const header = ({ memory }: { memory: RunMemory }): BoardRow =>
        headerRow({ state: memory.state, updated_at: now().toISOString() })

    /** Applies one record to a run's board; returns the rows it makes. */
    const applyOne = ({
        memory,
        record,
    }: {
        memory: Replay
        record: EngineRecord
    }): BoardRow[] => {
        const { run_id } = memory.state.run
        const read = readRecord({ record })
        if (read.status !== 'known') {
            if (read.status === 'bad_content') {
                log(
                    `[${run_id}] skipped record ${record.seq} (${record.kind}): its content doesn't fit.\n${read.error}`
                )
            }
            memory.state = {
                ...memory.state,
                event_count: memory.state.event_count + 1,
            }
            return []
        }
        const before = memory.state
        const after = applyRecord({ state: before, record: read.record })
        if (read.record.kind === 'reply_received') {
            poster.noteTaken({
                run_id,
                seq: read.record.seq,
                time: read.record.time,
                word: read.record.content.word,
                ticket: read.record.content.ticket ?? read.record.ticket,
            })
        }
        const described = describeRecord({
            before,
            after,
            record: read.record,
        })
        memory.state = described
            ? { ...after, latest: described.text, latest_at: read.record.time }
            : after
        return rowsForRecord({ run_id, before, after, record: read.record })
    }

    /**
     * Applies records in seq order from the run's `next_seq`. Lower seqs are
     * duplicates and skipped; a gap stops there (`gap` is the seq found).
     */
    const applyInOrder = ({
        memory,
        records,
    }: {
        memory: Replay
        records: EngineRecord[]
    }): {
        rows: Map<number, BoardRow[]>
        applied: number
        gap: number | null
    } => {
        const rows = new Map<number, BoardRow[]>()
        let applied = 0
        for (const record of records.toSorted(
            (left, right) => left.seq - right.seq
        )) {
            if (record.seq < memory.next_seq) continue
            if (record.seq > memory.next_seq) {
                return { rows, applied, gap: record.seq }
            }
            rows.set(record.seq, applyOne({ memory, record }))
            memory.next_seq += 1
            applied += 1
        }
        return { rows, applied, gap: null }
    }

    /**
     * Knows a run this plugin started, rebuilt from its journal `records`.
     * Their rows aren't added now; while the engine may still send, they are
     * kept until it sends those records again (see `handleEngineEvent`).
     */
    const remember = ({
        entry,
        records,
    }: {
        entry: RunEntry
        records: EngineRecord[]
    }): RunMemory => {
        const memory: RunMemory = {
            entry,
            state: createBoardState({
                run_id: entry.run_id,
                spec_number: entry.spec,
                demo: entry.demo,
                started_at: entry.started_at,
                log_path: entry.log_path,
            }),
            next_seq: 1,
            append_failures: 0,
            rows_stopped: false,
            unsent_rows: new Map(),
            size: null,
            changed_ms: null,
        }
        const { rows } = applyInOrder({ memory, records })
        // A run whose engine ended stays ended after a plugin restart.
        if (entry.ended) {
            memory.state = applyEnded({
                state: memory.state,
                ended: entry.ended,
            })
        } else {
            memory.unsent_rows = rows
        }
        runs.set(entry.run_id, memory)
        return memory
    }

    /** A run's journal records on disk; none without a runs folder. */
    const journalOf = ({ run_id }: { run_id: string }) =>
        runs_dir === null
            ? Promise.resolve([])
            : readJournal({ runs_dir, run_id, log })

    /** Rebuilds every run in the registry from its journal. */
    const load = async () => {
        const entries = registry.list()
        const journals = await Promise.all(
            entries.map(({ run_id }) => journalOf({ run_id }))
        )
        entries.forEach((entry, index) => {
            const memory = remember({ entry, records: journals[index] ?? [] })
            // An entry ended before `ended_at_seq` existed ended at its
            // journal's newest seq.
            if (entry.ended && entry.ended_at_seq === null) {
                updateEntry({
                    memory,
                    change: { ended_at_seq: memory.next_seq - 1 },
                })
            }
        })
    }

    /**
     * Changes a run's registry entry, and its copy in memory. Setting
     * `ended` also sets `ended_at_seq` to the newest seq applied; clearing it
     * clears that too.
     */
    const updateEntry = ({
        memory,
        change,
    }: {
        memory: RunMemory
        change: Partial<
            Pick<RunEntry, 'ended' | 'ended_at_seq' | 'restarts' | 'token'>
        >
    }) => {
        const full =
            change.ended === undefined
                ? change
                : {
                      ...change,
                      ended_at_seq: change.ended ? memory.next_seq - 1 : null,
                  }
        memory.entry = registry.update({
            run_id: memory.entry.run_id,
            change: full,
        }) ?? { ...memory.entry, ...full }
    }

    /** Marks a run's engine as ended (kept in the registry) and updates its header. */
    const endRun = async ({
        memory,
        ended,
    }: {
        memory: RunMemory
        ended: EngineEnded
    }) => {
        memory.state = applyEnded({ state: memory.state, ended })
        memory.unsent_rows.clear()
        updateEntry({ memory, change: { ended } })
        await appendRows({ memory, rows: [header({ memory })] })
    }

    // Every method waits for the registry's runs to be rebuilt first.
    const ready = load().catch((error: unknown) => {
        log(
            `Couldn't rebuild the runs from their journals: ${errorText({ error })}`
        )
    })

    return {
        registry,
        runs,
        queues,
        poster,
        enqueue,
        appendRows,
        header,
        applyInOrder,
        remember,
        journalOf,
        updateEntry,
        endRun,
        ready,
    }
}

export type RunStore = ReturnType<typeof createRunStore>
