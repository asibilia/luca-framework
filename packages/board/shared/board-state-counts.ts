/**
 * What the board only counts: the decision model's questions, agent
 * messages, and memory with its learner.
 */
import { z } from 'zod'

/**
 * The decision model (Clef; Jev in older journals) in shadow mode: how often
 * the engine asked it and what came back. The engine never acts on the
 * answers, so the board only counts them.
 */
export const JevCountsSchema = z.object({
    asked: z.number().int().min(0),
    answered: z.number().int().min(0),
    failed: z.number().int().min(0),
})

export type JevCounts = z.infer<typeof JevCountsSchema>

/**
 * Agent messages: `sent` counts the queued and the not delivered ones,
 * `refused` the ones the engine turned down, and `delivered` the messages
 * handed over, once per receiver (a message to `all` can count more than
 * once). Messages happen inside a turn, so the board only counts them.
 */
export const MessageCountsSchema = z.object({
    sent: z.number().int().min(0),
    refused: z.number().int().min(0),
    delivered: z.number().int().min(0),
})

export type MessageCounts = z.infer<typeof MessageCountsSchema>

/**
 * Where the learner stands at the end of a run (#370): `waiting` until it
 * starts (a run without memory never starts it), `learning`, `learned`
 * once it answered, or `skipped` when the engine gave up on it.
 */
export const LearnerStateSchema = z.enum([
    'waiting',
    'learning',
    'learned',
    'skipped',
])

export type LearnerState = z.infer<typeof LearnerStateSchema>

/**
 * Memory (#370), counted: the searches at recall points (and the vault
 * searches among them that failed), the memories they showed agents, the
 * learner, and what became of its memories. Memory changes no ticket, so
 * the board only counts it.
 */
export const MemoryCountsSchema = z.object({
    searches: z.number().int().min(0),
    search_errors: z.number().int().min(0),
    shown: z.number().int().min(0),
    learner: LearnerStateSchema,
    added: z.number().int().min(0),
    updated: z.number().int().min(0),
    refused: z.number().int().min(0),
    failed: z.number().int().min(0),
})

export type MemoryCounts = z.infer<typeof MemoryCountsSchema>

/** Memory before any of its records. */
export const NO_MEMORY: MemoryCounts = {
    searches: 0,
    search_errors: 0,
    shown: 0,
    learner: 'waiting',
    added: 0,
    updated: 0,
    refused: 0,
    failed: 0,
}
