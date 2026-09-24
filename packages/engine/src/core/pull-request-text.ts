import compact from 'lodash/compact'
import flatMap from 'lodash/flatMap'
import uniq from 'lodash/uniq'

import type { ReplayedSnapshot, TicketProgress } from '../journal/replay'

const SEVERITY_TEXT = {
    blocker: 'blocker',
    should_fix: 'should-fix',
    nit: 'nit',
} as const

const fileText = (file: string | null): string =>
    file === null ? '' : ` (${file})`

/**
 * The run's pull request title and body, from the snapshot and each ticket's
 * progress: which tickets it closes, the assumptions agents made (from every
 * round of every agent on each ticket), the ticket reviews' nits, and the
 * findings declined through "won't fix".
 *
 * @example
 * const { title, body } = pullRequestText({ snapshot, tickets })
 */
export const pullRequestText = ({
    snapshot,
    tickets,
}: {
    snapshot: ReplayedSnapshot
    tickets: Record<number, TicketProgress>
}): { title: string; body: string } => {
    const { spec, ticket_order } = snapshot
    const closes = ticket_order.map(
        (number) =>
            `- Closes #${number}: ${snapshot.tickets[number]?.title ?? ''}`
    )
    const assumptions = flatMap(ticket_order, (number) =>
        uniq(tickets[number]?.assumptions ?? []).map(
            (text) => `- #${number}: ${text}`
        )
    )
    const nits = flatMap(ticket_order, (number) =>
        (tickets[number]?.nits ?? []).map(
            ({ id, title, file }) =>
                `- #${number} ${id}${fileText(file)}: ${title}`
        )
    )
    const declined = flatMap(ticket_order, (number) =>
        (tickets[number]?.declined ?? []).map(
            ({ finding, reason, ruling }) =>
                `- #${number} ${finding.id} (${SEVERITY_TEXT[finding.severity]})${fileText(finding.file)}: ${finding.title}\n` +
                `  Won't fix: ${reason || 'no reason given'}` +
                (ruling === '' ? '' : `\n  Reviewer: ${ruling}`)
        )
    )
    const body = [
        `Built by the Luca engine from spec #${spec.number}.`,
        `## Tickets\n\n${closes.join('\n')}`,
        assumptions.length === 0
            ? ''
            : `## Assumptions\n\nCalls agents made by themselves. Please check them.\n\n${assumptions.join('\n')}`,
        nits.length === 0
            ? ''
            : `## Nits\n\nSmall things the ticket reviews noted but did not send back.\n\n${nits.join('\n')}`,
        declined.length === 0
            ? ''
            : `## Declined findings\n\nFindings a fixer answered "won't fix", and a fresh reviewer let go.\n\n${declined.join('\n')}`,
    ]
    return {
        title: `${spec.title} (#${spec.number})`,
        body: compact(body).join('\n\n'),
    }
}
