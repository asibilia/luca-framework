/**
 * The run's **live file** (#628): `live.json` in the run folder, what each
 * agent in a turn is doing now, and each check waiting for a prepare slot
 * or a test slot (#632), for the board to show between journal records,
 * and the run's last 50 actions across tickets, its live feed (#634). It
 * is never journaled and never replayed: each write replaces
 * the whole file (written aside, then renamed), at most once a second
 * while something changed, and at least every 5 seconds while the engine
 * runs, each with its `written_at` time. Each agent's entry carries its
 * activity for each of the last 30 seconds (#631), for the board's
 * heartbeat, and its helpers (#636), whose actions go in the feed too.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import type { AgentLauncher } from '../agents/agent-launcher'
import type {
    ProgressAction,
    ProgressListener,
    TurnProgress,
} from '../agents/turn-progress'
import type { SlotWaitListener } from '../gates/slot-waits'

/** The live file's name inside a run folder. */
export const LIVE_FILE = 'live.json'

/** The live file is written at most this often while something changes. */
export const LIVE_MIN_GAP_MS = 1000

/** The live file is written at least this often, changed or not. */
export const LIVE_MAX_GAP_MS = 5000

/** How often the writer looks for something to write. */
const LIVE_CHECK_MS = 200

/** How many seconds of activity each agent's entry keeps (#631). */
export const ACTIVITY_SECONDS = 30

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

/** An action: a tool and a short target, with its time (ISO). */
const LiveActionSchema = z.object({
    tool: z.string(),
    target: z.string(),
    at: z.string(),
})

/** A tool call whose result hasn't come back yet. */
const LiveOpenCallSchema = z.object({
    tool: z.string(),
    target: z.string(),
    started_at: z.string(),
})

/** One of an agent's helpers (#636). */
const LiveHelperSchema = z.object({
    model: z.string(),
    action: LiveActionSchema.nullable(),
    done: z.boolean(),
})

/** One agent in a turn, as the live file has it. */
const LiveAgentSchema = z.object({
    ticket: z.number().int(),
    role: z.string(),
    model: z.string().nullable(),
    tokens: z.number().min(0),
    action: LiveActionSchema.nullable(),
    open_call: LiveOpenCallSchema.nullable(),
    /** The helpers the agent started this turn (#636). */
    helpers: z.array(LiveHelperSchema),
    /** One count for each of the last 30 seconds, oldest first (#631). */
    activity: z.array(z.number().int().min(0)),
})

/** A ticket's check waiting for a slot (#632), as the live file has it. */
const LiveWaitSchema = z.object({
    ticket: z.number().int(),
    for: z.enum(['prepare_slot', 'test_slot']),
    in_use: z.number().int().min(0),
    slots: z.number().int().min(0),
    since: z.string(),
})

/** One action of the live feed: who did it, on which model, and what. */
const LiveFeedEntrySchema = z.object({
    at: z.string(),
    ticket: z.number().int(),
    role: z.string(),
    model: z.string().nullable(),
    tool: z.string(),
    target: z.string(),
})

/** The whole live file, as each write has it. */
export const LiveFileSchema = z.object({
    written_at: z.string(),
    /** The run's first plan-usage reading, as its `rate_limit_event` sent it. */
    plan_usage: z.record(z.string(), z.unknown()).nullable(),
    agents: z.array(LiveAgentSchema),
    waits: z.array(LiveWaitSchema),
    feed: z.array(LiveFeedEntrySchema),
})

export type LiveFile = z.infer<typeof LiveFileSchema>

export type LiveAgent = z.infer<typeof LiveAgentSchema>

export type LiveHelper = z.infer<typeof LiveHelperSchema>

export type LiveWait = z.infer<typeof LiveWaitSchema>

type LiveFeedEntry = z.infer<typeof LiveFeedEntrySchema>

/** An agent's entry before its activity is added at write time. */
type HeldAgent = Omit<LiveAgent, 'activity'>

const sameAction = (
    left: ProgressAction | null,
    right: ProgressAction
): boolean =>
    left !== null &&
    left.tool === right.tool &&
    left.target === right.target &&
    left.at === right.at

/**
 * One agent's activity (#631): a count per second, by the second it
 * happened in. Each progress heard is one tick, and so is each second a
 * tool call is open, a low, steady ripple while a long command runs.
 */
