import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { join, resolve } from 'node:path'

import { readRecord } from './board-vocabulary'
import {
    engineArgs,
    mintRunId,
    parseRunArgs,
    resolveEngine,
} from './engine-launch'
import {
    engineStoppedText,
    liveRunIds,
    MAX_AUTO_RESTARTS,
    parseUnfinished,
    restartRow,
    restartText,
    resumeArgs,
    UNFINISHED_TIMEOUT_MS,
    type StopWhy,
    type UnfinishedRun,
} from './engine-watch'
import { describeRecord, headerRow, rowsForRecord } from './make-rows'
import { applyEnded, applyRecord, createBoardState } from './reduce-board'
import { listJournals, readJournal } from './run-journals'
import { createRunRegistry, type RunEntry } from './run-registry'

import type { BoardRow } from '../shared/board-rows'
import type {
    BoardReadInput,
    BoardReadOutput,
    EngineEventInput,
    EngineEventOutput,
    EngineRecord,
    RunStartInput,
    RunStartOutput,
} from '../shared/board-rpc'
import type { BoardState, EngineEnded } from '../shared/board-state'
import {
    EngineSettingsSchema,
    type EngineSettings,
} from '../shared/engine-settings'

/** What the server asks the host to spawn: detached, output to a log file. */
export type SpawnRequest = {
    command: string
    args: string[]
    env: Record<string, string>
    cwd: string
    log_path: string
    /** Called if the process fails to start after `spawn_engine` returned. */
    on_error: (error: unknown) => void
}

export type SpawnEngine = (request: SpawnRequest) => { pid: number | null }

/** A short command the server runs and waits for, such as `luca-run --unfinished`. */
export type CommandRequest = {
    command: string
    args: string[]
    cwd: string
    env: Record<string, string>
    timeout_ms: number
}

/** How a command ended: `exit_code` is `null` when it was killed or timed out. */
export type CommandResult = {
    exit_code: number | null
    stdout: string
    stderr: string
}

/** Runs a command to its end. Never throws: a failure is in the result. */
export type RunCommand = (request: CommandRequest) => Promise<CommandResult>

/** Every running process's full command line. */
export type ListProcesses = () => Promise<string[]>

/** What one engine check did, by run id. */
export type EngineCheck = { restarted: string[]; stopped: string[] }

/** The run phases after which no engine is needed. */
const OVER_PHASES = new Set(['done', 'refused', 'nothing_to_do'])

/** Appends (or replaces, by id) one row in a chat's timeline. */
export type AppendRow = ({
    agent_id,
    row,
}: {
    agent_id: string
    row: BoardRow
}) => Promise<void>

/** After this many failed appends in a row, a run stops sending rows. */
const APPEND_FAILURES_BEFORE_STOP = 3

/** The longest `run.start` waits for the header row before it returns. */
const HEADER_WAIT_MS = 3000

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const randomSuffix = (): string =>
    Array.from(
        { length: 4 },
        () => SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)] ?? 'x'
    ).join('')

const errorText = ({ error }: { error: unknown }): string =>
    error instanceof Error ? error.message : String(error)

const sameToken = ({ left, right }: { left: string; right: string }) => {
    const a = Buffer.from(left)
    const b = Buffer.from(right)
    return a.length === b.length && timingSafeEqual(a, b)
}

/** A run's board, built from its journal records so far. */
type Replay = {
    state: BoardState
    /** The next journal seq the board wants (starts at 1). */
    next_seq: number
}

/** One run the plugin started: its registry entry and its board in memory. */
type RunMemory = Replay & {
    entry: RunEntry
    append_failures: number
    rows_stopped: boolean
    /**
     * The rows of records rebuilt from disk, by seq, that the chat may not
     * have: the engine may have written them while the plugin was down.
     * Added when the engine sends those records again.
     */
    unsent_rows: Map<number, BoardRow[]>
}

/**
 * A run the plugin didn't start (such as one from the command line), read
 * from its journal on disk. Read-only: no chat rows, no engine events, no
 * restarts. `size` and `changed_ms` are its journal's when last read.
 * `repo` is the repo its `run_started` names, `null` when it names none.
 */
type OutsideRun = Replay & {
    size: number
    changed_ms: number
    repo: string | null
}

