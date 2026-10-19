/**
 * The engine check: finds runs whose engine process is gone although the run
 * hasn't ended, restarts the ones that can go on from their journal, and
 * marks the rest as stopped, with why.
 */

import type { EngineProcess } from './board-server-engine'
import type { RunStore } from './board-server-store'
import type {
    BoardServerConfig,
    EngineCheck,
    RunMemory,
} from './board-server-types'
import { errorText, OVER_PHASES } from './board-server-util'
import {
    engineStoppedText,
    liveRunIds,
    MAX_AUTO_RESTARTS,
    parseUnfinished,
    restartRow,
    restartText,
    UNFINISHED_TIMEOUT_MS,
    type StopWhy,
    type UnfinishedRun,
} from './engine-watch'

export const createEngineChecks = ({
    config,
    store,
    engine,
}: {
    config: BoardServerConfig
    store: RunStore
    engine: EngineProcess
}) => {
    const { list_processes, run_command, home_dir, log, now } = config
    const { runs, enqueue, appendRows, header, updateEntry, endRun, ready } =
        store
    const { childEnv, findEngine, exclusive, spawnResume } = engine

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
        const { run_id, log_path } = memory.entry
        let pid: number | null = null
        try {
            pid = spawnResume({
                memory,
                engine,
                on_failed: 'the restarted engine failed',
            })
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
        checking ??= exclusive(runCheck)
            .catch((error: unknown) => {
                log(`The engine check failed: ${errorText({ error })}`)
                return { restarted: [], stopped: [] }
            })
            .finally(() => {
                checking = null
            })
        return checking
    }

    return {
        checkEngines,
        /** The check in flight, `null` when none runs. */
        checking: () => checking,
    }
}
