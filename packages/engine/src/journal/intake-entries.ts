import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import {
    IntakeProblemSchema,
    IntakeReadSchema,
    LeftOutTicketSchema,
    SpecSnapshotSchema,
    TicketSnapshotSchema,
} from '../intake/intake-schemas'

/**
 * The journal entries of intake: what it read, a refusal, nothing to do,
 * and the spec and ticket snapshots.
 */

export const IntakeReadEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('intake_read'),
    content: IntakeReadSchema,
})

/**
 * A label the refusal couldn't add or remove (#500), with the tracker's
 * error. The refusal goes on without it.
 */
export const LabelFailureSchema = z.object({
    ticket: z.number().int().positive(),
    label: z.string(),
    change: z.enum(['add', 'remove']),
    error: z.string(),
})

export type LabelFailure = z.infer<typeof LabelFailureSchema>

/**
 * Intake refused the run. `label_failures` are the labels it couldn't
 * move; older journals have none.
 */
export const IntakeRefusedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('intake_refused'),
    content: z.object({
        problems: z.array(IntakeProblemSchema),
        label_failures: z.array(LabelFailureSchema).default([]),
    }),
})

/**
 * The run ends with nothing to do: at intake, as every ticket of the spec
 * is closed, or after it, as every ticket's work was already on the base
 * branch (`already_done`, #484; the engine closed those tickets). At
 * intake, `left_out` names the open tickets left for a person (#499), when
 * those are all that is open. Older journals have none.
 */
export const NothingToDoEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('nothing_to_do'),
    content: z.object({
        closed_tickets: z.array(z.number().int()),
        already_done: z.array(z.number().int().positive()).default([]),
        left_out: z.array(LeftOutTicketSchema).default([]),
    }),
})

export const SpecSnapshotEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('spec_snapshot'),
    content: z.object({
        spec: SpecSnapshotSchema,
        /** The open tickets in blocker order; one `ticket_snapshot` each. */
        ticket_order: z.array(z.number().int().positive()),
        closed_tickets: z.array(z.number().int().positive()),
        /**
         * The open tickets left out for a person, and why (#499). The run
         * doesn't build them or touch them. Older journals have none.
         */
        left_out: z.array(LeftOutTicketSchema).default([]),
    }),
})

export const TicketSnapshotEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_snapshot'),
    content: TicketSnapshotSchema,
})