/** The repo a run's `run_started` record names, if any. */
const repoOf = ({ records }: { records: EngineRecord[] }): string | null => {
    const started = records.find((record) => record.kind === 'run_started')
    const content: unknown = started?.content
    if (typeof content !== 'object' || content === null) return null
    const repo: unknown = (content as { repo?: unknown }).repo
    return typeof repo === 'string' && repo !== '' ? resolve(repo) : null
}

/** How many runs the plugin didn't start it shows, the latest changed first. */
const OUTSIDE_RUNS_SHOWN = 50

/**
 * The board plugin's server logic, with every side effect injected so tests
 * drive it without Paseo: rows go through `append_row`, the engine starts
 * through `spawn_engine`, and runs persist to `registry_path`. Engine
 * checks (`checkEngines`) read processes through `list_processes` and ask
 * the engine through `run_command`.
 *
 * With a `runs_dir`, every run is rebuilt from its journal there: on start
 * the runs this plugin started, and on each `board.read` the runs it didn't
 * start (shown read-only in the workspace whose folder is their repo). Without one, a restarted
 * plugin knows its runs only from the registry and the engine's next send.
 *
 * Each run's `engine.event` work goes through its own queue, so rows never
 * interleave. A failed row append is logged and never loses board state.
 *
 * @example
 * const board = createBoardServer({
 *     registry_path: defaultRegistryPath({ env: process.env, home_dir: homedir() }),
 *     runs_dir: defaultRunsDir({ env: process.env, home_dir: homedir() }),
 *     append_row: async ({ agent_id, row }) => { ... },
 *     spawn_engine: spawnDetached,
 *     list_processes: listProcesses,
 *     run_command: runCommand,
 *     read_settings: async () => EngineSettingsSchema.parse({}),
 *     file_exists: ({ path }) => existsSync(path),
 *     home_dir: homedir(),
 *     env: process.env,
 *     log_dir: '/tmp',
 *     now: () => new Date(),
 *     log: console.error,
 * })
 * server.handle(runStartRpc, (input) => board.startRun(input))
 */
