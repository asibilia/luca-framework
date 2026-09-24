import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'

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
import type { EngineSettings } from '../shared/engine-settings'

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

/** One run the plugin knows: its registry entry and its board in memory. */
type RunMemory = {
    entry: RunEntry
    state: BoardState
    /** The next journal seq the board wants (starts at 1). */
    next_seq: number
    append_failures: number
    rows_stopped: boolean
}

/**
 * The board plugin's server logic, with every side effect injected so tests
 * drive it without Paseo: rows go through `append_row`, the engine starts
 * through `spawn_engine`, and runs persist to `registry_path`. Engine
 * checks (`checkEngines`) read processes through `list_processes` and ask
 * the engine through `run_command`.
 *
 * Each run's `engine.event` work goes through its own queue, so rows never
 * interleave. A failed row append is logged and never loses board state.
 *
 * @example
 * const board = createBoardServer({
 *     registry_path: defaultRegistryPath({ env: process.env, home_dir: homedir() }),
 *     append_row: async ({ agent_id, row }) => { ... },
 *     spawn_engine: spawnDetached,
 *     list_processes: listProcesses,
 *     run_command: runCommand,
 *     read_settings: async () => ({ engine_path: '', bun_path: '' }),
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
    const queues = new Map<string, Promise<unknown>>()

    const remember = ({ entry }: { entry: RunEntry }): RunMemory => {
        const state = createBoardState({
            run_id: entry.run_id,
            spec_number: entry.spec,
            demo: entry.demo,
            started_at: entry.started_at,
            log_path: entry.log_path,
        })
        const memory: RunMemory = {
            entry,
            // A run whose engine ended stays ended after a plugin restart.
            state: entry.ended
                ? applyEnded({ state, ended: entry.ended })
                : state,
            next_seq: 1,
            append_failures: 0,
            rows_stopped: false,
        }
        runs.set(entry.run_id, memory)
        return memory
    }

    for (const entry of registry.list()) remember({ entry })

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
        memory: RunMemory
        record: EngineRecord
    }): BoardRow[] => {
        const read = readRecord({ record })
        if (read.status !== 'known') {
            if (read.status === 'bad_content') {
                log(
                    `[${memory.entry.run_id}] skipped record ${record.seq} (${record.kind}): its content doesn't fit.\n${read.error}`
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
        return rowsForRecord({
            run_id: memory.entry.run_id,
            before,
            after,
            record: read.record,
        })
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
        let settings: EngineSettings = { engine_path: '', bun_path: '' }
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
        const memory = remember({ entry })

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
     * `engine.event`: applies a run's journal records in seq order from its
     * `next_seq`. Lower seqs are duplicates and skipped; a gap stops there and
     * the reply's `next_seq` asks the engine to resend from it.
     */
    const handleEngineEvent = async (
        input: EngineEventInput
    ): Promise<EngineEventOutput> => {
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
                const records = input.records.toSorted(
                    (left, right) => left.seq - right.seq
                )
                const rows: BoardRow[] = []
                let applied = 0
                let gap: number | null = null
                for (const record of records) {
                    if (record.seq < memory.next_seq) continue
                    if (record.seq > memory.next_seq) {
                        gap = record.seq
                        break
                    }
                    rows.push(...applyOne({ memory, record }))
                    memory.next_seq += 1
                    applied += 1
                }
                if (gap === null && input.ended) {
                    memory.state = applyEnded({
                        state: memory.state,
                        ended: input.ended,
                    })
                    updateEntry({ memory, change: { ended: input.ended } })
                }
                if (applied > 0 || (gap === null && input.ended)) {
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

    /** `board.read`: the workspace's runs, newest first, and one in full. */
    const readBoard = async (
        input: BoardReadInput
    ): Promise<BoardReadOutput> => {
        const list = [...runs.values()]
            .filter(
                (memory) => memory.entry.workspace_id === input.workspace_id
            )
            .toSorted((left, right) =>
                right.entry.started_at === left.entry.started_at
                    ? right.entry.run_id.localeCompare(left.entry.run_id)
                    : right.entry.started_at.localeCompare(
                          left.entry.started_at
                      )
            )
        const selected =
            (input.run_id
                ? list.find((memory) => memory.entry.run_id === input.run_id)
                : undefined) ?? list[0]
        return {
            runs: list.map(({ state }) => ({
                run_id: state.run.run_id,
                spec_number: state.run.spec_number,
                spec_title: state.run.spec_title,
                demo: state.run.demo,
                status: state.run.status,
                started_at: state.run.started_at,
                needs_you: state.needs_you.length,
            })),
            selected: selected?.state ?? null,
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
        await checking
        await Promise.all([...queues.values()])
    }

    return { startRun, handleEngineEvent, readBoard, checkEngines, idle }
}

export type BoardServer = ReturnType<typeof createBoardServer>
