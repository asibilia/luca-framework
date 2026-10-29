import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

/**
 * The journal entries of the network wait (#701): a step that can't reach
 * GitHub is tried again every minute for up to 15 minutes.
 */

/** `step` threw a GitHub network error, `error`; the run waits for GitHub. */
export const NetworkWaitStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('network_wait_started'),
    content: z.object({ step: z.string().min(1), error: z.string() }),
})

/**
 * The wait for `step` is over after `tries` more runs of it: the step
 * worked, or (`gave_up`) 15 minutes passed and the run crashes.
 */
export const NetworkWaitEndedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('network_wait_ended'),
    content: z.object({
        step: z.string().min(1),
        tries: z.number().int().min(0),
        gave_up: z.literal(true).optional(),
    }),
})
