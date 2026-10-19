/**
 * An agent's start on a ticket: what kind of start it is (fresh, a retry, a
 * fix round, a review fix round), the card's stage, step and activity for
 * each role, and the model the agent runs on.
 */
import type { BoardRecord } from './board-vocabulary'
import { reviewCountsText } from './reduce-board-text'
import { updateTicket, withTried } from './reduce-board-update'

import {
    LOOP_CAP,
    type BoardState,
    type TicketCard,
} from '../shared/board-state'

/** The roles that fix a ticket review's findings. */
const REVIEW_FIXERS = new Set(['test-writer', 'implementer'])

/**
 * What an `agent_started` is, from the ticket's card before it:
 * - `retry`: a new try after the role's (or any) turn failed;
 * - `review_fix`: a test-writer (always fresh) or the implementer (a
 *   follow-up, or fresh if its session was lost) sent a ticket review's
 *   findings, in a review fix round;
 * - `fix`: a follow-up answering a failed red check or gates, a new round;
 * - `resent`: the same fix sent again (its turn never ended, such as after
 *   a crash);
 * - `fresh`: anything else.
 */
export const startKind = ({
    card,
    role,
    follow_up_of,
}: {
    card: TicketCard | undefined
    role: string
    follow_up_of: string | null
}): 'retry' | 'review_fix' | 'fix' | 'resent' | 'fresh' => {
    if (card === undefined) return 'fresh'
    if (card.failed_turn !== null) return 'retry'
    if (card.open_check === 'review' && REVIEW_FIXERS.has(role)) {
        return card.role === null ? 'review_fix' : 'resent'
    }
    if (follow_up_of === null || card.open_check === null) return 'fresh'
    return card.role === null ? 'fix' : 'resent'
}

const OPEN_CHECK_TEXT = {
    red_check: 'red check',
    gates: 'checks',
    review: 'ticket review',
} as const

/**
 * A fixer's start in a review fix round. The round is the review's round (a
 * round follows each review that asked for changes); only the round's first
 * fixer adds its "tried" line. The card is fixing, at its step.
 */
const reviewFixStarted = ({
    card,
    role,
}: {
    card: TicketCard
    role: string
}): TicketCard => {
    const round = Math.max(card.review_round, 1)
    const counts = card.findings
        ? reviewCountsText({ findings: card.findings, nits: false })
        : null
    return {
        ...card,
        started: true,
        role,
        stage: 'fixing',
        review_fix_round: round,
        activity: `fixing the review's findings (${round}/${LOOP_CAP})`,
        tried:
            card.review_fix_round < round
                ? withTried({
                      tried: card.tried,
                      line: `Review fix round ${round}/${LOOP_CAP}${counts ? `: ${counts}` : ''}`,
                  })
                : card.tried,
    }
}

/** The card's stage, step and activity once `role` starts on it. */
const startedCard = ({
    card,
    role,
    follow_up_of,
}: {
    card: TicketCard
    role: string
    follow_up_of: string | null
}): TicketCard => {
    const kind = startKind({ card, role, follow_up_of })
    if (
        kind === 'review_fix' ||
        (kind === 'resent' && card.open_check === 'review')
    ) {
        return reviewFixStarted({ card, role })
    }
    const fix_round = kind === 'fix' ? card.fix_round + 1 : card.fix_round
    const started = { ...card, started: true, role, fix_round }
    const tried =
        kind === 'fix' && card.open_check !== null
            ? withTried({
                  tried: card.tried,
                  line: `Fix round ${fix_round}/${LOOP_CAP} after the ${OPEN_CHECK_TEXT[card.open_check]}`,
              })
            : card.tried
    const fixing = kind === 'fix' || kind === 'resent'
    // A writer answering an open check, or fixing on top of the run
    // branch, is fixing; its first pass is building.
    const stage =
        card.open_check !== null || card.stage === 'fixing'
            ? 'fixing'
            : 'building'
    if (role === 'test-writer') {
        // A retried review fixer stays at its step.
        return {
            ...started,
            tried,
            stage,
            step: card.open_check === 'review' ? card.step : 0,
            activity: fixing
                ? `fixing tests (${fix_round}/${LOOP_CAP})`
                : kind === 'retry'
                  ? 'writing tests again'
                  : 'writing tests',
        }
    }
    if (role === 'implementer') {
        return {
            ...started,
            tried,
            stage,
            step: 2,
            activity: fixing
                ? `fixing (${fix_round}/${LOOP_CAP})`
                : kind === 'retry'
                  ? 'coding again'
                  : 'coding',
        }
    }
    if (role === 'ticket-reviewer') {
        const retry = kind === 'retry'
        return {
            ...started,
            stage: 'reviewing',
            step: 4,
            open_check: retry ? card.open_check : null,
            review_round: retry
                ? Math.max(card.review_round, 1)
                : card.review_round + 1,
            activity: retry
                ? 'reviewing again'
                : card.review_fix_round > 0
                  ? 're-reviewing'
                  : 'reviewing',
        }
    }
    return { ...started, activity: role }
}

/**
 * The card's model (#630): the agent's model and why, with its role's
 * waiting `agent_model` answer, which it uses up. No model when the journal
 * names none.
 */
const withModel = ({
    card,
    role,
    model,
    model_reason,
}: {
    card: TicketCard
    role: string
    model: string | null
    model_reason: string | null
}): TicketCard => {
    const answer = card.model_answer?.role === role ? card.model_answer : null
    return {
        ...card,
        model:
            model === null
                ? null
                : { role, name: model, reason: model_reason, answer },
        model_answer: answer === null ? card.model_answer : null,
    }
}

export const agentStarted = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'agent_started' }>
}): BoardState => {
    const { role, follow_up_of, model, model_reason } = record.content
    return updateTicket({
        state,
        number: record.ticket,
        update: (card) =>
            withModel({
                card: startedCard({ card, role, follow_up_of }),
                role,
                model,
                model_reason,
            }),
    })
}
