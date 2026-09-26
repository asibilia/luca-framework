import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { stamp, type Entry } from './journal-fixtures'

import type { BoardRow } from '../../shared/board-rows'
import type { BoardReadOutput, EngineRecord } from '../../shared/board-rpc'
import type { BoardState } from '../../shared/board-state'
import {
    EngineSettingsSchema,
    type EngineSettingsInput,
} from '../../shared/engine-settings'
import {
    createBoardServer,
    type BoardServer,
    type CommandRequest,
    type CommandResult,
    type SpawnRequest,
} from '../board-server'

/** The engine path the default fake settings point at. */
export const ENGINE_PATH = '/opt/luca/packages/engine/src/cli/luca-run.ts'

/** Bun where the fake file system has it. */
export const BUN_PATH = '/home/me/.bun/bin/bun'

/** One run as `luca-run --unfinished` lists it. */
export type UnfinishedRun = {
    run_id: string
    restart: boolean
    reason: 'resumable' | 'launcher_stopped' | 'billing_stopped'
    message: string | null
}

/** What `luca-run --unfinished` answers with these runs. */
export const unfinishedResult = ({
    runs,
}: {
    runs: UnfinishedRun[]
}): CommandResult => ({
    exit_code: 0,
    stdout: `${JSON.stringify({ runs })}\n`,
    stderr: '',
})

/** One appended row and the chat it went to. */
export type AppendedRow = { agent_id: string; row: BoardRow }

/**
 * A board server wired to fakes: rows go to a list, spawns are recorded, the
 * registry lives in a temp dir, runs are rebuilt from the journals in
 * `runs_dir` when one is given, and only the listed files "exist". The
 * process list is `processes` (or `ps` fails with `ps_error`), and every
 * command run is recorded in `commands` and answered with `setCommandResult`
 * (by default, `luca-run --unfinished` with no runs).
 */
export const createHarness = async ({
    settings = { engine_path: ENGINE_PATH, bun_path: '' },
    files = [ENGINE_PATH, BUN_PATH],
    registry_dir,
    runs_dir = null,
    fail_appends = false,
    spawn_throws = null,
    ps_error = null,
}: {
    /** Settings left out (such as the usage lines) take their defaults. */
    settings?: EngineSettingsInput
    files?: string[]
    registry_dir?: string
    /** The engine's runs folder; without one the board reads no journals. */
    runs_dir?: string | null
    fail_appends?: boolean
    /** When set, spawning throws this message. */
    spawn_throws?: string | null
    /** When set, listing the processes fails with this message. */
    ps_error?: string | null
} = {}) => {
    const dir = registry_dir ?? (await mkdtemp(join(tmpdir(), 'luca-board-')))
    const rows: AppendedRow[] = []
    const spawns: SpawnRequest[] = []
    const logs: string[] = []
    /** Every process's command line, as `ps` would list them. */
    const processes: string[] = []
    const commands: CommandRequest[] = []
    let command_result: CommandResult = unfinishedResult({ runs: [] })
    let clock = Date.parse('2026-09-23T12:30:42.000Z')
    const existing = new Set(files)

    const board: BoardServer = createBoardServer({
        registry_path: join(dir, 'runs.json'),
        runs_dir,
        append_row: async ({ agent_id, row }) => {
            if (fail_appends) throw new Error(`no agent ${agent_id}`)
            rows.push({ agent_id, row })
        },
        spawn_engine: (request) => {
            if (spawn_throws) throw new Error(spawn_throws)
            spawns.push(request)
            return { pid: 4242 }
        },
        list_processes: async () => {
            if (ps_error) throw new Error(ps_error)
            return [...processes]
        },
        run_command: async (request) => {
            commands.push(request)
            return command_result
        },
        read_settings: async () => EngineSettingsSchema.parse(settings),
        file_exists: ({ path }) => existing.has(path),
        home_dir: '/home/me',
        env: { PATH: '/usr/bin', LUCA_BUN: undefined },
        log_dir: '/tmp',
        now: () => {
            clock += 1000
            return new Date(clock)
        },
        log: (message) => logs.push(message),
    })

    /** Starts a run the way `/luca-run` does, and returns its id and token. */
    const start = async ({
        args = '10',
        agent_id = 'agent-1',
        workspace_id = 'ws-1',
        cwd = '/repo',
    }: {
        args?: string
        agent_id?: string
        workspace_id?: string
        cwd?: string
    } = {}) => {
        const output = await board.startRun({
            agent_id,
            workspace_id,
            cwd,
            args,
        })
        const token = spawns.at(-1)?.env.LUCA_BOARD_TOKEN ?? ''
        return { output, run_id: output.run_id ?? '', token }
    }

    /** Sends records (stamped from `first_seq` when given as entries). */
    const send = ({
        run_id,
        token,
        entries = [],
        records,
        first_seq = 1,
        ended = null,
    }: {
        run_id: string
        token: string
        entries?: Entry[]
        records?: EngineRecord[]
        first_seq?: number
        ended?: { ok: boolean; message: string } | null
    }) =>
        board.handleEngineEvent({
            run_id,
            token,
            records: records ?? stamp({ entries, first_seq }),
            ended,
        })

    const read = async ({
        workspace_id = 'ws-1',
        run_id = null,
    }: {
        workspace_id?: string
        run_id?: string | null
    } = {}): Promise<BoardReadOutput> =>
        board.readBoard({ workspace_id, run_id })

    /** The full state of the newest run in `ws-1`; throws when there is none. */
    const state = async (): Promise<BoardState> => {
        const { selected } = await read()
        if (!selected) throw new Error('no run selected')
        return selected
    }

    const ticket = async ({ number }: { number: number }) => {
        const found = (await state()).tickets.find(
            (card) => card.number === number
        )
        if (!found) throw new Error(`no ticket #${number}`)
        return found
    }

    /** The latest version of every row, by id, in first-appended order. */
    const latestRows = () => {
        const byId = new Map<string, AppendedRow>()
        for (const appended of rows) byId.set(appended.row.id, appended)
        return [...byId.values()]
    }

    /** What the next commands answer. */
    const setCommandResult = ({ result }: { result: CommandResult }) => {
        command_result = result
    }

    /** The command line of a live engine for `run_id`, as `ps` shows it. */
    const engineRunning = ({ run_id }: { run_id: string }) => {
        processes.push(
            `${BUN_PATH} ${ENGINE_PATH} --spec 10 --repo /repo --run-id ${run_id} --board-plugin luca-board`
        )
    }

    const cleanup = async () => {
        if (!registry_dir) await rm(dir, { recursive: true, force: true })
    }

    return {
        board,
        dir,
        rows,
        spawns,
        logs,
        processes,
        commands,
        setCommandResult,
        engineRunning,
        start,
        send,
        read,
        state,
        ticket,
        latestRows,
        cleanup,
    }
}

export type Harness = Awaited<ReturnType<typeof createHarness>>
