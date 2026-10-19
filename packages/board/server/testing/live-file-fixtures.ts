import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The live file (#628) as the engine writes it in a run folder,
 * `<runs_dir>/<run_id>/live.json`: replaced whole on each write, never
 * journaled. Per agent in a turn, its ticket, role, model, tokens so far,
 * latest action and open tool call; per run, the first plan-usage reading.
 */

/** The live file's name inside a run folder. */
export const LIVE_FILE = 'live.json'

/** The agent's latest action: a tool and a short target, with its time. */
export type LiveAction = { tool: string; target: string; at: string }

/** A tool call still running, since `started_at`. */
export type LiveOpenCall = { tool: string; target: string; started_at: string }

export type LiveAgent = {
    ticket: number | null
    role: string
    model: string
    tokens: number
    action: LiveAction | null
    open_call: LiveOpenCall | null
}

/** One agent in a turn, on Opus with nothing done yet unless told. */
export const liveAgent = (
    fields: Partial<LiveAgent> & { ticket: number | null; role: string }
): LiveAgent => ({
    model: 'opus',
    tokens: 0,
    action: null,
    open_call: null,
    ...fields,
})

/** Writes a run's live file, as the engine does. */
export const writeLiveFile = async ({
    runs_dir,
    run_id,
    written_at,
    agents = [],
    plan_usage = null,
}: {
    runs_dir: string
    run_id: string
    written_at: string
    agents?: LiveAgent[]
    /** The run's first plan-usage reading, as a `rate_limit_event` sent it. */
    plan_usage?: Record<string, unknown> | null
}) => {
    await mkdir(join(runs_dir, run_id), { recursive: true })
    await writeFile(
        join(runs_dir, run_id, LIVE_FILE),
        JSON.stringify({ written_at, plan_usage, agents })
    )
}

/** Takes a run's live file away, as for a run from before it. */
export const removeLiveFile = async ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}) => {
    await rm(join(runs_dir, run_id, LIVE_FILE), { force: true })
}
