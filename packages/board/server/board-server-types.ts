/**
 * The board server's types: what it spawns and runs, what it is given, and
 * what it keeps in memory for each run.
 */
import type { RunEntry } from './run-registry'

import type { BoardRow } from '../shared/board-rows'
import type { BoardState } from '../shared/board-state'
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

/** Appends (or replaces, by id) one row in a chat's timeline. */
export type AppendRow = ({
    agent_id,
    row,
}: {
    agent_id: string
    row: BoardRow
}) => Promise<void>

/** A run's board, built from its journal records so far. */
export type Replay = {
    state: BoardState
    /** The next journal seq the board wants (starts at 1). */
    next_seq: number
}

/** One run the plugin started: its registry entry and its board in memory. */
export type RunMemory = Replay & {
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
 * `engine_gone` is set by the engine check (#635): no process names the
 * run and its live file isn't fresh. It only labels the run.
 */
export type OutsideRun = Replay & {
    size: number
    changed_ms: number
    repo: string | null
    engine_gone: boolean
}

/**
 * What `createBoardServer` is given. Every side effect is injected, so tests
 * drive the server without Paseo.
 */
export type BoardServerConfig = {
    registry_path: string
    /** The engine's runs folder (`<runs_dir>/<run_id>/journal.jsonl`). */
    runs_dir?: string | null
    append_row: AppendRow
    spawn_engine: SpawnEngine
    list_processes: ListProcesses
    run_command: RunCommand
    read_settings: () => Promise<EngineSettings>
    file_exists: ({ path }: { path: string }) => boolean
    /** Follows an installed `luca-run`'s symlink; the path as is without it. */
    real_path?: ({ path }: { path: string }) => string
    home_dir: string
    env: Record<string, string | undefined>
    log_dir: string
    now: () => Date
    log: (message: string) => void
}
