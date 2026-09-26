import { z } from 'zod'

import { RateLimitReadingSchema, type RateLimitReading } from './plan-signals'

import type { AgentSession } from '../agents/agent-launcher'

/** Tokens summed over agent sessions. */
export const TokenTotalsSchema = z.object({
    input_tokens: z.number().min(0),
    output_tokens: z.number().min(0),
    cache_read_input_tokens: z.number().min(0),
    cache_creation_input_tokens: z.number().min(0),
})

export type TokenTotals = z.infer<typeof TokenTotalsSchema>

/**
 * How far one plan window moved, in percent (0 to 100): the reading before,
 * the last reading, and how much was used in between (a reset in between
 * counts from 0 again).
 */
export const WindowUsageSchema = z.object({
    from: z.number(),
    to: z.number(),
    used: z.number().min(0),
})

export type WindowUsage = z.infer<typeof WindowUsageSchema>

/** One usage record: a ticket's, or the whole run's. */
export const UsageRecordSchema = z.object({
    scope: z.enum(['ticket', 'run']),
    /** The ticket, for scope `ticket`; `null` for the run. */
    ticket: z.number().int().positive().nullable(),
    /** Agent turns (sessions journaled) counted. */
    agent_turns: z.number().int().min(0),
    tokens: TokenTotalsSchema,
    /** Each plan window's movement, keyed by window (`five_hour`, `seven_day`, ...). */
    windows: z.record(z.string(), WindowUsageSchema),
})

export type UsageRecord = z.infer<typeof UsageRecordSchema>

/**
 * An agent session as `usageFor` reads it: whose it was, and its summary.
 * An older journal's session has no `model_usage`.
 */
export type SessionReading = {
    ticket: number | null
    session: Pick<AgentSession, 'usage' | 'rate_limit_events'> &
        Partial<Pick<AgentSession, 'model_usage'>>
}

const EMPTY_TOKENS: TokenTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
}

const addTokens = (a: TokenTotals, b: TokenTotals): TokenTotals => ({
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens:
        a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens:
        a.cache_creation_input_tokens + b.cache_creation_input_tokens,
})

/**
 * One agent turn's tokens: summed over its tokens per model, subagents
 * included. A turn with none (an older journal's) counts its main loop's
 * `usage` instead.
 */
export const sessionTokens = ({
    session,
}: {
    session: SessionReading['session']
}): TokenTotals => {
    const models = Object.values(session.model_usage ?? {})
    return models.length === 0
        ? session.usage
        : models.reduce(addTokens, EMPTY_TOKENS)
}

/**
 * The tokens that count toward a run's use: input, output, and
 * cache-creation tokens. Cache reads are left out.
 *
 * @example
 * countedTokens({ tokens: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 900, cache_creation_input_tokens: 3 } }) // 6
 */
export const countedTokens = ({ tokens }: { tokens: TokenTotals }): number =>
    tokens.input_tokens +
    tokens.output_tokens +
    tokens.cache_creation_input_tokens

/** A fraction as a percent, to two places, so 0.03 reads as 3. */
const percentOf = (fraction: number): number =>
    Math.round(fraction * 10_000) / 100

/** One window in one reading: its fill level in percent, and its reset time. */
export type WindowSample = {
    name: string
    percent: number
    /** Seconds since the epoch, or `null` when the reading gives none. */
    resets_at: number | null
}

/**
 * Each window's fill level in one reading, as percents, in the order the
 * reading gives them: its `unifiedWindows`, then its top-level window.
 */
export const windowSamples = (reading: RateLimitReading): WindowSample[] => {
    const { unifiedWindows, rateLimitType, utilization, resetsAt } = reading
    const unified = Object.entries(unifiedWindows ?? {}).flatMap(
        ([name, window]): WindowSample[] =>
            window.utilization === undefined
                ? []
                : [
                      {
                          name,
                          percent: percentOf(window.utilization),
                          resets_at: window.resetsAt ?? null,
                      },
                  ]
    )
    const top: WindowSample[] =
        rateLimitType === undefined || utilization === undefined
            ? []
            : [
                  {
                      name: rateLimitType,
                      percent: percentOf(utilization),
                      resets_at: resetsAt ?? null,
                  },
              ]
    return [...unified, ...top]
}

