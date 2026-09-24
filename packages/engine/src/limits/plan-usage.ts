import { z } from 'zod'

import { RateLimitReadingSchema } from './plan-signals'

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

/** An agent session as `usageFor` reads it: whose it was, and its summary. */
export type SessionReading = {
    ticket: number | null
    session: Pick<AgentSession, 'usage' | 'rate_limit_events'>
}

const EMPTY_TOKENS: TokenTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
}

/** A fraction as a percent, to two places, so 0.03 reads as 3. */
const percentOf = (fraction: number): number =>
    Math.round(fraction * 10_000) / 100

/**
 * Each window's utilization in one reading, as percents, in the order the
 * reading gives them: its `unifiedWindows`, then its top-level window.
 */
const windowSamples = (info: unknown): [string, number][] => {
    const parsed = RateLimitReadingSchema.safeParse(info)
    if (!parsed.success) return []
    const { unifiedWindows, rateLimitType, utilization } = parsed.data
    const unified = Object.entries(unifiedWindows ?? {}).flatMap(
        ([name, { utilization: value }]): [string, number][] =>
            value === undefined ? [] : [[name, percentOf(value)]]
    )
    const top: [string, number][] =
        rateLimitType === undefined || utilization === undefined
            ? []
            : [[rateLimitType, percentOf(utilization)]]
    return [...unified, ...top]
}

/**
 * The usage of one ticket (or, with `ticket: null`, the whole run) from the
 * run's agent sessions, oldest first: tokens summed over its sessions, and
 * each plan window's movement. A ticket's window starts from the last reading
 * before its first session (any ticket's), so the ticket's own first agent
 * counts. A reading lower than the one before means the window reset: it
 * counts from 0 again. Pure.
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
    const windows: Record<string, WindowUsage> = {}
    const lastSeen = new Map<string, number>()
    for (const reading of sessions) {
        const inScope = ticket === null || reading.ticket === ticket
        if (inScope) {
            agent_turns += 1
            const { usage } = reading.session
            tokens = {
                input_tokens: tokens.input_tokens + usage.input_tokens,
                output_tokens: tokens.output_tokens + usage.output_tokens,
                cache_read_input_tokens:
                    tokens.cache_read_input_tokens +
                    usage.cache_read_input_tokens,
                cache_creation_input_tokens:
                    tokens.cache_creation_input_tokens +
                    usage.cache_creation_input_tokens,
            }
        }
        for (const info of reading.session.rate_limit_events) {
            for (const [name, percent] of windowSamples(info)) {
                if (inScope) {
                    const base = lastSeen.get(name) ?? percent
                    const window = windows[name] ?? {
                        from: base,
                        to: base,
                        used: 0,
                    }
                    const step =
                        percent >= window.to ? percent - window.to : percent
                    windows[name] = {
                        from: window.from,
                        to: percent,
                        used: Math.round((window.used + step) * 100) / 100,
                    }
                }
                lastSeen.set(name, percent)
            }
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
