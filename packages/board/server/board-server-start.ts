/**
 * `run.start`: parses the args, finds the engine, records the run, spawns
 * the engine detached, and adds the chat's header row.
 */
import { randomBytes, randomInt } from 'node:crypto'
import { join } from 'node:path'

import type { EngineProcess } from './board-server-engine'
import type { Resumer } from './board-server-resume'
import type { RunStore } from './board-server-store'
import type { BoardServerConfig } from './board-server-types'
import { errorText } from './board-server-util'
import { engineArgs, mintRunId, parseRunArgs } from './engine-launch'
import type { RunEntry } from './run-registry'

import type { RunStartInput, RunStartOutput } from '../shared/board-rpc'

/** The longest `run.start` waits for the header row before it returns. */
const HEADER_WAIT_MS = 3000

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const randomSuffix = (): string =>
    Array.from(
        { length: 4 },
        () => SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)] ?? 'x'
    ).join('')

export const createStarter = ({
    config,
    store,
    engine,
    resumer,
}: {
    config: BoardServerConfig
    store: RunStore
    engine: EngineProcess
    resumer: Resumer
}) => {
    const { spawn_engine, log, now, log_dir } = config
    const {
        runs,
        registry,
        queues,
        remember,
        enqueue,
        endRun,
        appendRows,
        header,
        ready,
    } = store
    const { childEnv, findEngine } = engine
    const { resumeRun } = resumer

    /** Waits for rows being added, but at most `HEADER_WAIT_MS`. */
    const waitForRows = async (adding: Promise<unknown>) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
            adding,
            new Promise((resolve) => {
                timer = setTimeout(resolve, HEADER_WAIT_MS)
            }),
        ])
        clearTimeout(timer)
    }

    /**
     * `run.start`: parses the args, finds the engine, records the run, spawns
     * the engine detached, and adds the chat's header row. Returns at once.
     * `resume <run id>` goes on with a run instead (see `resumeRun`).
     */
    const startRun = async (input: RunStartInput): Promise<RunStartOutput> => {
        await ready
        const parsed = parseRunArgs({ args: input.args })
        if (!parsed.ok)
            return { ok: false, message: parsed.message, run_id: null }
        if (parsed.target.kind === 'resume') {
            const output = await resumeRun({
                run_id: parsed.target.run_id,
                input,
            })
            const rows = queues.get(parsed.target.run_id)
            if (output.ok && rows) await waitForRows(rows)
            return output
        }

        const engine = await findEngine()
        if (!engine.ok)
            return { ok: false, message: engine.message, run_id: null }

        let run_id = mintRunId({ now: now(), suffix: randomSuffix() })
        while (runs.has(run_id)) {
            run_id = mintRunId({ now: now(), suffix: randomSuffix() })
        }
        const token = randomBytes(24).toString('hex')
        const log_path = join(log_dir, `${run_id}.log`)
        const target = parsed.target
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

        await waitForRows(
            enqueue({
                run_id,
                work: () => appendRows({ memory, rows: [header({ memory })] }),
            })
        )

        const what =
            target.kind === 'demo' ? 'a demo run' : `spec #${target.spec}`
        return {
            ok: true,
            run_id,
            message: `Started ${what} as ${run_id}. Its log is ${log_path}.`,
        }
    }

    return { startRun }
}
