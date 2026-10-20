/**
 * `/luca-run resume <run id>` (#493): going on with a run this plugin
 * started, from its journal.
 */
import { randomBytes } from 'node:crypto'

import type { EngineProcess } from './board-server-engine'
import type { RunStore } from './board-server-store'
import type { BoardServerConfig } from './board-server-types'
import { errorText } from './board-server-util'
import { liveRunIds, RESUMED_TEXT, resumeRow } from './engine-watch'

import type { RunStartInput, RunStartOutput } from '../shared/board-rpc'
import { OVER_PHASES } from '../shared/board-state'

export const createResumer = ({
    config,
    store,
    engine,
}: {
    config: BoardServerConfig
    store: RunStore
    engine: EngineProcess
}) => {
    const { list_processes, log, now } = config
    const { runs, enqueue, appendRows, header, updateEntry } = store
    const { findEngine, exclusive, spawnResume } = engine

    /**
     * `/luca-run resume <run id>` (#493): goes on with a run this plugin
     * started, from its journal, with the board attached again. Refused for
     * an unknown run, a demo, a run that is over, a run whose engine is
     * still running, or when `ps` fails. Otherwise the run gets a new token,
     * loses its `ended`, and starts its restart count again at 0; it keeps
     * its chat, workspace, repo, and log. The engine is spawned with
     * `--resume`, and the run's chat gets a row saying so.
     */
    const resumeRun = async ({
        run_id,
        input,
    }: {
        run_id: string
        input: RunStartInput
    }): Promise<RunStartOutput> => {
        const refuse = (message: string): RunStartOutput => ({
            ok: false,
            message,
            run_id: null,
        })
        const memory = runs.get(run_id)
        if (!memory) {
            return refuse(
                `The board doesn't know run ${run_id}, so it can't resume it. Check the id: the run's header row and the board panel show it. A run the board didn't start goes on from a terminal with luca-run --resume ${run_id}, without the board.`
            )
        }
        if (memory.entry.demo) {
            return refuse(
                `Run ${run_id} is a demo, and a demo can't be picked up again. Start a new one with /luca-run demo.`
            )
        }
        if (OVER_PHASES.has(memory.state.run.phase)) {
            return refuse(
                `Run ${run_id} is over, so there is nothing to resume.`
            )
        }
        const engine = await findEngine()
        if (!engine.ok) return refuse(engine.message)

        return exclusive(async () => {
            let command_lines: string[]
            try {
                command_lines = await list_processes()
            } catch (error) {
                return refuse(
                    `Couldn't check whether run ${run_id}'s engine is still running (${errorText({ error })}), so it wasn't resumed: two engines on one run would be far worse. Try again.`
                )
            }
            if (liveRunIds({ command_lines }).has(run_id)) {
                return refuse(
                    `Run ${run_id} is still running (its engine is live), so there is nothing to resume.`
                )
            }
            return enqueue({
                run_id,
                work: async (): Promise<RunStartOutput> => {
                    const before = memory.entry
                    // The new token is kept first: the engine may send
                    // before the spawn returns.
                    updateEntry({
                        memory,
                        change: {
                            token: randomBytes(24).toString('hex'),
                            ended: null,
                            restarts: 0,
                        },
                    })
                    let pid: number | null = null
                    try {
                        pid = spawnResume({
                            memory,
                            engine,
                            on_failed: 'the resumed engine failed',
                        })
                    } catch (error) {
                        updateEntry({
                            memory,
                            change: {
                                token: before.token,
                                ended: before.ended,
                                restarts: before.restarts,
                            },
                        })
                        return refuse(
                            `Couldn't start the engine: ${errorText({ error })}`
                        )
                    }
                    const { log_path, spec, agent_id } = memory.entry
                    log(
                        `[${run_id}] resumed with /luca-run resume: ${engine.command} with --resume (pid ${pid ?? '?'}), log ${log_path}`
                    )
                    memory.rows_stopped = false
                    memory.append_failures = 0
                    memory.state = {
                        ...memory.state,
                        run: { ...memory.state.run, engine_ended: null },
                        latest: RESUMED_TEXT,
                        latest_at: now().toISOString(),
                    }
                    void enqueue({
                        run_id,
                        work: () =>
                            appendRows({
                                memory,
                                rows: [
                                    resumeRow({
                                        run_id,
                                        time: now().toISOString(),
                                    }),
                                    header({ memory }),
                                ],
                            }),
                    })
                    const what =
                        spec === null
                            ? `run ${run_id}`
                            : `spec #${spec} (run ${run_id})`
                    const where =
                        agent_id === input.agent_id
                            ? ''
                            : ' Its rows go on in the chat it started in.'
                    return {
                        ok: true,
                        run_id,
                        message: `Resumed ${what} from its journal.${where} Its log is ${log_path}.`,
                    }
                },
            })
        })
    }

    return { resumeRun }
}

export type Resumer = ReturnType<typeof createResumer>
