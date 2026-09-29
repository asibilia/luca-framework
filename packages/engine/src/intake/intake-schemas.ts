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

const ISSUE_SNAPSHOT_FIELDS = {
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string(),
    labels: z.array(z.string()),
    url: z.string(),
}

/** The spec as it stood when intake passed. */
export const SpecSnapshotSchema = z.object({
    ...ISSUE_SNAPSHOT_FIELDS,
    /** The spec's owner: only their comments count as replies to stuck work. */
    author: z.string().default(''),
})

export type SpecSnapshot = z.infer<typeof SpecSnapshotSchema>

/** One open ticket as it stood when intake passed (or when a retry re-read it). */
export const TicketSnapshotSchema = z.object({
    ...ISSUE_SNAPSHOT_FIELDS,
    criteria: z.array(CriterionSchema),
    /** Open tickets of the same spec this one waits on. */
    blockers: z.array(z.number().int().positive()),
})

export type TicketSnapshot = z.infer<typeof TicketSnapshotSchema>

/**
 * Why intake left an open ticket out of the run (#499): `for_a_person`, as
 * it has the `ready-for-human` label, or `waits_on_person`, as it is
 * blocked, directly or through other tickets, by an open one that has.
 */
export const LeftOutReasonSchema = z.enum(['for_a_person', 'waits_on_person'])

export type LeftOutReason = z.infer<typeof LeftOutReasonSchema>

/** An open ticket intake left out of the run, and why (#499). */
export const LeftOutTicketSchema = z.object({
    number: z.number().int().positive(),
    title: z.string(),
    url: z.string().default(''),
    reason: LeftOutReasonSchema,
    /** For `waits_on_person`: the tickets for a person it waits on. */
    waits_on: z.array(z.number().int().positive()).default([]),
    /**
     * For `waits_on_person`: its own blockers that wait on a person too,
     * when it waits through them rather than (or as well as) directly.
     */
    through: z.array(z.number().int().positive()).default([]),
})

export type LeftOutTicket = z.infer<typeof LeftOutTicketSchema>

/**
 * The spec and its open tickets, in blocker order (blockers first), and
 * the open tickets left out for a person (#499), by number.
 */
export const IntakeSnapshotSchema = z.object({
    spec: SpecSnapshotSchema,
    tickets: z.array(TicketSnapshotSchema),
    closed_tickets: z.array(z.number().int().positive()),
    left_out: z.array(LeftOutTicketSchema).default([]),
})

export type IntakeSnapshot = z.infer<typeof IntakeSnapshotSchema>

/** The result of intake's checks. */
export type IntakeOutcome =
    | { outcome: 'refused'; problems: IntakeProblem[] }
    | {
          outcome: 'nothing_to_do'
          closed_tickets: number[]
          /** Open tickets left out for a person (#499): none left to build. */
          left_out: LeftOutTicket[]
      }
    | { outcome: 'passed'; snapshot: IntakeSnapshot }
