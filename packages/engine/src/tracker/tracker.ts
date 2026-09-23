import { z } from 'zod'

/** One GitHub-style issue as the engine sees it: a spec, a ticket, or a blocker. */
export const TrackerIssueSchema = z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().default(''),
    state: z.enum(['open', 'closed']),
    labels: z.array(z.string()).default([]),
    /** Native "blocked by" links from the tracker. */
    blocked_by: z.array(z.number().int().positive()).default([]),
    url: z.string().default(''),
})

export type TrackerIssue = z.infer<typeof TrackerIssueSchema>

/**
 * What the engine needs from an issue tracker. A plain object of async
 * functions, so a real tracker (GitHub via `gh`) and an in-memory one for
 * tests are interchangeable.
 *
 * Later tickets add reading the user's replies and opening the pull request;
 * they are left out on purpose until then.
 */
export type Tracker = {
    /** Reads the spec issue. Throws if it does not exist. */
    readSpec: (args: { spec_number: number }) => Promise<TrackerIssue>
    /** Lists every sub-ticket of the spec, open and closed. */
    listSubTickets: (args: { spec_number: number }) => Promise<TrackerIssue[]>
    /** Reads any issue, such as a blocker outside the spec. `null` if missing. */
    readIssue: (args: { number: number }) => Promise<TrackerIssue | null>
    /** Posts a comment on an issue. */
    comment: (args: { number: number; body: string }) => Promise<void>
    /** Adds a label to an issue. Adding a label it already has does nothing. */
    addLabel: (args: { number: number; label: string }) => Promise<void>
    /** Removes a label from an issue. Removing a missing label does nothing. */
    removeLabel: (args: { number: number; label: string }) => Promise<void>
}

/** The label a ticket needs before intake lets a run build it. */
export const READY_LABEL = 'ready-for-agent'

/** The label intake moves a bad ticket to. */
export const NEEDS_INFO_LABEL = 'needs-info'
