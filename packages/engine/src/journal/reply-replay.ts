/**
 * The owner's replies and the engine's stuck reports in replay: a reply
 * taken for the run, the final review, or a ticket; a report for the stuck
 * run, the final review, or a ticket; and a ticket's `retry`.
 */
import omit from 'lodash/omit'

import type { JournalRecord } from './journal-record'
import { engineCommentsAfter, type RunState } from './run-state'
import { applyTicketRecord } from './ticket-replay'

/**
 * An owner's reply: `stop` ends the run, a bare `retry` or `ship` is the
 * stuck run's or the final review's, and the rest go to its ticket.
 */
export const replyReceivedAfter = ({
    state,
    next,
    record,
}: {
    /** The state before the record. */
    state: RunState
    /** The state with the record's seq and crash counts. */
    next: RunState
    record: Extract<JournalRecord, { kind: 'reply_received' }>
}): RunState => {
    const handled = {
        ...next,
        handled_comments: [
            ...state.handled_comments,
            record.content.comment_id,
        ],
    }
    const { word, comment_id, ticket } = record.content
    if (word === 'stop') return { ...handled, stop: { comment_id } }
    // A bare `retry` while the run is stuck on its budget adds one
    // more full budget, and the run carries on; stuck on its PR,
    // the PR is tried again.
    const { stuck } = state.run_budget
    if (ticket === null && word === 'retry' && stuck !== null) {
        return {
            ...handled,
            run_budget: {
                stuck: null,
                report: null,
                retries:
                    state.run_budget.retries +
                    (stuck.reason === 'run_budget' ? 1 : 0),
            },
        }
    }
    if (ticket === null && (word === 'retry' || word === 'ship')) {
        return { ...handled, final_reply: { word, comment_id } }
    }
    return applyTicketRecord({ state: handled, record })
}

/** A stuck report the engine posted, for the run, the final review, or a ticket. */
export const stuckReportedAfter = ({
    state,
    next,
    record,
}: {
    state: RunState
    next: RunState
    record: Extract<JournalRecord, { kind: 'stuck_reported' }>
}): RunState => {
    const reported = {
        ...next,
        engine_comments: engineCommentsAfter({
            state,
            comment_id: record.content.comment_id,
        }),
    }
    // A report with no ticket is the stuck run's, while it is not
    // told yet, else the final review's.
    const { run_budget } = state
    if (
        record.ticket === null &&
        run_budget.stuck !== null &&
        run_budget.report === null
    ) {
        return {
            ...reported,
            run_budget: {
                ...run_budget,
                report: { comment_id: record.content.comment_id },
            },
        }
    }
    return record.ticket === null
        ? {
              ...reported,
              final_stuck_report: {
                  comment_id: record.content.comment_id,
              },
          }
        : applyTicketRecord({ state: reported, record })
}

/** A ticket's `retry`, with the run-wide parts it resets. */
export const ticketRetriedAfter = ({
    state,
    next,
    record,
}: {
    state: RunState
    next: RunState
    record: Extract<JournalRecord, { kind: 'ticket_retried' }>
}): RunState => {
    const { answer_id, mode } = record.content
    const install = state.run_branch_install?.check
    // A run branch whose install failed is installed again on a retry.
    const run_branch_install =
        mode === 'refused' || install === undefined || install?.ok !== false
            ? state.run_branch_install
            : null
    return applyTicketRecord({
        state: {
            ...next,
            // A retry gives the ticket fresh crash counts too.
            crashes:
                record.ticket === null
                    ? next.crashes
                    : omit(next.crashes, String(record.ticket)),
            run_branch_install,
            engine_comments: engineCommentsAfter({
                state,
                comment_id: answer_id,
            }),
        },
        record,
    })
}
