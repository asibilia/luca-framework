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
    /**
     * Adds a label to an issue. Adding a label it already has does nothing. A
     * label the repo lacks is created first, as `labelDefinition` describes
     * it (#500).
     */
    addLabel: (args: { number: number; label: string }) => Promise<void>
    /**
     * Removes a label from an issue. Removing a label the issue or the repo
     * lacks does nothing.
     */
    removeLabel: (args: { number: number; label: string }) => Promise<void>
    /**
     * Closes an issue as completed, such as a ticket whose work was already
     * done (#484). Closing a closed issue does nothing.
     */
    closeIssue: (args: { number: number }) => Promise<void>
    /** Opens a pull request from `head` into `base`. */
    openPullRequest: (args: PullRequestRequest) => Promise<OpenedPullRequest>
    /**
     * The open pull request from branch `head`, or `null`: a redo after a
     * crash adopts the PR its first try opened.
     */
    findOpenPullRequest: (args: {
        head: string
    }) => Promise<OpenedPullRequest | null>
    /** The names of the repo's labels. */
    listLabels: () => Promise<string[]>
    /** Creates a label the repo doesn't have yet. */
    createLabel: (args: {
        name: string
        color: string
        description: string
    }) => Promise<void>
    /**
     * Whether the repo's issues have sub-issues and issue dependencies, which
     * a run reads a spec's tickets and blockers from.
     */
    issueLinks: () => Promise<{ sub_issues: boolean; dependencies: boolean }>
}

/** The label a ticket needs before intake lets a run build it. */
export const READY_LABEL = 'ready-for-agent'

/**
 * The label on a ticket only a person can do (#499), such as renaming the
 * repo or shipping after a hands-on check. Intake leaves it out of the run,
 * with the tickets that wait on it, and never comments on it or relabels
 * it. A ticket with both this and `READY_LABEL` counts as for a person.
 */
export const HUMAN_LABEL = 'ready-for-human'

/**
 * The label that makes a ticket a refactor ticket: it changes how the code is
 * shaped, not what it does, so it skips the test-writer and the red check.
 */
export const REFACTOR_LABEL = 'refactor'

/** The label intake moves a bad ticket to. */
export const NEEDS_INFO_LABEL = 'needs-info'

/** What every label naming a spec's version bump starts with. */
export const RELEASE_LABEL_PREFIX = 'release:'

/**
 * The labels that name a spec's version bump, in a repo with changesets. A
 * spec has one or none (none means patch).
 */
export const RELEASE_LABELS = [
    'release:patch',
    'release:minor',
    'release:major',
    'release:none',
] as const

/**
 * A label as the engine creates it in a repo: `luca setup` does, and so
 * does `addLabel` when the repo lacks it.
 */
export type LabelDefinition = {
    name: string
    /** Six hex digits, without `#`. */
    color: string
    description: string
}

/** The labels a run needs, with what they're for. */
export const RUN_LABELS: LabelDefinition[] = [
    {
        name: READY_LABEL,
        color: '0e8a16',
        description: 'Ready for a Luca run',
    },
    {
        // A run leaves these, and the tickets waiting on them, out (#499).
        name: HUMAN_LABEL,
        color: 'c5def5',
        description: 'Needs a person, not an agent',
    },
    {
        name: REFACTOR_LABEL,
        color: '5319e7',
        description: 'Changes shape, not behavior: no new tests',
    },
    {
        name: NEEDS_INFO_LABEL,
        color: 'd93f0b',
        description: 'Luca needs more detail before it can build this',
    },
]

/** The version-bump labels a repo with changesets gets, one per bump. */
export const RELEASE_LABEL_DEFINITIONS: Record<
    (typeof RELEASE_LABELS)[number],
    LabelDefinition
> = {
    'release:patch': {
        name: 'release:patch',
        color: 'c2e0c6',
        description: "A patch bump for this spec's changeset (the default)",
    },
    'release:minor': {
        name: 'release:minor',
        color: 'fbca04',
        description: "A minor bump for this spec's changeset",
    },
    'release:major': {
        name: 'release:major',
        color: 'b60205',
        description: "A major bump for this spec's changeset",
    },
    'release:none': {
        name: 'release:none',
        color: 'ededed',
        description: 'No version bump: an empty changeset',
    },
}

/**
 * How the engine creates the label `name` in a repo that lacks it: as
 * `luca setup` would, or plain grey with no description for a label Luca
 * doesn't define.
 *
 * @example
 * labelDefinition({ name: 'needs-info' }).color // 'd93f0b'
 * labelDefinition({ name: 'odd' }) // { name: 'odd', color: 'ededed', description: '' }
 */
export const labelDefinition = ({ name }: { name: string }): LabelDefinition =>
    [...RUN_LABELS, ...Object.values(RELEASE_LABEL_DEFINITIONS)].find(
        (label) => label.name === name
    ) ?? { name, color: 'ededed', description: '' }
