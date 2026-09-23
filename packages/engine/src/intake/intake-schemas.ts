import { z } from 'zod'

import { TrackerIssueSchema } from '../tracker/tracker'

/**
 * Everything intake read from the tracker, as journaled in `intake_read`.
 * Intake's checks run on this record alone, so a replay gets the same answer.
 */
export const IntakeReadSchema = z.object({
    spec: TrackerIssueSchema,
    /** Every sub-ticket of the spec, open and closed. */
    sub_tickets: z.array(TrackerIssueSchema),
    /** Issues outside the spec that an open ticket names as a blocker. */
    outside_blockers: z.array(TrackerIssueSchema).default([]),
})

export type IntakeRead = z.infer<typeof IntakeReadSchema>

/**
 * What is missing on one issue. `ticket` is `null` for problems with the run
 * itself (such as the engine config), else the spec's or ticket's number.
 */
export const IntakeProblemSchema = z.object({
    ticket: z.number().int().positive().nullable(),
    missing: z.array(z.string()).min(1),
})

export type IntakeProblem = z.infer<typeof IntakeProblemSchema>

/** One acceptance criterion, numbered `AC1`, `AC2`, ... in ticket order. */
export const CriterionSchema = z.object({
    id: z.string(),
    text: z.string(),
})

export type Criterion = z.infer<typeof CriterionSchema>

/** The spec as it stood when intake passed. */
export const SpecSnapshotSchema = z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string(),
    labels: z.array(z.string()),
    url: z.string(),
})

export type SpecSnapshot = z.infer<typeof SpecSnapshotSchema>

/** One open ticket as it stood when intake passed. */
export const TicketSnapshotSchema = SpecSnapshotSchema.extend({
    criteria: z.array(CriterionSchema),
    /** Open tickets of the same spec this one waits on. */
    blockers: z.array(z.number().int().positive()),
})

export type TicketSnapshot = z.infer<typeof TicketSnapshotSchema>

/** The spec and its open tickets, in blocker order (blockers first). */
export const IntakeSnapshotSchema = z.object({
    spec: SpecSnapshotSchema,
    tickets: z.array(TicketSnapshotSchema),
    closed_tickets: z.array(z.number().int().positive()),
})

export type IntakeSnapshot = z.infer<typeof IntakeSnapshotSchema>

/** The result of intake's checks. */
export type IntakeOutcome =
    | { outcome: 'refused'; problems: IntakeProblem[] }
    | { outcome: 'nothing_to_do'; closed_tickets: number[] }
    | { outcome: 'passed'; snapshot: IntakeSnapshot }
