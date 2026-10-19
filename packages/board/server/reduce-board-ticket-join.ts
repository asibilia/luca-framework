/**
 * A ticket's way onto the run branch: joining, being sent back to fix on top
 * of it, being pushed, or being found already done.
 */
import type { BoardRecord } from './board-vocabulary'
import {
    alreadyDoneText,
    rebasedText,
    testsSentBackText,
} from './reduce-board-text'
import { updateTicket, withTried } from './reduce-board-update'

import { ALL_STEPS_DONE, type BoardState } from '../shared/board-state'

/**
 * A ticket sent back onto the run branch is fixed on top of it: its tests
 * first if test files clashed, else its code; then the checks and a fresh
 * review, whose fix rounds count from zero again.
 */
const ticketRebased = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'ticket_rebased' }>
}): BoardState =>
    updateTicket({
        state,
        number: record.ticket,
        update: (card) => ({
            ...card,
            stage: 'fixing',
            step: record.content.tests.length > 0 ? 0 : 2,
            role: null,
            fix_round: 0,
            // The engine starts the ticket's review loop over on top of the
            // run branch: a fresh reviewer, fresh review fix rounds.
            review_fix_round: 0,
            findings: null,
            open_check: null,
            failed_turn: null,
            activity: 'fixing on the run branch',
            tried: withTried({
                tried: card.tried,
                line: rebasedText({ content: record.content }),
            }),
        }),
    })

/** The record kinds of a ticket's way onto the run branch. */
export const TICKET_JOIN_KINDS = [
    'ticket_joined',
    'ticket_rebased',
    'tests_sent_back',
    'run_branch_pushed',
    'ticket_already_done',
    'ticket_closed',
] as const

type TicketJoinRecord = Extract<
    BoardRecord,
    { kind: (typeof TICKET_JOIN_KINDS)[number] }
>

/** Applies one record of TICKET_JOIN_KINDS to the board. */
export const applyTicketJoinKind = ({
    state,
    record,
}: {
    state: BoardState
    record: TicketJoinRecord
}): BoardState => {
    const { ticket } = record
    switch (record.kind) {
        case 'ticket_joined':
            return updateTicket({
                state,
                number: ticket,
                // Joined, it is done once its checks there pass and the run
                // branch is pushed.
                update: (card) =>
                    record.content.ok
                        ? {
                              ...card,
                              stage: 'joining',
                              step: ALL_STEPS_DONE,
                              role: null,
                              activity: 'joined',
                          }
                        : {
                              ...card,
                              activity: 'join failed',
                              tried: withTried({
                                  tried: card.tried,
                                  line: `Joining the run branch failed: ${record.content.error ?? 'no detail'}`,
                              }),
                          },
            })
        case 'ticket_rebased':
            return ticketRebased({ state, record })
        case 'tests_sent_back':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    stage: 'fixing',
                    step: 0,
                    role: null,
                    activity: 'updating tests for the run branch',
                    tried: withTried({
                        tried: card.tried,
                        line: testsSentBackText({ content: record.content }),
                    }),
                }),
            })
        case 'run_branch_pushed':
            return updateTicket({
                state,
                number: ticket,
                update: (card) =>
                    card.stage === 'joining' || card.stage === 'done'
                        ? { ...card, stage: 'done', activity: 'pushed' }
                        : card,
            })
        // Done, not stuck (#484): its work was already on the base branch.
        case 'ticket_already_done':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    stage: 'done',
                    step: ALL_STEPS_DONE,
                    role: null,
                    open_check: null,
                    activity: alreadyDoneText({ shas: record.content.shas }),
                }),
            })
        // Its closing changes nothing the board shows.
        case 'ticket_closed':
            return state
    }
}
