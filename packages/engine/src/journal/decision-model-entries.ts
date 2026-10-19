import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import {
    DecisionModelOffReasonSchema,
    JevAnswerSchema,
    JevFailureReasonSchema,
    JevFixedSchema,
    JevJobSchema,
    JevRequestSchema,
} from '../jev/jev-schemas'

/**
 * The journal entries of the decision model in shadow mode: each ask, its
 * answers or failure, and the model turned off for the run.
 */

/**
 * The engine asked the decision model (Clef; Jev in older journals), in
 * shadow mode, with its own fixed choice beside. `model` is the model asked;
 * journals from before #534 have none. `acted` is true when the answer can
 * change what the engine does, false for a shadow ask; older journals read
 * it as false.
 */
export const JevAskedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('jev_asked'),
    content: z.object({
        job: JevJobSchema,
        request: JevRequestSchema,
        fixed: JevFixedSchema,
        model: z.string().optional(),
        acted: z.boolean().default(false),
    }),
})

/**
 * The decision model's answers to the `jev_asked` record at `asked_seq`.
 * The engine ignores them. `model` is the model that answered, as it named
 * itself (such as `clef`); journals from before #534 have none.
 */
export const JevAnsweredEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('jev_answered'),
    content: z.object({
        job: JevJobSchema,
        asked_seq: z.number().int().min(1),
        answers: z.record(z.string(), JevAnswerSchema),
        /** How long the call took. */
        ms: z.number().min(0),
        model: z.string().optional(),
    }),
})

/** The decision model call at `asked_seq` gave no answers. The run goes on regardless. */
export const JevFailedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('jev_failed'),
    content: z.object({
        job: JevJobSchema,
        asked_seq: z.number().int().min(1),
        reason: JevFailureReasonSchema,
        error: z.string(),
        ms: z.number().min(0),
    }),
})

/**
 * The decision model is off for the rest of the run (#534), so the engine
 * asks it nothing more: `no_credentials` at the start (Luca's env file and
 * the process env have no Cloudflare account id or token), or `rejected`
 * after an ask Cloudflare turned down. `model` is the model it would have
 * asked; `detail` is one plain sentence (the file and keys to add, or
 * Cloudflare's answer), never the token. Shadow mode only: it changes
 * nothing in the run.
 */
export const DecisionModelOffEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('decision_model_off'),
    content: z.object({
        model: z.string(),
        reason: DecisionModelOffReasonSchema,
        detail: z.string(),
    }),
})