const createActivity = () => {
    const counts = new Map<number, number>()
    /** The last second an open tool call ticked in. */
    let rippled = -1

    const secondOf = (ms: number): number => Math.floor(ms / 1000)

    const tick = (at: number): void => {
        const second = secondOf(at)
        counts.set(second, (counts.get(second) ?? 0) + 1)
        for (const old of counts.keys()) {
            if (old <= second - ACTIVITY_SECONDS) counts.delete(old)
        }
    }

    /** One low tick for this second, once, while a tool call is open. */
    const ripple = (at: number): boolean => {
        if (secondOf(at) === rippled) return false
        rippled = secondOf(at)
        tick(at)
        return true
    }

    /** The counts of the last 30 seconds up to `at`, oldest first. */
    const recent = (at: number): number[] =>
        Array.from(
            { length: ACTIVITY_SECONDS },
            (_, index) =>
                counts.get(secondOf(at) - ACTIVITY_SECONDS + 1 + index) ?? 0
        )

    return { tick, ripple, recent }
}

/**
 * Keeps the live file at `file` from the moment it is made until `close`,
 * which writes it one last time with no agents. `launcher` wraps an agent
 * launcher so each turn's progress (`on_progress`) goes into the file while
 * the turn runs; `slotWaits` hears a ticket step's slot waits (see
 * `hearSlotWaits`). A write that fails is skipped; the run never stops for it.
 *
 * @example
 * const live = createLiveFile({ file: runLiveFilePath({ runs_dir, run_id }) })
 * await runSteps({ launcher: live.launcher(launcher) })
 * live.close()
 */
export const createLiveFile = ({ file }: { file: string }) => {
    const agents = new Map<number, HeldAgent>()
    const activities = new Map<number, ReturnType<typeof createActivity>>()
    const waits = new Map<number, LiveWait>()
    let plan_usage: Record<string, unknown> | null = null
    let feed: LiveFeedEntry[] = []
    let changed = false
    let last = 0
    let next = 0

    const write = (): void => {
        const at = Date.now()
        last = at
        changed = false
        const live: LiveFile = {
            written_at: new Date(at).toISOString(),
            plan_usage,
            agents: [...agents].map(([key, agent]) => ({
                ...agent,
                activity: activities.get(key)?.recent(at) ?? [],
            })),
            waits: [...waits.values()],
            feed,
        }
        const text = JSON.stringify(live)
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
        const at = Date.now()
        for (const [key, agent] of agents) {
            if (agent.open_call === null) continue
            if (activities.get(key)?.ripple(at)) changed = true
        }
        const gap = at - last
        if ((changed && gap >= LIVE_MIN_GAP_MS) || gap >= LIVE_MAX_GAP_MS) {
            write()
        }
    }, LIVE_CHECK_MS)
    timer.unref?.()
    write()

    const heard = (key: number, progress: TurnProgress): void => {
        const agent = agents.get(key)
        if (agent === undefined) return
        activities.get(key)?.tick(Date.now())
        const { action, helpers = [] } = progress
        const { ticket, role, model } = agent
        // A message that only adds tokens repeats the action it was on.
        const fresh = [
            ...(action !== null && !sameAction(agent.action, action)
                ? [{ ...action, ticket, role, model }]
                : []),
            // A helper's actions go in the feed too, on its own model.
            ...helpers.flatMap((helper, index) =>
                helper.action !== null &&
                !sameAction(agent.helpers[index]?.action ?? null, helper.action)
                    ? [
                          {
                              ...helper.action,
                              ticket,
                              role: 'helper',
                              model: helper.model,
                          },
                      ]
                    : []
            ),
        ]
        if (fresh.length > 0) feed = [...feed, ...fresh].slice(-LIVE_FEED_SIZE)
        agents.set(key, {
            ...agent,
            tokens: progress.tokens,
            action: progress.action,
            open_call: progress.open_call,
            helpers,
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
        who: Pick<HeldAgent, 'ticket' | 'role' | 'model'>
        on_progress: ProgressListener | undefined
        turn: (hear: ProgressListener) => Promise<T>
    }): Promise<T> => {
        const key = next
        next += 1
        agents.set(key, {
            ...who,
            tokens: 0,
            action: null,
            open_call: null,
            helpers: [],
        })
        activities.set(key, createActivity())
        changed = true
        try {
            return await turn((progress) => {
                heard(key, progress)
                on_progress?.(progress)
            })
        } finally {
            agents.delete(key)
            activities.delete(key)
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

    /** Shows each slot wait of `ticket`'s step in the file while it lasts. */
    const slotWaits =
        ({ ticket }: { ticket: number }): SlotWaitListener =>
        (wait) => {
            const key = next
            next += 1
            waits.set(key, {
                ticket,
                ...wait,
                since: new Date().toISOString(),
            })
            changed = true
            return () => {
                waits.delete(key)
                changed = true
            }
        }

    const close = (): void => {
        clearInterval(timer)
        agents.clear()
        activities.clear()
        waits.clear()
        write()
    }

    return { launcher, slotWaits, close }
}
