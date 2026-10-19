/**
 * The run's **live file** (#628): `live.json` in the run folder, what each
 * agent in a turn is doing now, for the board to show between journal
 * records, and the run's last 50 actions across tickets, its live feed
 * (#634). It is never journaled and never replayed: each write replaces
 * the whole file (written aside, then renamed), at most once a second
 * while something changed, and at least every 5 seconds while the engine
 * runs, each with its `written_at` time.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { AgentLauncher } from '../agents/agent-launcher'
import type {
    ProgressAction,
    ProgressListener,
    ProgressOpenCall,
    TurnProgress,
} from '../agents/turn-progress'

/** The live file's name inside a run folder. */
export const LIVE_FILE = 'live.json'

/** The live file is written at most this often while something changes. */
export const LIVE_MIN_GAP_MS = 1000

/** The live file is written at least this often, changed or not. */
export const LIVE_MAX_GAP_MS = 5000

/** How often the writer looks for something to write. */
const LIVE_CHECK_MS = 200

/** The live file of one run: `<runs_dir>/<run_id>/live.json`. */
export const runLiveFilePath = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): string => join(runs_dir, run_id, LIVE_FILE)

/** The live feed keeps this many of the run's latest actions (#634). */
export const LIVE_FEED_SIZE = 50

/** One agent in a turn, as the live file has it. */
type LiveAgent = {
    ticket: number
    role: string
    model: string | null
    tokens: number
    action: ProgressAction | null
    open_call: ProgressOpenCall | null
}

/** One action of the live feed: who did it, on which model, and what. */
type LiveFeedEntry = {
    at: string
    ticket: number
    role: string
    model: string | null
    tool: string
    target: string
}

const sameAction = (
    left: ProgressAction | null,
    right: ProgressAction
): boolean =>
    left !== null &&
    left.tool === right.tool &&
    left.target === right.target &&
    left.at === right.at

/**
 * Keeps the live file at `file` from the moment it is made until `close`,
 * which writes it one last time with no agents. `launcher` wraps an agent
 * launcher so each turn's progress (`on_progress`) goes into the file while
 * the turn runs. A write that fails is skipped; the run never stops for it.
 *
 * @example
 * const live = createLiveFile({ file: runLiveFilePath({ runs_dir, run_id }) })
 * await runSteps({ launcher: live.launcher(launcher) })
 * live.close()
 */
export const createLiveFile = ({ file }: { file: string }) => {
    const agents = new Map<number, LiveAgent>()
    let plan_usage: Record<string, unknown> | null = null
    let feed: LiveFeedEntry[] = []
    let changed = false
    let last = 0
    let next = 0

    const write = (): void => {
        const at = Date.now()
        last = at
        changed = false
        const text = JSON.stringify({
            written_at: new Date(at).toISOString(),
            plan_usage,
            agents: [...agents.values()],
            feed,
        })
        try {
            mkdirSync(dirname(file), { recursive: true })
            const aside = `${file}.${process.pid}.tmp`
            writeFileSync(aside, text)
            renameSync(aside, file)
        } catch {
            // The live file is only for the board; the run goes on without it.
        }
    }

    const timer = setInterval(() => {
        const gap = Date.now() - last
        if ((changed && gap >= LIVE_MIN_GAP_MS) || gap >= LIVE_MAX_GAP_MS) {
            write()
        }
    }, LIVE_CHECK_MS)
    timer.unref?.()
    write()

    const heard = (key: number, progress: TurnProgress): void => {
        const agent = agents.get(key)
        if (agent === undefined) return
        const { action } = progress
        // A message that only adds tokens repeats the action it was on.
        if (action !== null && !sameAction(agent.action, action)) {
            const { ticket, role, model } = agent
            feed = [...feed, { ...action, ticket, role, model }].slice(
                -LIVE_FEED_SIZE
            )
        }
        agents.set(key, {
            ...agent,
            tokens: progress.tokens,
            action: progress.action,
            open_call: progress.open_call,
        })
        plan_usage ??= progress.rate_limit_events[0] ?? null
        changed = true
    }

    /** Shows the agent `who` in the file while `turn` runs. */
    const during = async <T>({
        who,
        on_progress,
        turn,
    }: {
        who: Pick<LiveAgent, 'ticket' | 'role' | 'model'>
        on_progress: ProgressListener | undefined
        turn: (hear: ProgressListener) => Promise<T>
    }): Promise<T> => {
        const key = next
        next += 1
        agents.set(key, { ...who, tokens: 0, action: null, open_call: null })
        changed = true
        try {
            return await turn((progress) => {
                heard(key, progress)
                on_progress?.(progress)
            })
        } finally {
            agents.delete(key)
            changed = true
        }
    }

    const launcher = <L extends AgentLauncher>(inner: L): L => {
        // A follow-up runs on its session's model.
        const models = new Map<string, string>()
        return {
            ...inner,
            launch: async (args) => {
                const turn = await during({
                    who: {
                        ticket: args.ticket,
                        role: args.role,
                        model: args.model,
                    },
                    on_progress: args.on_progress,
                    turn: (hear) =>
                        inner.launch({ ...args, on_progress: hear }),
                })
                if (turn.session_id !== undefined) {
                    models.set(turn.session_id, args.model)
                }
                return turn
            },
            followUp: (args) =>
                during({
                    who: {
                        ticket: args.ticket,
                        role: args.role,
                        model: models.get(args.session_id) ?? null,
                    },
                    on_progress: args.on_progress,
                    turn: (hear) =>
                        inner.followUp({ ...args, on_progress: hear }),
                }),
        }
    }

    const close = (): void => {
        clearInterval(timer)
        agents.clear()
        write()
    }

    return { launcher, close }
}
