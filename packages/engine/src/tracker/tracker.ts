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

/** A pull request the engine asks the tracker to open. */
export const PullRequestRequestSchema = z.object({
    /** The run branch. */
    head: z.string().min(1),
    /** The branch it merges into. */
    base: z.string().min(1),
    title: z.string().min(1),
    body: z.string(),
})

export type PullRequestRequest = z.infer<typeof PullRequestRequestSchema>

/** A pull request the tracker opened. */
export const OpenedPullRequestSchema = z.object({
    number: z.number().int().positive(),
    url: z.string(),
})

export type OpenedPullRequest = z.infer<typeof OpenedPullRequestSchema>

/**
 * What the engine needs from an issue tracker. A plain object of async
 * functions, so a real tracker (GitHub via `gh`) and an in-memory one for
 * tests are interchangeable.
 *
 * Later tickets add reading the user's replies; it is left out on purpose
 * until then.
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
    /** Opens a pull request from `head` into `base`. */
    openPullRequest: (args: PullRequestRequest) => Promise<OpenedPullRequest>
}

/** The label a ticket needs before intake lets a run build it. */
export const READY_LABEL = 'ready-for-agent'

/** The label intake moves a bad ticket to. */
export const NEEDS_INFO_LABEL = 'needs-info'
