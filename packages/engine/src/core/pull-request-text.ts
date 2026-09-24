import compact from 'lodash/compact'
import flatMap from 'lodash/flatMap'
import uniq from 'lodash/uniq'

import { shippedFindingsSection } from './final-review-text'
import { newMemoriesSection } from './memory-text'
import { reasonLine } from './stuck-text'

import {
    EMPTY_FINAL_REVIEW,
    type FinalReviewState,
    type ReplayedSnapshot,
    type TicketProgress,
} from '../journal/replay'
import type { MemorySave } from '../memory/memory-schemas'

const SEVERITY_TEXT = {
    blocker: 'blocker',
    should_fix: 'should-fix',
    nit: 'nit',
} as const

const fileText = (file: string | null): string =>
    file === null ? '' : ` (${file})`

/**
 * The run's pull request title and body, from the snapshot, each ticket's
 * progress, and the final review: which tickets it closes, the tickets left
 * out (skipped, and why), the assumptions agents made (from every round of
 * every agent on each ticket, and in the final review), the reviews' nits,
 * the findings declined through "won't fix", and the memories the learner
 * added or updated (#370). A final review shipped
 * while stuck puts its open findings at the very top.
 *
 * @example
 * const { title, body } = pullRequestText({ snapshot, tickets, final_review })
 */
export const pullRequestText = ({
    snapshot,
    tickets,
    final_review,
    memory_saves,
}: {
    snapshot: ReplayedSnapshot
    tickets: Record<number, TicketProgress>
    /** Defaults to a final review that never ran. */
    final_review?: FinalReviewState
    /** The learner's saves (#370); the added and updated are listed. */
    memory_saves?: MemorySave[]
}): { title: string; body: string } => {
    const review = final_review ?? EMPTY_FINAL_REVIEW
    const { spec } = snapshot
    const title = (number: number) => snapshot.tickets[number]?.title ?? ''
    const isSkipped = (number: number) =>
        (tickets[number]?.skipped ?? null) !== null
    const ticket_order = snapshot.ticket_order.filter(
        (number) => !isSkipped(number)
    )
    const closes = ticket_order.map(
        (number) => `- Closes #${number}: ${title(number)}`
    )
    const skipped = snapshot.ticket_order.flatMap((number) => {
        const progress = tickets[number]
        if (progress === undefined || progress.skipped === null) return []
        const { because } = progress.skipped
        const why =
            because !== null
                ? `waits on #${because}`
                : `stuck (${progress.stuck === null ? 'no reason recorded' : reasonLine({ reason: progress.stuck.reason })}), skipped by reply`
        return [`- #${number} ${title(number)}: ${why}`]
    })
    const assumptions = flatMap(ticket_order, (number) =>
        uniq(tickets[number]?.assumptions ?? []).map(
            (text) => `- #${number}: ${text}`
        )
    )
    const finalAssumptions = uniq(review.assumptions).map(
        (text) => `- final review: ${text}`
    )
    const nits = [
        ...flatMap(ticket_order, (number) =>
            (tickets[number]?.nits ?? []).map(
                ({ id, title, file }) =>
                    `- #${number} ${id}${fileText(file)}: ${title}`
            )
        ),
        ...review.nits.map(
            ({ lens, id, title, file }) =>
                `- final review, ${lens} lens: ${id}${fileText(file)}: ${title}`
        ),
    ]
    const declinedLine = ({
        where,
        finding,
        reason,
        ruling,
    }: {
        /** What the finding's id follows: its ticket, or its lens. */
        where: string
        finding: {
            id: string
            severity: keyof typeof SEVERITY_TEXT
            file: string | null
            title: string
        }
        reason: string
        ruling: string
    }): string =>
        `- ${where}${finding.id} (${SEVERITY_TEXT[finding.severity]})${fileText(finding.file)}: ${finding.title}\n` +
        `  Won't fix: ${reason || 'no reason given'}` +
        (ruling === '' ? '' : `\n  Reviewer: ${ruling}`)
    const declined = [
        ...flatMap(ticket_order, (number) =>
            (tickets[number]?.declined ?? []).map((entry) =>
                declinedLine({ where: `#${number} `, ...entry })
            )
        ),
        ...review.declined.map((entry) =>
            declinedLine({
                where: `final review, ${entry.lens} lens: `,
                ...entry,
            })
        ),
    ]
    const shipped =
        review.shipped && review.stuck !== null
            ? shippedFindingsSection({
                  findings: review.fix?.findings ?? [],
                  stuck: review.stuck,
              })
            : ''
    const body = [
        shipped,
        `Built by the Luca engine from spec #${spec.number}.`,
        `## Tickets\n\n${closes.join('\n')}`,
        skipped.length === 0
            ? ''
            : `## Skipped tickets\n\nLeft out of this run. They stay open for a later run.\n\n${skipped.join('\n')}`,
        assumptions.length + finalAssumptions.length === 0
            ? ''
            : `## Assumptions\n\nCalls agents made by themselves. Please check them.\n\n${[...assumptions, ...finalAssumptions].join('\n')}`,
        nits.length === 0
            ? ''
            : `## Nits\n\nSmall things the ticket reviews and the final review noted but did not send back.\n\n${nits.join('\n')}`,
        declined.length === 0
            ? ''
            : `## Declined findings\n\nFindings a fixer answered "won't fix", and a fresh reviewer let go.\n\n${declined.join('\n')}`,
        newMemoriesSection({ saves: memory_saves ?? [] }),
    ]
    return {
        title: `${spec.title} (#${spec.number})`,
        body: compact(body).join('\n\n'),
    }
}
