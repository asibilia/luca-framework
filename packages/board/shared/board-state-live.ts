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
    /**
     * The agent's activity count for each of the last 30 seconds (#631),
     * oldest first; a file from before has none.
     */
    activity: z.array(z.number().min(0)).catch([]).default([]),
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

/**
 * A wait inside a step (#632): a ticket's check waits for a prepare slot
 * or a test slot, while `in_use` of the engine's `slots` are taken.
 */
export const LiveWaitSchema = z.object({
    ticket: z.number().int(),
    for: z.enum(['prepare_slot', 'test_slot']),
    in_use: z.number().int().min(0),
    slots: z.number().int().min(0),
    since: z.string(),
})

export type LiveWait = z.infer<typeof LiveWaitSchema>
