import compact from 'lodash/compact'
import flatMap from 'lodash/flatMap'
import uniq from 'lodash/uniq'

import type { ReplayedSnapshot, TicketProgress } from '../journal/replay'

/**
 * The run's pull request title and body, from the snapshot and each ticket's
 * progress: which tickets it closes and the assumptions agents made, from
 * every round of every agent on each ticket.
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
    const body = [
        `Built by the Luca engine from spec #${spec.number}.`,
        `## Tickets\n\n${closes.join('\n')}`,
        assumptions.length === 0
            ? ''
            : `## Assumptions\n\nCalls agents made by themselves. Please check them.\n\n${assumptions.join('\n')}`,
    ]
    return {
        title: `${spec.title} (#${spec.number})`,
        body: compact(body).join('\n\n'),
    }
}
