import cloneDeep from 'lodash/cloneDeep'
import uniq from 'lodash/uniq'

import {
    TrackerIssueSchema,
    type OpenedPullRequest,
    type PullRequestRequest,
    type Tracker,
    type TrackerComment,
    type TrackerIssue,
} from './tracker'

/** A pull request the in-memory tracker opened. */
export type InMemoryPullRequest = PullRequestRequest & OpenedPullRequest

/** An in-memory tracker, plus what tests need to look inside it. */
export type InMemoryTracker = Tracker & {
    /** Every comment's body on an issue, oldest first. */
    commentsOn: (args: { number: number }) => string[]
    /** A person comments on an issue, as on the tracker; returns the comment's id. */
    addComment: (args: {
        number: number
        author: string
        body: string
    }) => number
    /** An issue's labels right now. */
    labelsOf: (args: { number: number }) => string[]
    /** Every pull request opened, oldest first. */
    pullRequests: () => InMemoryPullRequest[]
    /** Changes an issue, as a person editing it on the tracker would. */
    updateIssue: (args: {
        number: number
        changes: Partial<Omit<TrackerIssue, 'number'>>
    }) => void
}

/**
 * A tracker held in memory, for tests. Issues are copied in and out, so
 * nothing the engine keeps changes when an issue is edited later.
 *
 * @example
 * const tracker = createInMemoryTracker({
 *     issues: [spec, ticket],
 *     sub_tickets: { [spec.number]: [ticket.number] },
 * })
 */
export const createInMemoryTracker = ({
    issues,
    sub_tickets,
    engine_login,
    repo_labels = [],
    issue_links = { sub_issues: true, dependencies: true },
}: {
    issues: TrackerIssue[]
    /** Sub-ticket numbers per spec number. */
    sub_tickets: Record<number, number[]>
    /** Who the engine's own comments are from. Defaults to `luca-engine`. */
    engine_login?: string
    /** The names of the labels the repo has. Defaults to none. */
    repo_labels?: string[]
    /** Whether the repo has sub-issues and dependencies. Defaults to both. */
    issue_links?: { sub_issues: boolean; dependencies: boolean }
}): InMemoryTracker => {
    const store = new Map(
        issues.map((issue) => [issue.number, cloneDeep(issue)])
    )
    const labels = [...repo_labels]
    const comments = new Map<number, TrackerComment[]>()
    let lastCommentId = 0
    const pulls: InMemoryPullRequest[] = []

    const find = (number: number): TrackerIssue => {
        const issue = store.get(number)
        if (issue === undefined) throw new Error(`No issue #${number}`)
        return issue
    }

    const post = ({
        number,
        author,
        body,
    }: {
        number: number
        author: string
        body: string
    }): number => {
        find(number)
        lastCommentId += 1
        const comment = { id: lastCommentId, author, body }
        comments.set(number, [...(comments.get(number) ?? []), comment])
        return comment.id
    }

    const setLabels = (number: number, labels: string[]) => {
        store.set(number, { ...find(number), labels })
    }

    return {
        readSpec: async ({ spec_number }) => cloneDeep(find(spec_number)),
        listSubTickets: async ({ spec_number }) =>
            (sub_tickets[spec_number] ?? []).map((number) =>
                cloneDeep(find(number))
            ),
        readIssue: async ({ number }) => cloneDeep(store.get(number) ?? null),
        comment: async ({ number, body }) => ({
            id: post({ number, author: engine_login ?? 'luca-engine', body }),
        }),
        listComments: async ({ number, since_id }) =>
            cloneDeep(
                (comments.get(number) ?? []).filter(({ id }) => id > since_id)
            ),
        addComment: (args) => post(args),
        addLabel: async ({ number, label }) =>
            setLabels(number, uniq([...find(number).labels, label])),
        removeLabel: async ({ number, label }) =>
            setLabels(
                number,
                find(number).labels.filter((each) => each !== label)
            ),
        openPullRequest: async (request) => {
            // Pull requests share numbers with issues, as on GitHub.
            const number =
                Math.max(
                    0,
                    ...store.keys(),
                    ...pulls.map((pull) => pull.number)
                ) + 1
            const pull = {
                ...cloneDeep(request),
                number,
                url: `https://tracker.invalid/pull/${number}`,
            }
            pulls.push(pull)
            return { number, url: pull.url }
        },
        findOpenPullRequest: async ({ head }) => {
            const pull = pulls.find((each) => each.head === head)
            return pull === undefined
                ? null
                : { number: pull.number, url: pull.url }
        },
        listLabels: async () => [...labels],
        createLabel: async ({ name }) => {
            if (labels.includes(name)) {
                throw new Error(`The label ${name} already exists`)
            }
            labels.push(name)
        },
        issueLinks: async () => ({ ...issue_links }),
        pullRequests: () => cloneDeep(pulls),
        commentsOn: ({ number }) =>
            (comments.get(number) ?? []).map(({ body }) => body),
        labelsOf: ({ number }) => [...find(number).labels],
        updateIssue: ({ number, changes }) => {
            store.set(
                number,
                TrackerIssueSchema.parse({ ...find(number), ...changes })
            )
        },
    }
}
