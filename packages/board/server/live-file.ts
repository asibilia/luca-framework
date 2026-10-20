/**
 * The run's live file (#628): `<runs_dir>/<run_id>/live.json`, what each
 * agent in a turn is doing now, as the engine keeps it beside the journal.
 * The board reads it on each read, for the runs it started and the ones it
 * didn't, and lays it over the state the journal made. Only the latest
 * file counts; nothing of it is stored or replayed.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import { RateLimitReadingSchema } from './board-vocabulary-shapes'
import { usageAfter } from './reduce-board-usage'

import {
    LiveAgentSchema,
    LiveFeedEntrySchema,
    LiveWaitSchema,
    type BoardState,
} from '../shared/board-state'

/** The live file's name inside a run folder. */
export const LIVE_FILE = 'live.json'

const LiveFileSchema = z.object({
    written_at: z.string(),
    /** The run's first plan-usage reading, with its `arrived_at`. */
    plan_usage: RateLimitReadingSchema.extend({
        arrived_at: z.string().optional().catch(undefined),
    })
        .nullable()
        .catch(null)
        .default(null),
    /** Each agent's entry; one that doesn't read is left out. */
    agents: z
        .array(z.unknown())
        .catch([])
        .transform((agents) =>
            agents.flatMap((agent) => {
                const parsed = LiveAgentSchema.safeParse(agent)
                return parsed.success ? [parsed.data] : []
            })
        ),
    /**
     * The waits inside a step going now (#632); one that doesn't read is
     * left out, and a file from before them has none.
     */
    waits: z
        .array(z.unknown())
        .catch([])
        .transform((waits) =>
            waits.flatMap((wait) => {
                const parsed = LiveWaitSchema.safeParse(wait)
                return parsed.success ? [parsed.data] : []
            })
        ),
    /**
     * The run's last actions, oldest first (#634); one that doesn't read is
     * left out, and a file from before it has none.
     */
    feed: z
        .array(z.unknown())
        .catch([])
        .default([])
        .transform((feed) =>
            feed.flatMap((entry) => {
                const parsed = LiveFeedEntrySchema.safeParse(entry)
                return parsed.success ? [parsed.data] : []
            })
        ),
})

export type LiveFile = z.infer<typeof LiveFileSchema>

/** A run's live file, or `null` when it has none or it doesn't read. */
export const readLiveFile = async ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): Promise<LiveFile | null> => {
    try {
        const text = await readFile(join(runs_dir, run_id, LIVE_FILE), 'utf8')
        const parsed = LiveFileSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

/**
 * The state with its live file laid over it: each card gets its agent's
 * entry (or none) and its check's slot wait (or none), the feed is the
 * file's, and the plan usage, with no reading yet, fills in from the
 * file's first one.
 */
export const withLive = ({
    state,
    live,
}: {
    state: BoardState
    live: LiveFile | null
}): BoardState => {
    const agents = live?.agents ?? []
    const waits = live?.waits ?? []
    const reading = live?.plan_usage ?? null
    return {
        ...state,
        live_agents: agents,
        tickets: state.tickets.map((card) => ({
            ...card,
            live: agents.find((agent) => agent.ticket === card.number) ?? null,
            slot_wait:
                waits.find((wait) => wait.ticket === card.number) ?? null,
        })),
        feed: live?.feed ?? [],
        usage:
            state.usage ??
            (reading === null || live === null
                ? null
                : usageAfter({
                      usage: null,
                      readings: [reading],
                      time: reading.arrived_at ?? live.written_at,
                  })),
    }
}
