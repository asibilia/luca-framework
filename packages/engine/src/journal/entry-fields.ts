import { z } from 'zod'

/** The fields every journal entry has, whatever its kind. */

export const ENTRY_FIELDS = {
    /** The ticket (or spec) a record is about, `null` for the whole run. */
    ticket: z.number().int().positive().nullable(),
    /** The role that produced the record, `null` for the engine itself. */
    role: z.string().nullable(),
}
