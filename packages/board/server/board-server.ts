/**
 * The board plugin's server logic. `createBoardServer` wires the pieces,
 * which are in modules by responsibility:
 * - `board-server-types.ts`: the types, and what the server is given.
 * - `board-server-store.ts`: the runs in memory, their queues, and the rows.
 * - `board-server-engine.ts`: running the engine (find it, spawn it).
 * - `board-server-start.ts` and `board-server-resume.ts`: `run.start` and
 *   `/luca-run resume`.
 * - `board-server-events.ts`: `engine.event`.
 * - `board-server-read.ts`: `board.read` and `reply.post`, and the runs the
 *   plugin didn't start.
 * - `board-server-check.ts`: the engine check, which also labels the runs
 *   the plugin didn't start whose engine is gone.
 */
import { createEngineChecks } from './board-server-check'
import { createEngineProcess } from './board-server-engine'
import { createEngineEvents } from './board-server-events'
import { createBoardReads } from './board-server-read'
import { createResumer } from './board-server-resume'
import { createStarter } from './board-server-start'
import { createRunStore } from './board-server-store'
import type { BoardServerConfig } from './board-server-types'

export type {
    AppendRow,
    BoardServerConfig,
    CommandRequest,
    CommandResult,
    EngineCheck,
    ListProcesses,
    RunCommand,
    SpawnEngine,
    SpawnRequest,
} from './board-server-types'

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
 *     real_path: ({ path }) => realpathSync(path),
 *     home_dir: homedir(),
 *     env: process.env,
 *     log_dir: '/tmp',
 *     now: () => new Date(),
 *     log: console.error,
 * })
 * server.handle(runStartRpc, (input) => board.startRun(input))
 */
export const createBoardServer = (config: BoardServerConfig) => {
    const store = createRunStore({ config })
    const engine = createEngineProcess({ config, store })
    const resumer = createResumer({ config, store, engine })
    const starter = createStarter({ config, store, engine, resumer })
    const events = createEngineEvents({ store })
    const reads = createBoardReads({ config, store })
    const checks = createEngineChecks({ config, store, engine, reads })

    /** Resolves when every queued piece of work (and any check) has finished. */
    const idle = async () => {
        await store.ready
        await checks.checking()
        await engine.working()
        await Promise.all([...store.queues.values()])
    }

    return {
        startRun: starter.startRun,
        handleEngineEvent: events.handleEngineEvent,
        readBoard: reads.readBoard,
        postReply: reads.postReply,
        checkEngines: checks.checkEngines,
        idle,
    }
}

export type BoardServer = ReturnType<typeof createBoardServer>
