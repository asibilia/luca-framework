import { z } from 'zod'

/**
 * The **decision model** (Cloudflare's Clef today; Jev, TypeSafe's labeling
 * model, before #534) runs in **shadow mode**: the engine asks it and
 * journals its answers, but acts on its own fixed choices. These are the
 * shapes of what the engine asks and what it keeps of each answer. The
 * names (and the journal's `jev_*` record kinds) keep the Jev name, so old
 * journals still read.
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

/**
 * Why a decision model call gave no answers. New calls write
 * `missing_credentials` (no Cloudflare account id or token), `rejected`
 * (Cloudflare turned the token down: HTTP 401 or 403), `timeout`, or
 * `error`. `missing_key` is Jev's old reason (it had no key), kept so old
 * journals read.
 */
export const JevFailureReasonSchema = z.enum([
    'missing_key',
    'missing_credentials',
    'rejected',
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

/** The Clef models on Workers AI the engine can ask (#534). */
export const DECISION_MODEL_IDS = [
    '@cf/cloudflare/clef',
    '@cf/cloudflare/clef-flash',
] as const

/** A decision model's Workers AI id. */
export const DecisionModelIdSchema = z.enum(DECISION_MODEL_IDS)

export type DecisionModelId = z.infer<typeof DecisionModelIdSchema>

/** The model the engine asks when the config doesn't say: Clef, the accurate one. */
export const DEFAULT_DECISION_MODEL: DecisionModelId = '@cf/cloudflare/clef'

/**
 * Why the decision model is off for a run: `no_credentials` (Luca's env
 * file and the process env have no Cloudflare account id or token), or
 * `rejected` (Cloudflare turned the token down on an ask).
 */
export const DecisionModelOffReasonSchema = z.enum([
    'no_credentials',
    'rejected',
])

export type DecisionModelOffReason = z.infer<
    typeof DecisionModelOffReasonSchema
>
