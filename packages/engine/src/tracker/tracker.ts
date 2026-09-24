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
    /** Who opened the issue: for a spec, its owner, whose replies count. */
    author: z.string().default(''),
})

export type TrackerIssue = z.infer<typeof TrackerIssueSchema>

/** One comment on an issue. Ids grow with time, as on GitHub. */
export const TrackerCommentSchema = z.object({
    id: z.number().int(),
    author: z.string(),
    body: z.string(),
})

export type TrackerComment = z.infer<typeof TrackerCommentSchema>

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
 */
export type Tracker = {
    /** Reads the spec issue. Throws if it does not exist. */
    readSpec: (args: { spec_number: number }) => Promise<TrackerIssue>
    /** Lists every sub-ticket of the spec, open and closed. */
    listSubTickets: (args: { spec_number: number }) => Promise<TrackerIssue[]>
    /** Reads any issue, such as a blocker outside the spec. `null` if missing. */
    readIssue: (args: { number: number }) => Promise<TrackerIssue | null>
    /** Posts a comment on an issue, and returns the new comment's id. */
    comment: (args: { number: number; body: string }) => Promise<{ id: number }>
    /** An issue's comments with an id above `since_id`, oldest first. */
    listComments: (args: {
        number: number
        since_id: number
    }) => Promise<TrackerComment[]>
    /** Adds a label to an issue. Adding a label it already has does nothing. */
    addLabel: (args: { number: number; label: string }) => Promise<void>
    /** Removes a label from an issue. Removing a missing label does nothing. */
    removeLabel: (args: { number: number; label: string }) => Promise<void>
    /** Opens a pull request from `head` into `base`. */
    openPullRequest: (args: PullRequestRequest) => Promise<OpenedPullRequest>
}

/** The label a ticket needs before intake lets a run build it. */
export const READY_LABEL = 'ready-for-agent'

/**
 * The label that makes a ticket a refactor ticket: it changes how the code is
 * shaped, not what it does, so it skips the test-writer and the red check.
 */
export const REFACTOR_LABEL = 'refactor'

/** The label intake moves a bad ticket to. */
export const NEEDS_INFO_LABEL = 'needs-info'
