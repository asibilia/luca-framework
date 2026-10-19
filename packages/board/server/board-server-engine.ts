/**
 * Running the engine for a run: the environment it gets, finding it from
 * the settings, the one-at-a-time lock on engine work, and spawning it with
 * `--resume`.
 */
import type { RunStore } from './board-server-store'
import type { BoardServerConfig, RunMemory } from './board-server-types'
import { errorText } from './board-server-util'
import { resolveEngine } from './engine-launch'
import { engineStoppedText, resumeArgs } from './engine-watch'

import {
    EngineSettingsSchema,
    type EngineSettings,
} from '../shared/engine-settings'

export const createEngineProcess = ({
    config,
    store,
}: {
    config: BoardServerConfig
    store: RunStore
}) => {
    const {
        env,
        read_settings,
        log,
        home_dir,
        file_exists,
        real_path,
        spawn_engine,
    } = config
    const { enqueue, endRun } = store

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
        return resolveEngine({
            settings,
            env,
            home_dir,
            file_exists,
            real_path,
        })
    }

    /**
     * Engine checks and resumes run one at a time, so a resume and a check
     * never both start an engine for the same run.
     */
    let engine_work: Promise<unknown> = Promise.resolve()
    const exclusive = <Result>(work: () => Promise<Result>) => {
        const result = engine_work.then(work)
        engine_work = result.catch(() => undefined)
        return result
    }

    /** Spawns a run's engine with `--resume` and its token; returns its pid. */
    const spawnResume = ({
        memory,
        engine,
        on_failed,
    }: {
        memory: RunMemory
        engine: { command: string; lead_args: string[] }
        /** What the log says when the process fails after the spawn. */
        on_failed: string
    }): number | null => {
        const { run_id, repo, token, log_path } = memory.entry
        return spawn_engine({
            command: engine.command,
            args: [...engine.lead_args, ...resumeArgs({ run_id, repo })],
            env: childEnv({ token }),
            cwd: repo,
            log_path,
            on_error: (error) => {
                log(`[${run_id}] ${on_failed}: ${errorText({ error })}`)
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
    }

    return {
        childEnv,
        findEngine,
        exclusive,
        spawnResume,
        /** The engine work in flight (or done), to wait for. */
        working: () => engine_work,
    }
}

export type EngineProcess = ReturnType<typeof createEngineProcess>
