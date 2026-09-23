import { z } from 'zod'

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
