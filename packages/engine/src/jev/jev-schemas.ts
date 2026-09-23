import { z } from 'zod'

/**
 * Jev, TypeSafe's labeling model, runs in **shadow mode**: the engine asks it
 * and journals its answers, but acts on its own fixed choices. These are the
 * shapes of what the engine asks and what it keeps of each answer.
 */

/** Pick one of the criteria's keys. */
const JevChoiceQuestionSchema = z.object({
    type: z.literal('choice'),
    instructions: z.string(),
    /** The options, as keys. Jev wants each value to be `null`. */
    criteria: z.record(z.string(), z.null()),
})

/** Pick a place on an ordered scale, lowest first. */
const JevScoreQuestionSchema = z.object({
    type: z.literal('score'),
    instructions: z.string(),
    criteria: z.array(z.string()).min(2).max(10),
})

/** A yes or no question; Jev answers with one probability. */
const JevNoulQuestionSchema = z.object({
    type: z.literal('noul'),
    instructions: z.string(),
})

/** One question for Jev. */
export const JevQuestionSchema = z.discriminatedUnion('type', [
    JevChoiceQuestionSchema,
    JevScoreQuestionSchema,
    JevNoulQuestionSchema,
])

export type JevQuestion = z.infer<typeof JevQuestionSchema>

/** One call to Jev: the facts it judges from, and its questions by id. */
export const JevRequestSchema = z.object({
    state: z.record(z.string(), z.string()),
    questions: z.record(z.string(), JevQuestionSchema),
})

export type JevRequest = z.infer<typeof JevRequestSchema>

/**
 * What the engine keeps of one answer. `value` is the choice, score, or
 * probability Jev gave; `raw` is the answer exactly as it came back.
 */
export const JevAnswerSchema = z.object({
    value: z.union([z.string(), z.number()]).nullable(),
    /** Jev's confidence, or `null` when it gives none (as for noul). */
    confidence: z.number().nullable(),
    raw: z.unknown(),
})

export type JevAnswer = z.infer<typeof JevAnswerSchema>

/** The jobs the engine asks Jev about. */
export const JevJobSchema = z.enum([
    'ticket_model',
    'agent_skills',
    'ticket_order',
    'failure_kind',
    'finding_severity',
])

export type JevJob = z.infer<typeof JevJobSchema>

/** Why a Jev call gave no answers. */
export const JevFailureReasonSchema = z.enum([
    'missing_key',
    'timeout',
    'error',
])

export type JevFailureReason = z.infer<typeof JevFailureReasonSchema>

/**
 * The engine's own fixed choice for each question id, journaled next to the
 * question so Jev's answers can be scored against it later.
 */
export const JevFixedSchema = z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()])
)

export type JevFixed = z.infer<typeof JevFixedSchema>
