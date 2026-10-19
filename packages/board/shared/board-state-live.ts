/**
 * The live file (#628) in the board's state: what an agent in a turn is
 * doing now, from the engine's `live.json`, never from the journal.
 */
import { z } from 'zod'

/** The agent's latest action: a tool and a short target, with its time. */
export const LiveActionSchema = z.object({
    tool: z.string(),
    target: z.string(),
    at: z.string(),
})

/** A tool call still running, since `started_at`. */
export const LiveOpenCallSchema = z.object({
    tool: z.string(),
    target: z.string(),
    started_at: z.string(),
})

/** One agent in a turn, as the live file has it. */
export const LiveAgentSchema = z.object({
    ticket: z.number().int().nullable(),
    role: z.string(),
    model: z.string().nullable().default(null),
    /** The turn's tokens so far, cache reads included; the journal has none of them yet. */
    tokens: z.number().min(0).default(0),
    action: LiveActionSchema.nullable().default(null),
    open_call: LiveOpenCallSchema.nullable().default(null),
})

export type LiveAgent = z.infer<typeof LiveAgentSchema>

/** One action of the run's live feed (#634): when, who, on which model, and what. */
export const LiveFeedEntrySchema = z.object({
    at: z.string(),
    ticket: z.number().int().nullable(),
    role: z.string(),
    model: z.string().nullable().default(null),
    tool: z.string(),
    target: z.string(),
})

export type LiveFeedEntry = z.infer<typeof LiveFeedEntrySchema>
