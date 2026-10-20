/**
 * What needs a person: a stuck ticket or run, a skipped or retried ticket,
 * and the replies that resolve them.
 */
import type { BoardRecord } from './board-vocabulary'
import {
    RETRY_REFUSED_TEXT,
    reasonText,
    runReasonText,
} from './reduce-board-reasons'
import { clip } from './reduce-board-text'
import {
    DETAIL_MAX,
    addNeedsYou,
    resolveNeedsYou,
    updateFinal,
    updateTicket,
    withTried,
} from './reduce-board-update'

import type { BoardState } from '../shared/board-state'
import {
    FINAL_KEY,
    RUN_KEY,
    allowedReplies,
    ticketKey,
} from '../shared/reply-actions'

const skipTicket = ({
    state,
    ticket,
    because,
}: {
    state: BoardState
    ticket: number | null
    because: number | null
}): BoardState => {
    if (ticket === null) return state
    return resolveNeedsYou({
        state: updateTicket({
            state,
            number: ticket,
            update: (card) => ({
                ...card,
                stage: 'skipped',
                role: null,
                activity:
                    because === null
                        ? 'skipped'
                        : `skipped: waits on skipped #${because}`,
            }),
        }),
        key: ticketKey({ ticket }),
    })
}

/**
 * How the engine took a `retry`: `resume` changes nothing more than the
 * reply did; `restart` builds the edited ticket from scratch (its new
 * snapshot came just before); `refused` leaves it stuck, back in Needs you.
 */
const ticketRetried = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'ticket_retried' }>
}): BoardState => {
    const { ticket } = record
    if (ticket === null) return state
    switch (record.content.mode) {
        case 'resume':
            return state
        case 'restart':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    stage: 'building',
                    step: 0,
                    role: null,
                    fix_round: 0,
                    review_fix_round: 0,
                    findings: null,
                    open_check: null,
                    failed_turn: null,
                    activity: 'starting over from the edited ticket',
                    tried: withTried({
                        tried: card.tried,
                        line: 'Started over from the edited ticket',
                    }),
                }),
            })
        case 'refused': {
            const card = state.tickets.find((entry) => entry.number === ticket)
            return addNeedsYou({
                state: updateTicket({
                    state,
                    number: ticket,
                    update: (entry) => ({
                        ...entry,
                        stage: 'stuck',
                        role: null,
                        activity: 'stuck',
                    }),
                }),
                item: {
                    key: ticketKey({ ticket }),
                    ticket,
                    subject: `Retry of #${ticket} was refused${card ? `: ${card.title}` : ''}`,
                    reason: RETRY_REFUSED_TEXT,
                    detail: clip({
                        text: record.content.problems.join(' '),
                        max: DETAIL_MAX,
                    }),
                    tried: card?.tried ?? [],
                    replies: allowedReplies({
                        key: ticketKey({ ticket }),
                        ticket,
                    }),
                    since: record.time,
                },
            })
        }
    }
}

const replyReceived = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'reply_received' }>
}): BoardState => {
    const { word } = record.content
    const ticket = record.content.ticket ?? record.ticket
    switch (word) {
        case 'retry':
            if (ticket !== null) {
                return resolveNeedsYou({
                    state: updateTicket({
                        state,
                        number: ticket,
                        update: (card) => ({
                            ...card,
                            stage: 'building',
                            activity: 'retrying',
                        }),
                    }),
                    key: ticketKey({ ticket }),
                })
            }
            // A bare `retry` while the run is stuck on its budget adds its
            // top-up (one whole budget for a retry journaled with none,
            // #543); stuck for another reason, no budget. The final review
            // is left as it is.
            if (state.needs_you.some((item) => item.key === RUN_KEY)) {
                const top_up =
                    state.run_stuck_reason === 'run_budget'
                        ? (record.content.top_up ?? state.run_budget_each)
                        : 0
                return resolveNeedsYou({
                    state: {
                        ...state,
                        run_budget_tokens: state.run_budget_tokens + top_up,
                        run_stuck_reason: null,
                    },
                    key: RUN_KEY,
                })
            }
            return resolveNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({ ...review, state: 'reviewing' }),
                }),
                key: FINAL_KEY,
            })
        case 'skip':
            return skipTicket({ state, ticket, because: null })
        case 'ship':
            return resolveNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({ ...review, state: 'passed' }),
                }),
                key: FINAL_KEY,
            })
        case 'stop':
            return resolveNeedsYou({ state, key: null })
    }
}

/** The record kinds of what needs a person. */
export const NEEDS_YOU_KINDS = [
    'ticket_stuck',
    'run_stuck',
    'reply_received',
    'ticket_skipped',
    'ticket_retried',
    'reply_ignored',
] as const

type NeedsYouRecord = Extract<
    BoardRecord,
    { kind: (typeof NEEDS_YOU_KINDS)[number] }
>

/** Applies one record of NEEDS_YOU_KINDS to the board. */
export const applyNeedsYouKind = ({
    state,
    record,
}: {
    state: BoardState
    record: NeedsYouRecord
}): BoardState => {
    const { ticket } = record
    switch (record.kind) {
        case 'ticket_stuck': {
            if (ticket === null) return state
            const card = state.tickets.find((entry) => entry.number === ticket)
            const stuck = updateTicket({
                state,
                number: ticket,
                update: (entry) => ({
                    ...entry,
                    stage: 'stuck',
                    role: null,
                    activity: 'stuck',
                }),
            })
            return addNeedsYou({
                state: stuck,
                item: {
                    key: ticketKey({ ticket }),
                    ticket,
                    subject: `Ticket #${ticket} is stuck${card ? `: ${card.title}` : ''}`,
                    reason: reasonText({ reason: record.content.reason }),
                    detail: clip({
                        text: record.content.detail,
                        max: DETAIL_MAX,
                    }),
                    tried: card?.tried ?? [],
                    replies: allowedReplies({
                        key: ticketKey({ ticket }),
                        ticket,
                    }),
                    since: record.time,
                },
            })
        }
        case 'run_stuck':
            return addNeedsYou({
                state: { ...state, run_stuck_reason: record.content.reason },
                item: {
                    key: RUN_KEY,
                    ticket: null,
                    subject: 'The run is stuck',
                    reason: runReasonText({ reason: record.content.reason }),
                    detail: clip({
                        text: record.content.detail,
                        max: DETAIL_MAX,
                    }),
                    tried: [],
                    replies: allowedReplies({ key: RUN_KEY, ticket: null }),
                    since: record.time,
                },
            })
        case 'reply_received':
            return replyReceived({ state, record })
        case 'ticket_skipped':
            return skipTicket({
                state,
                ticket,
                because: record.content.because,
            })
        case 'ticket_retried':
            return ticketRetried({ state, record })
        // An ignored reply is only a chat row; the engine answered it.
        case 'reply_ignored':
            return state
    }
}