export const createBoardServer = ({
    registry_path,
    runs_dir = null,
    append_row,
    spawn_engine,
    list_processes,
    run_command,
    read_settings,
    file_exists,
    home_dir,
    env,
    log_dir,
    now,
    log,
}: {
    registry_path: string
    /** The engine's runs folder (`<runs_dir>/<run_id>/journal.jsonl`). */
    runs_dir?: string | null
    append_row: AppendRow
    spawn_engine: SpawnEngine
    list_processes: ListProcesses
    run_command: RunCommand
    read_settings: () => Promise<EngineSettings>
    file_exists: ({ path }: { path: string }) => boolean
    home_dir: string
    env: Record<string, string | undefined>
    log_dir: string
    now: () => Date
    log: (message: string) => void
}) => {
    const registry = createRunRegistry({ path: registry_path, log })
    const runs = new Map<string, RunMemory>()
    const outside = new Map<string, OutsideRun>()
    const queues = new Map<string, Promise<unknown>>()

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
        const described = describeRecord({
            before,
            after,
            record: read.record,
        })
        memory.state = described ? { ...after, latest: described.text } : after
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
        entries.forEach((entry, index) =>
            remember({ entry, records: journals[index] ?? [] })
        )
    }

    /**
     * Reads the journals of runs this plugin didn't start, the latest
     * changed first: a new or changed journal is read again and its new
     * records applied.
     */
    const readOutside = async () => {
        if (runs_dir === null) return
        const journals = (await listJournals({ runs_dir }))
            .filter((journal) => !runs.has(journal.run_id))
            .slice(0, OUTSIDE_RUNS_SHOWN)
        const shown = new Set(journals.map((journal) => journal.run_id))
        for (const run_id of outside.keys()) {
            if (!shown.has(run_id)) outside.delete(run_id)
        }
        await Promise.all(
            journals.map(async ({ run_id, size, changed_ms }) => {
                const known = outside.get(run_id)
                if (known?.size === size && known.changed_ms === changed_ms) {
                    return
                }
                const records = await journalOf({ run_id })
                const first = records[0]
                if (!first) return
                const run: OutsideRun = known ?? {
                    state: createBoardState({
                        run_id,
                        spec_number: null,
                        demo: false,
                        started_at: first.time,
                        log_path: null,
                    }),
                    next_seq: 1,
                    size,
                    changed_ms,
                    repo: null,
                }
                applyInOrder({ memory: run, records })
                run.size = size
                run.changed_ms = changed_ms
                run.repo ??= repoOf({ records })
                outside.set(run_id, run)
            })
        )
    }

    /** Changes a run's registry entry, and its copy in memory. */
    const updateEntry = ({
        memory,
        change,
    }: {
        memory: RunMemory
        change: Partial<Pick<RunEntry, 'ended' | 'restarts'>>
    }) => {
        memory.entry = registry.update({
            run_id: memory.entry.run_id,
            change,
        }) ?? { ...memory.entry, ...change }
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

    /** The daemon's env for the engine, plus the run's token when given. */
    const childEnv = ({
        token,
    }: {
        token: string | null
    }): Record<string, string> => {
        const child_env: Record<string, string> = {}
        for (const [key, value] of Object.entries(env)) {
            if (value !== undefined) child_env[key] = value
        }
        if (token !== null) child_env.LUCA_BOARD_TOKEN = token
        return child_env
    }

    /** Finds the engine from the current settings, as `run.start` does. */
    const findEngine = async () => {
        let settings: EngineSettings = EngineSettingsSchema.parse({})
        try {
            settings = await read_settings()
        } catch (error) {
            log(`Couldn't read the engine settings: ${errorText({ error })}`)
        }
        return resolveEngine({ settings, env, home_dir, file_exists })
    }

    /**
     * `run.start`: parses the args, finds the engine, records the run, spawns
     * the engine detached, and adds the chat's header row. Returns at once.
     */
    const startRun = async (input: RunStartInput): Promise<RunStartOutput> => {
        await ready
        const parsed = parseRunArgs({ args: input.args })
        if (!parsed.ok)
            return { ok: false, message: parsed.message, run_id: null }

        const engine = await findEngine()
        if (!engine.ok)
            return { ok: false, message: engine.message, run_id: null }

        let run_id = mintRunId({ now: now(), suffix: randomSuffix() })
        while (runs.has(run_id)) {
            run_id = mintRunId({ now: now(), suffix: randomSuffix() })
        }
        const token = randomBytes(24).toString('hex')
        const log_path = join(log_dir, `${run_id}.log`)
        const { target } = parsed
        const entry: RunEntry = {
            run_id,
            token,
            agent_id: input.agent_id,
            workspace_id: input.workspace_id,
            repo: input.cwd,
            spec: target.kind === 'spec' ? target.spec : null,
            demo: target.kind === 'demo',
            started_at: now().toISOString(),
            log_path,
            ended: null,
            restarts: 0,
        }
        registry.add({ entry })
        const memory = remember({ entry, records: [] })

        const child_env = childEnv({ token })

        let pid: number | null = null
        try {
            pid = spawn_engine({
                command: engine.command,
                args: [
                    ...engine.lead_args,
                    ...engineArgs({ target, repo: input.cwd, run_id }),
                ],
                env: child_env,
                cwd: input.cwd,
                log_path,
                on_error: (error) => {
                    log(
                        `[${run_id}] the engine process failed: ${errorText({ error })}`
                    )
                    void enqueue({
                        run_id,
                        work: () =>
                            endRun({
                                memory,
                                ended: {
                                    ok: false,
                                    message: `The engine couldn't start: ${errorText({ error })}`,
                                },
                            }),
                    })
                },
            }).pid
        } catch (error) {
            registry.remove({ run_id })
            runs.delete(run_id)
            return {
                ok: false,
                message: `Couldn't start the engine: ${errorText({ error })}`,
                run_id: null,
            }
        }
        log(
            `[${run_id}] started ${engine.command} (pid ${pid ?? '?'}), log ${log_path}`
        )

        const headerAdded = enqueue({
            run_id,
            work: () => appendRows({ memory, rows: [header({ memory })] }),
        })
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
            headerAdded,
            new Promise((resolve) => {
                timer = setTimeout(resolve, HEADER_WAIT_MS)
            }),
        ])
        clearTimeout(timer)

        const what =
            target.kind === 'demo' ? 'a demo run' : `spec #${target.spec}`
        return {
            ok: true,
            run_id,
            message: `Started ${what} as ${run_id}. Its log is ${log_path}.`,
        }
    }

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

    /**
     * `board.read`: the runs started from the workspace's chats and the runs
     * this plugin didn't start whose repo is the workspace's folder, newest
     * first, and one of them in full.
     */
    const readBoard = async (
        input: BoardReadInput
    ): Promise<BoardReadOutput> => {
        await ready
        await readOutside()
        const directory = input.directory ? resolve(input.directory) : null
        const list = [
            ...[...runs.values()].filter(
                (memory) => memory.entry.workspace_id === input.workspace_id
            ),
            ...[...outside.values()].filter(
                (run) => directory !== null && run.repo === directory
            ),
        ]
            .map(({ state }) => state)
            .toSorted((left, right) =>
                right.run.started_at === left.run.started_at
                    ? right.run.run_id.localeCompare(left.run.run_id)
                    : right.run.started_at.localeCompare(left.run.started_at)
            )
        const selected =
            (input.run_id
                ? list.find((state) => state.run.run_id === input.run_id)
                : undefined) ?? list[0]
        return {
            runs: list.map((state) => ({
                run_id: state.run.run_id,
                spec_number: state.run.spec_number,
                spec_title: state.run.spec_title,
                demo: state.run.demo,
                status: state.run.status,
                started_at: state.run.started_at,
                needs_you: state.needs_you.length,
            })),
            selected: selected ?? null,
        }
    }

    /** Whether a run may still need an engine: not ended, not over. */
    const needsEngine = ({ memory }: { memory: RunMemory }) =>
        memory.state.run.engine_ended === null &&
        !OVER_PHASES.has(memory.state.run.phase)

    /**
     * Asks the engine which unfinished runs may be restarted
     * (`luca-run --unfinished`), with the engine to restart them with.
     */
    const listUnfinished = async (): Promise<
        | {
              ok: true
              runs: Map<string, UnfinishedRun>
              engine: { command: string; lead_args: string[] }
          }
        | { ok: false; error: string }
    > => {
        const engine = await findEngine()
        if (!engine.ok) return { ok: false, error: engine.message }
        const result = await run_command({
            command: engine.command,
            args: [...engine.lead_args, '--unfinished'],
            cwd: home_dir,
            env: childEnv({ token: null }),
            timeout_ms: UNFINISHED_TIMEOUT_MS,
        })
        if (result.exit_code === null) {
            return {
                ok: false,
                error: `luca-run --unfinished did not finish in ${UNFINISHED_TIMEOUT_MS / 1000} s (it timed out or was killed)`,
            }
        }
        if (result.exit_code !== 0) {
            return {
                ok: false,
                error: `luca-run --unfinished exited with ${result.exit_code}: ${result.stderr.trim().slice(0, 300)}`,
            }
        }
        const parsed = parseUnfinished({ stdout: result.stdout })
        if (!parsed.ok) {
            return {
                ok: false,
                error: `luca-run --unfinished ${parsed.error}`,
            }
        }
        return { ok: true, runs: parsed.runs, engine }
    }

    /**
     * Restarts a run from its journal (`--resume`) with its token, appending
     * to its log, and counts the restart. An error when the spawn threw.
     */
    const restartRun = async ({
        memory,
        engine,
    }: {
        memory: RunMemory
        engine: { command: string; lead_args: string[] }
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { run_id, repo, token, log_path } = memory.entry
        let pid: number | null = null
        try {
            pid = spawn_engine({
                command: engine.command,
                args: [...engine.lead_args, ...resumeArgs({ run_id, repo })],
                env: childEnv({ token }),
                cwd: repo,
                log_path,
                on_error: (error) => {
                    log(
                        `[${run_id}] the restarted engine failed: ${errorText({ error })}`
                    )
                    void enqueue({
                        run_id,
                        work: () =>
                            endRun({
                                memory,
                                ended: {
                                    ok: false,
                                    message: engineStoppedText({
                                        why: {
                                            kind: 'spawn_failed',
                                            error: errorText({ error }),
                                        },
                                        run_id,
                                        log_path,
                                    }),
                                },
                            }),
                    })
                },
            }).pid
        } catch (error) {
            return { ok: false, error: errorText({ error }) }
        }
        const restart = memory.entry.restarts + 1
        updateEntry({ memory, change: { restarts: restart } })
        const row = restartRow({ run_id, restart, time: now().toISOString() })
        memory.state = {
            ...memory.state,
            run: { ...memory.state.run, engine_ended: null },
            latest: restartText({ restart }),
        }
        log(
            `[${run_id}] restarted ${engine.command} with --resume (pid ${pid ?? '?'}, restart ${restart} of ${MAX_AUTO_RESTARTS}), log ${log_path}`
        )
        await appendRows({ memory, rows: [row, header({ memory })] })
        return { ok: true }
    }

    /** One check: see `checkEngines`. */
    const runCheck = async (): Promise<EngineCheck> => {
        await ready
        const summary: EngineCheck = { restarted: [], stopped: [] }
        const candidates = [...runs.values()].filter((memory) =>
            needsEngine({ memory })
        )
        if (candidates.length === 0) return summary
        let command_lines: string[]
        try {
            command_lines = await list_processes()
        } catch (error) {
            // Never restart when unsure: two engines on one run is far worse
            // than a late restart.
            log(
                `Couldn't list the processes, so no engine was checked: ${errorText({ error })}`
            )
            return summary
        }
        const live = liveRunIds({ command_lines })
        const dead = candidates.filter(
            (memory) => !live.has(memory.entry.run_id)
        )
        if (dead.length === 0) return summary
        const unfinished = dead.some((memory) => !memory.entry.demo)
            ? await listUnfinished()
            : null
        if (unfinished && !unfinished.ok) {
            log(`Couldn't check which runs can go on: ${unfinished.error}`)
        }

        const settle = async ({ memory }: { memory: RunMemory }) => {
            // The engine may have ended the run while this check ran.
            if (!needsEngine({ memory })) return
            const { run_id, log_path } = memory.entry
            const stop = async ({ why }: { why: StopWhy }) => {
                const message = engineStoppedText({ why, run_id, log_path })
                log(`[${run_id}] the engine is gone: ${message}`)
                await endRun({ memory, ended: { ok: false, message } })
                summary.stopped.push(run_id)
            }
            if (memory.entry.demo) return stop({ why: { kind: 'demo' } })
            if (!unfinished?.ok) {
                return stop({
                    why: {
                        kind: 'check_failed',
                        error: unfinished?.error ?? 'no answer',
                    },
                })
            }
            const listed = unfinished.runs.get(run_id)
            if (!listed) return stop({ why: { kind: 'not_listed' } })
            if (!listed.restart) {
                const reason = listed.message ?? 'no reason given'
                return stop({
                    why:
                        listed.reason === 'billing_stopped'
                            ? { kind: 'billing_stopped', reason }
                            : { kind: 'launcher_stopped', reason },
                })
            }
            if (memory.entry.restarts >= MAX_AUTO_RESTARTS) {
                return stop({ why: { kind: 'restarts_used_up' } })
            }
            const restarted = await restartRun({
                memory,
                engine: unfinished.engine,
            })
            if (!restarted.ok) {
                return stop({
                    why: { kind: 'spawn_failed', error: restarted.error },
                })
            }
            summary.restarted.push(run_id)
        }

        await Promise.all(
            dead.map((memory) =>
                enqueue({
                    run_id: memory.entry.run_id,
                    work: () => settle({ memory }),
                })
            )
        )
        return summary
    }

    let checking: Promise<EngineCheck> | null = null

    /**
     * Finds runs whose engine process is gone although the run hasn't ended,
     * and restarts the ones that can go on from their journal
     * (`--resume`, at most `MAX_AUTO_RESTARTS` times per run). The rest show
     * "engine stopped" with why. When the processes can't be listed, nothing
     * is done. Only one check runs at a time: a call while one runs gets the
     * same promise. Never rejects.
     *
     * @example
     * const { restarted, stopped } = await board.checkEngines()
     */
    const checkEngines = (): Promise<EngineCheck> => {
        checking ??= runCheck()
            .catch((error: unknown) => {
                log(`The engine check failed: ${errorText({ error })}`)
                return { restarted: [], stopped: [] }
            })
            .finally(() => {
                checking = null
            })
        return checking
    }

    /** Resolves when every queued piece of work (and any check) has finished. */
    const idle = async () => {
        await ready
        await checking
        await Promise.all([...queues.values()])
    }

    // Every method waits for the registry's runs to be rebuilt first.
    const ready = load().catch((error: unknown) => {
        log(
            `Couldn't rebuild the runs from their journals: ${errorText({ error })}`
        )
    })

    return { startRun, handleEngineEvent, readBoard, checkEngines, idle }
}

export type BoardServer = ReturnType<typeof createBoardServer>
