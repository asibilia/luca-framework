import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The live file (#628) as the engine writes it in a run folder,
 * `<runs_dir>/<run_id>/live.json`: replaced whole on each write, never
 * journaled. Per agent in a turn, its ticket, role, model, tokens so far,
 * latest action, open tool call and helpers; per run, the first plan-usage
 * reading, the waits inside a step (#632) and the live feed, its last
 * actions across tickets.
 */

/** The live file's name inside a run folder. */
export const LIVE_FILE = 'live.json'

/** The agent's latest action: a tool and a short target, with its time. */
export type LiveAction = { tool: string; target: string; at: string }

/** A tool call still running, since `started_at`. */
export type LiveOpenCall = { tool: string; target: string; started_at: string }

/** How many seconds of activity the live file keeps for each agent (#631). */
export const ACTIVITY_SECONDS = 30

/**
 * One of an agent's helpers (#636): a read-only Haiku session it started,
 * with its model, its latest action (and that action's time), and whether
 * it's done.
 */
export type LiveHelper = {
    model: string
    action: LiveAction | null
    done: boolean
}

export type LiveAgent = {
    ticket: number | null
    role: string
    model: string
    tokens: number
    action: LiveAction | null
    open_call: LiveOpenCall | null
    /**
     * The agent's activity count for each of the last 30 seconds (#631),
     * oldest first, so the newest second is last.
     */
    activity: number[]
    /** The agent's helpers (#636); left out, as before them. */
    helpers?: LiveHelper[]
}

/**
 * One action of the run's live feed (#634): when, on which ticket, by which
 * role on which model, and the action, a tool and a short target.
 */
export type LiveFeedEntry = {
    at: string
    ticket: number | null
    role: string
    model: string | null
    tool: string
    target: string
}

/** A quiet agent's activity: 30 seconds of nothing. */
export const quietActivity = (): number[] =>
    Array.from({ length: ACTIVITY_SECONDS }, () => 0)

/**
 * A wait inside a step (#632): a ticket's check waits for a prepare slot
 * or a test slot, while `in_use` of the engine's `slots` are taken, since
 * `since`. The engine puts it in when the wait starts and takes it out
 * once the slot is taken.
 */
export type LiveWait = {
    ticket: number
    for: 'prepare_slot' | 'test_slot'
    in_use: number
    slots: number
    since: string
}

/** One agent in a turn, on Opus with nothing done yet unless told. */
export const liveAgent = (
    fields: Partial<LiveAgent> & { ticket: number | null; role: string }
): LiveAgent => ({
    model: 'opus',
    tokens: 0,
    action: null,
    open_call: null,
    activity: quietActivity(),
    ...fields,
})

/** A helper on Haiku, still running with nothing done yet unless told. */
export const liveHelper = (fields: Partial<LiveHelper> = {}): LiveHelper => ({
    model: 'haiku',
    action: null,
    done: false,
    ...fields,
})

/** Writes a run's live file, as the engine does. */
export const writeLiveFile = async ({
    runs_dir,
    run_id,
    written_at,
    agents = [],
    plan_usage = null,
    waits,
    feed,
}: {
    runs_dir: string
    run_id: string
    written_at: string
    agents?: LiveAgent[]
    /** The run's first plan-usage reading, as a `rate_limit_event` sent it. */
    plan_usage?: Record<string, unknown> | null
    /** The waits inside a step going now; left out, the file has none. */
    waits?: LiveWait[]
    /** The run's last actions, oldest first; left out, as before #634. */
    feed?: LiveFeedEntry[]
}) => {
    await mkdir(join(runs_dir, run_id), { recursive: true })
    await writeFile(
        join(runs_dir, run_id, LIVE_FILE),
        JSON.stringify({
            written_at,
            plan_usage,
            agents,
            ...(waits === undefined ? {} : { waits }),
            ...(feed === undefined ? {} : { feed }),
        })
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
