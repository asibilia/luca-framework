/**
 * The small state updates every record handler uses: change one ticket card
 * or the final review, add a "tried" line, add or resolve a Needs-you item,
 * and count tests.
 */
import { firstLine } from './reduce-board-text'

import type {
    BoardState,
    FinalReview,
    NeedsYou,
    TicketCard,
} from '../shared/board-state'

/** How many "tried" lines a ticket or the final review keeps. */
const TRIED_KEPT = 6

/** Longest stuck detail kept in state. */
export const DETAIL_MAX = 2000

/** The learner's role (#370): its records have no ticket. */
export const LEARNER = 'learner'

export const withLearner = ({
    state,
    learner,
}: {
    state: BoardState
    learner: BoardState['memory']['learner']
}): BoardState => ({ ...state, memory: { ...state.memory, learner } })

export const withTried = ({
    tried,
    line,
}: {
    tried: string[]
    line: string
}): string[] => [...tried, firstLine({ text: line })].slice(-TRIED_KEPT)

export const updateTicket = ({
    state,
    number,
    update,
}: {
    state: BoardState
    number: number | null
    update: (ticket: TicketCard) => TicketCard
}): BoardState => {
    if (number === null) return state
    return {
        ...state,
        tickets: state.tickets.map((ticket) =>
            ticket.number === number ? update(ticket) : ticket
        ),
    }
}

export const updateFinal = ({
    state,
    update,
}: {
    state: BoardState
    update: (review: FinalReview) => FinalReview
}): BoardState => ({ ...state, final_review: update(state.final_review) })

export const addNeedsYou = ({
    state,
    item,
}: {
    state: BoardState
    item: NeedsYou
}): BoardState => ({
    ...state,
    needs_you: [
        ...state.needs_you.filter((entry) => entry.key !== item.key),
        item,
    ],
})

/**
 * A stuck item the engine hasn't told the owner of yet (#705): it waits in
 * `unreported` until `stuck_reported` (`reportNeedsYou`).
 */
export const addUnreported = ({
    state,
    item,
}: {
    state: BoardState
    item: NeedsYou
}): BoardState => ({
    ...state,
    unreported: [
        ...state.unreported.filter((entry) => entry.key !== item.key),
        item,
    ],
})

/** The engine told the owner: the item `key` waiting to be told needs you now. */
export const reportNeedsYou = ({
    state,
    key,
}: {
    state: BoardState
    key: string
}): BoardState => {
    const item = state.unreported.find((entry) => entry.key === key)
    if (item === undefined) return state
    return addNeedsYou({
        state: {
            ...state,
            unreported: state.unreported.filter((entry) => entry.key !== key),
        },
        item,
    })
}

/** Resolves item `key`, told or not yet told, or every item for `null`. */
export const resolveNeedsYou = ({
    state,
    key,
}: {
    state: BoardState
    key: string | null
}): BoardState => ({
    ...state,
    needs_you:
        key === null
            ? []
            : state.needs_you.filter((entry) => entry.key !== key),
    unreported:
        key === null
            ? []
            : state.unreported.filter((entry) => entry.key !== key),
})

/** The final review with one more "tried" line. */
export const finalTried = ({
    state,
    line,
}: {
    state: BoardState
    line: string
}): BoardState =>
    updateFinal({
        state,
        update: (review) => ({
            ...review,
            tried: withTried({ tried: review.tried, line }),
        }),
    })

export const testCounts = ({
    cases,
}: {
    cases: { status: string }[]
}): { failing: number; total: number } => ({
    failing: cases.filter((entry) => entry.status === 'failed').length,
    total: cases.length,
})
