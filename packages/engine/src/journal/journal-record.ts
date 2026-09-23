import { z } from 'zod'

import { EngineConfigSchema } from '../config/engine-config'
import {
    IntakeProblemSchema,
    IntakeReadSchema,
    SpecSnapshotSchema,
    TicketSnapshotSchema,
} from '../intake/intake-schemas'

const ENTRY_FIELDS = {
    /** The ticket (or spec) a record is about, `null` for the whole run. */
    ticket: z.number().int().positive().nullable(),
    /** The role that produced the record, `null` for the engine itself. */
    role: z.string().nullable(),
}

const STAMP_FIELDS = {
    /** 1, 2, 3, ... in the order records were appended. */
    seq: z.number().int().min(1),
    time: z.iso.datetime(),
}

const RunStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_started'),
    content: z.object({
        spec_number: z.number().int().positive(),
        config: EngineConfigSchema,
    }),
})

const IntakeReadEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('intake_read'),
    content: IntakeReadSchema,
})

const IntakeRefusedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('intake_refused'),
    content: z.object({ problems: z.array(IntakeProblemSchema) }),
})

const NothingToDoEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('nothing_to_do'),
    content: z.object({ closed_tickets: z.array(z.number().int()) }),
})

const SpecSnapshotEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('spec_snapshot'),
    content: z.object({
        spec: SpecSnapshotSchema,
        /** The open tickets in blocker order; one `ticket_snapshot` each. */
        ticket_order: z.array(z.number().int().positive()),
        closed_tickets: z.array(z.number().int().positive()),
    }),
})

const TicketSnapshotEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_snapshot'),
    content: TicketSnapshotSchema,
})

/**
 * What a caller hands the journal to append: a kind, its content, and who it
 * is about. The journal adds `seq` and `time`.
 *
 * Later tickets add kinds here (red check, gates, reviews, ...).
 */
export const JournalEntrySchema = z.discriminatedUnion('kind', [
    RunStartedEntrySchema,
    IntakeReadEntrySchema,
    IntakeRefusedEntrySchema,
    NothingToDoEntrySchema,
    SpecSnapshotEntrySchema,
    TicketSnapshotEntrySchema,
])

export type JournalEntry = z.infer<typeof JournalEntrySchema>

/** One line of a run's journal. */
export const JournalRecordSchema = z.discriminatedUnion('kind', [
    RunStartedEntrySchema.extend(STAMP_FIELDS),
    IntakeReadEntrySchema.extend(STAMP_FIELDS),
    IntakeRefusedEntrySchema.extend(STAMP_FIELDS),
    NothingToDoEntrySchema.extend(STAMP_FIELDS),
    SpecSnapshotEntrySchema.extend(STAMP_FIELDS),
    TicketSnapshotEntrySchema.extend(STAMP_FIELDS),
])

export type JournalRecord = z.infer<typeof JournalRecordSchema>

/** Every record kind the journal knows so far. */
export const JournalKindSchema = z.enum([
    'run_started',
    'intake_read',
    'intake_refused',
    'nothing_to_do',
    'spec_snapshot',
    'ticket_snapshot',
])

export type JournalKind = z.infer<typeof JournalKindSchema>

export const JOURNAL_KINDS = JournalKindSchema.options
