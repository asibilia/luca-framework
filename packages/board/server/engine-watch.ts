import { z } from 'zod'

import { ROW_KIND, type BoardRow } from '../shared/board-rows'
import { PLUGIN_ID } from '../shared/board-state'

/**
 * Restarts (#375): pure helpers for finding runs whose engine process is
 * gone, reading `luca-run --unfinished`, and the words the board shows. The
 * plugin never imports the engine, so the list's schema is its own loose copy.
 */

/** How many times the plugin restarts one run by itself before it gives up. */
export const MAX_AUTO_RESTARTS = 3

/** How often the plugin checks for runs whose engine is gone. */
export const ENGINE_CHECK_MS = 15_000

/** The longest `luca-run --unfinished` may take. */
export const UNFINISHED_TIMEOUT_MS = 20_000

/** One run as `luca-run --unfinished` lists it; extra fields are fine. */
const UnfinishedRunSchema = z.object({
    run_id: z.string().min(1),
    restart: z.boolean(),
    /** `resumable`, `launcher_stopped`, or `billing_stopped`. */
    reason: z.string(),
    message: z.string().nullable().default(null),
})

export type UnfinishedRun = z.infer<typeof UnfinishedRunSchema>

const UnfinishedOutputSchema = z.object({
    runs: z.array(UnfinishedRunSchema),
})

/**
 * Reads what `luca-run --unfinished` printed: the unfinished runs by id, or
 * why the output isn't the list.
 *
 * @example
 * parseUnfinished({ stdout: '{"runs":[]}' }) // { ok: true, runs: Map {} }
 * parseUnfinished({ stdout: 'hello' }).ok // false
 */
export const parseUnfinished = ({
    stdout,
}: {
    stdout: string
}):
    | { ok: true; runs: Map<string, UnfinishedRun> }
    | { ok: false; error: string } => {
    let json: unknown
    try {
        json = JSON.parse(stdout.trim())
    } catch {
        return {
            ok: false,
            error: `it printed something that is not the list: "${stdout.trim().slice(0, 200)}"`,
        }
    }
    const parsed = UnfinishedOutputSchema.safeParse(json)
    if (!parsed.success) {
        return {
            ok: false,
            error: `it printed something that is not the list: ${z.prettifyError(parsed.error)}`,
        }
    }
    return {
        ok: true,
        runs: new Map(parsed.data.runs.map((run) => [run.run_id, run])),
    }
}

/**
 * The run ids that have a live engine, from every process's command line: a
 * run is live when a command line has `--run-id <id>` or `--resume <id>` (or
 * `--run-id=<id>`), as whole tokens, so one id never matches inside another.
 *
 * @example
 * liveRunIds({ command_lines: ['bun luca-run.ts --resume r1 --repo /x'] }) // Set { 'r1' }
 */
export const liveRunIds = ({
    command_lines,
}: {
    command_lines: string[]
}): Set<string> => {
    const live = new Set<string>()
    for (const line of command_lines) {
        const tokens = line.split(/\s+/)
        tokens.forEach((token, index) => {
            const next = tokens[index + 1]
            if ((token === '--run-id' || token === '--resume') && next) {
                live.add(next)
            }
            const joined = /^--(?:run-id|resume)=(.+)$/.exec(token)
            if (joined?.[1]) live.add(joined[1])
        })
    }
    return live
}

/**
 * The engine args that go on with a run from its journal, after the command
 * and `lead_args`.
 *
 * @example
 * resumeArgs({ run_id: 'luca-20260923-123042-ab12', repo: '/Users/me/repo' })
 * // ['--resume', 'luca-20260923-123042-ab12', '--repo', '/Users/me/repo', '--board-plugin', 'luca-board']
 */
export const resumeArgs = ({
    run_id,
    repo,
}: {
    run_id: string
    repo: string
}): string[] => [
    '--resume',
    run_id,
    '--repo',
    repo,
    '--board-plugin',
    PLUGIN_ID,
]

/** Why a run whose engine is gone is not restarted, for `engineStoppedText`. */
export type StopWhy =
    | { kind: 'demo' }
    | { kind: 'not_listed' }
    | { kind: 'launcher_stopped'; reason: string }
    | { kind: 'billing_stopped'; reason: string }
    | { kind: 'restarts_used_up' }
    | { kind: 'check_failed'; error: string }
    | { kind: 'spawn_failed'; error: string }

/**
 * What the board says when a run's engine is gone and the plugin won't
 * restart it. The panel and header show it as "The engine stopped: <text>".
 *
 * @example
 * engineStoppedText({ why: { kind: 'demo' }, run_id, log_path: '/tmp/x.log' })
 */
export const engineStoppedText = ({
    why,
    run_id,
    log_path,
}: {
    why: StopWhy
    run_id: string
    log_path: string
}): string => {
    const resume = `luca-run --resume ${run_id}`
    switch (why.kind) {
        case 'demo':
            return `its process is gone, and a demo can't be picked up again. Start a new one with /luca-run demo. Its log is ${log_path}.`
        case 'not_listed':
            return `its process is gone, and its journal has nothing to pick up again (it never wrote one, or the run already ended). Read its log: ${log_path}.`
        case 'launcher_stopped':
            return `The run stopped: ${why.reason}. It isn't restarted automatically, because it would stop the same way. Fix that, then run ${resume}. Its log is ${log_path}.`
        case 'billing_stopped':
            return `The run stopped for billing: ${why.reason}. It will not go on; start a new run once per-token billing is off.`
        case 'restarts_used_up':
            return `it stopped again after ${MAX_AUTO_RESTARTS} automatic restarts, so Paseo stopped restarting it. Read its log: ${log_path}. To try once more, run ${resume}.`
        case 'check_failed':
            return `its process is gone, and Paseo couldn't check whether the run can go on (${why.error}). To go on from its journal, run ${resume}. Its log is ${log_path}.`
        case 'spawn_failed':
            return `its process is gone, and Paseo couldn't restart the engine: ${why.error}. To go on from its journal, run ${resume}. Its log is ${log_path}.`
    }
}

/** The words of the chat row for the `restart`-th automatic restart. */
export const restartText = ({ restart }: { restart: number }): string =>
    `The engine was gone, so Paseo restarted the run from its journal (restart ${restart} of ${MAX_AUTO_RESTARTS}).`

/**
 * The chat row for a run's `restart`-th automatic restart; its id is unique
 * per run and restart.
 *
 * @example
 * restartRow({ run_id, restart: 1, time: new Date().toISOString() })
 */
export const restartRow = ({
    run_id,
    restart,
    time,
}: {
    run_id: string
    restart: number
    time: string
}): BoardRow => ({
    id: `${run_id}-restart${restart}`,
    kind: ROW_KIND.event,
    data: {
        time,
        ticket: null,
        text: restartText({ restart }),
        tone: 'warning',
    },
})
