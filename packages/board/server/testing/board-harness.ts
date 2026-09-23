import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BoardReadOutput, EngineRecord } from '../../shared/board-rpc'
import type { BoardRow } from '../../shared/board-rows'
import type { BoardState } from '../../shared/board-state'
import type { EngineSettings } from '../../shared/engine-settings'
import {
    createBoardServer,
    type BoardServer,
    type SpawnRequest,
} from '../board-server'

import { stamp, type Entry } from './journal-fixtures'

/** The engine path the default fake settings point at. */
export const ENGINE_PATH = '/opt/luca/packages/engine/src/luca-run.ts'

/** Bun where the fake file system has it. */
export const BUN_PATH = '/home/me/.bun/bin/bun'

/** One appended row and the chat it went to. */
export type AppendedRow = { agent_id: string; row: BoardRow }

/**
 * A board server wired to fakes: rows go to a list, spawns are recorded, the
 * registry lives in a temp dir, and only the listed files "exist".
 */
export const createHarness = async ({
    settings = { engine_path: ENGINE_PATH, bun_path: '' },
    files = [ENGINE_PATH, BUN_PATH],
    registry_dir,
    fail_appends = false,
    spawn_throws = null,
}: {
    settings?: EngineSettings
    files?: string[]
    registry_dir?: string
    fail_appends?: boolean
    /** When set, spawning throws this message. */
    spawn_throws?: string | null
} = {}) => {
    const dir = registry_dir ?? (await mkdtemp(join(tmpdir(), 'luca-board-')))
    const rows: AppendedRow[] = []
    const spawns: SpawnRequest[] = []
    const logs: string[] = []
    let clock = Date.parse('2026-09-23T12:30:42.000Z')
    const existing = new Set(files)

    const board: BoardServer = createBoardServer({
        registry_path: join(dir, 'runs.json'),
        append_row: async ({ agent_id, row }) => {
            if (fail_appends) throw new Error(`no agent ${agent_id}`)
            rows.push({ agent_id, row })
        },
        spawn_engine: (request) => {
            if (spawn_throws) throw new Error(spawn_throws)
            spawns.push(request)
            return { pid: 4242 }
        },
        read_settings: async () => settings,
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
        const output = await board.startRun({ agent_id, workspace_id, cwd, args })
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
    }: { workspace_id?: string; run_id?: string | null } = {}): Promise<
        BoardReadOutput
    > => board.readBoard({ workspace_id, run_id })

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

    const cleanup = async () => {
        if (!registry_dir) await rm(dir, { recursive: true, force: true })
    }

    return {
        board,
        dir,
        rows,
        spawns,
        logs,
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
