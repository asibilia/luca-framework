/**
 * The waits between steps to journal (#559): a ticket the engine holds on
 * purpose, for another ticket's shared baseline tests, the join queue, or
 * the start queue, gets one `ticket_waiting` when its wait starts. Pure.
 */
import type { TicketWait } from './decide-build-tickets'

import type { JournalRecord } from '../journal/journal-record'

/**
 * Whether `wait` is journaled already: its ticket's `ticket_waiting` since
 * its last `step_started` waits for the same thing on the same ticket.
 */
const journaled = ({
    wait,
    records,
}: {
    wait: TicketWait
    records: JournalRecord[]
}): boolean => {
    const latest = records.findLast(
        (record) =>
            record.ticket === wait.ticket &&
            (record.kind === 'step_started' || record.kind === 'ticket_waiting')
    )
    return (
        latest?.kind === 'ticket_waiting' &&
        latest.content.for === wait.for &&
        latest.content.on_ticket === wait.on_ticket
    )
}

/**
 * The build decision's waits (`decideBuildPlan`) that started since the
 * journal last said so, in ticket order.
 *
 * @example
 * startedWaits({ waits, records: journal.read() })
 * // [{ ticket: 12, for: 'baseline', on_ticket: 11 }]
 */
export const startedWaits = ({
    waits,
    records,
}: {
    waits: TicketWait[]
    records: JournalRecord[]
}): TicketWait[] => waits.filter((wait) => !journaled({ wait, records }))