/** One reading to replay: whether it's in scope, and its windows. */
type ReplayReading = { in_scope: boolean; samples: WindowSample[] }

/**
 * Every session's readings in arrival order. A reading with no arrival time
 * (an older journal's) keeps its place after the reading before it, so an
 * older journal replays in journal order.
 */
const inArrivalOrder = ({
    sessions,
    ticket,
}: {
    sessions: SessionReading[]
    ticket: number | null
}): ReplayReading[] => {
    let arrival = -Infinity
    const timed = sessions.flatMap((session) =>
        session.session.rate_limit_events.flatMap((info) => {
            const parsed = RateLimitReadingSchema.safeParse(info)
            if (!parsed.success) return []
            const at = Date.parse(parsed.data.arrived_at ?? '')
            if (Number.isFinite(at)) arrival = at
            return [
                {
                    arrival,
                    in_scope: ticket === null || session.ticket === ticket,
                    samples: windowSamples(parsed.data),
                },
            ]
        })
    )
    return timed.sort((a, b) => a.arrival - b.arrival)
}

/**
 * One window's last reading: its fill level and reset time, and the highest
 * fill level since the window last reset.
 */
type WindowSeen = { percent: number; resets_at: number | null; peak: number }

/**
 * How much of a window one reading used, from the window's last reading.
 * A changed reset time is a reset: the reading counts from 0. With the same
 * reset time, only a rise above the highest level since the reset counts,
 * so a level that wobbles (62, 63, 62, 63) uses 1 point. Without both reset
 * times, a drop is taken for a reset, as older readings may lack them.
 */
const advance = ({
    seen,
    sample,
}: {
    seen: WindowSeen | undefined
    sample: WindowSample
}): { used: number; seen: WindowSeen } => {
    const { percent, resets_at } = sample
    if (seen === undefined) {
        return { used: 0, seen: { percent, resets_at, peak: percent } }
    }
    const known = seen.resets_at !== null && resets_at !== null
    if (known && seen.resets_at !== resets_at) {
        return { used: percent, seen: { percent, resets_at, peak: percent } }
    }
    if (known) {
        return {
            used: Math.max(0, percent - seen.peak),
            seen: { percent, resets_at, peak: Math.max(seen.peak, percent) },
        }
    }
    return {
        used: percent >= seen.percent ? percent - seen.percent : percent,
        seen: { percent, resets_at, peak: percent },
    }
}

/**
 * The usage of one ticket (or, with `ticket: null`, the whole run) from the
 * run's agent sessions, oldest first: tokens summed over its sessions (see
 * `sessionTokens`), and
 * each plan window's movement. Readings replay in arrival order. A ticket's
 * window starts from the last reading before its first one (any ticket's),
 * so the ticket's own first agent counts. A changed reset time means the
 * window reset: it counts from 0 again (see `advance`). Pure.
 *
 * @example
 * usageFor({ sessions, ticket: 11 })
 * // { scope: 'ticket', ticket: 11, agent_turns: 3, tokens: {...}, windows: { five_hour: { from: 10, to: 13, used: 3 } } }
 */
export const usageFor = ({
    sessions,
    ticket,
}: {
    sessions: SessionReading[]
    ticket: number | null
}): UsageRecord => {
    let tokens = EMPTY_TOKENS
    let agent_turns = 0
    for (const reading of sessions) {
        if (ticket === null || reading.ticket === ticket) {
            agent_turns += 1
            tokens = addTokens(
                tokens,
                sessionTokens({ session: reading.session })
            )
        }
    }
    const windows: Record<string, WindowUsage> = {}
    const lastSeen = new Map<string, WindowSeen>()
    for (const reading of inArrivalOrder({ sessions, ticket })) {
        for (const sample of reading.samples) {
            const seen = lastSeen.get(sample.name)
            const next = advance({ seen, sample })
            if (reading.in_scope) {
                const base = seen?.percent ?? sample.percent
                const window = windows[sample.name] ?? {
                    from: base,
                    to: base,
                    used: 0,
                }
                windows[sample.name] = {
                    from: window.from,
                    to: sample.percent,
                    used: Math.round((window.used + next.used) * 100) / 100,
                }
            }
            lastSeen.set(sample.name, next.seen)
        }
    }
    return {
        scope: ticket === null ? 'run' : 'ticket',
        ticket,
        agent_turns,
        tokens,
        windows,
    }
}
