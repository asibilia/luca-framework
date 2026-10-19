/**
 * The waits between steps to journal (#559): a ticket the engine holds on
 * purpose, for another ticket's shared baseline tests, the join queue, or
 * the start queue, gets one `ticket_waiting` when its wait starts. Pure.
 */
import { haltSteps, installSteps } from './decide-build-early'
import { ticketWaits, type TicketWait } from './decide-build-tickets'
import { buildViewOf } from './decide-build-view'

import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'

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
 * The waits between steps that started since the journal last said so, in
 * ticket order: none before the tickets build, or once the run winds down.
 *
 * @example
 * decideWaits({ records: journal.read() })
 * // [{ ticket: 12, for: 'baseline', on_ticket: 11 }]
 */
export const decideWaits = ({
    records,
}: {
    records: JournalRecord[]
}): TicketWait[] => {
    const state = replayRun({ records })
    const { phase, spec_number, snapshot, run_branch } = state
    if (
        phase !== 'intake_passed' ||
        spec_number === null ||
        snapshot === null ||
        run_branch === null
    ) {
        return []
    }
    const view = buildViewOf({ state, spec_number, snapshot, run_branch })
    if (haltSteps({ state, view }) !== null) return []
    if (installSteps({ state, view, replies: [] }) !== null) return []
    return ticketWaits({ state, view }).filter(
        (wait) => !journaled({ wait, records })
    )
}
