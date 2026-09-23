import cloneDeep from 'lodash/cloneDeep'
import uniq from 'lodash/uniq'

import { TrackerIssueSchema, type Tracker, type TrackerIssue } from './tracker'

/** An in-memory tracker, plus what tests need to look inside it. */
export type InMemoryTracker = Tracker & {
    /** Every comment posted on an issue, oldest first. */
    commentsOn: (args: { number: number }) => string[]
    /** An issue's labels right now. */
    labelsOf: (args: { number: number }) => string[]
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
}: {
    issues: TrackerIssue[]
    /** Sub-ticket numbers per spec number. */
    sub_tickets: Record<number, number[]>
}): InMemoryTracker => {
    const store = new Map(
        issues.map((issue) => [issue.number, cloneDeep(issue)])
    )
    const comments = new Map<number, string[]>()

    const find = (number: number): TrackerIssue => {
        const issue = store.get(number)
        if (issue === undefined) throw new Error(`No issue #${number}`)
        return issue
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
        comment: async ({ number, body }) => {
            find(number)
            comments.set(number, [...(comments.get(number) ?? []), body])
        },
        addLabel: async ({ number, label }) =>
            setLabels(number, uniq([...find(number).labels, label])),
        removeLabel: async ({ number, label }) =>
            setLabels(
                number,
                find(number).labels.filter((each) => each !== label)
            ),
        commentsOn: ({ number }) => [...(comments.get(number) ?? [])],
        labelsOf: ({ number }) => [...find(number).labels],
        updateIssue: ({ number, changes }) => {
            store.set(
                number,
                TrackerIssueSchema.parse({ ...find(number), ...changes })
            )
        },
    }
}
