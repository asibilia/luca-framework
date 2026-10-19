/**
 * What depends on the whole board: which unstarted tickets are blocked,
 * whether the final review is active, and the run's status.
 */
import type {
    BoardState,
    RunStatus,
    TicketCard,
    TicketStage,
} from '../shared/board-state'
import { RUN_KEY } from '../shared/reply-actions'

/** A ticket's blockers inside this run that aren't done yet. */
export const unfinishedBlockers = ({
    state,
    ticket,
}: {
    state: BoardState
    ticket: TicketCard
}): number[] =>
    ticket.blockers.filter((number) => {
        const blocker = state.tickets.find((card) => card.number === number)
        return blocker !== undefined && blocker.stage !== 'done'
    })

/** The stages of a ticket the engine is working on. */
const ACTIVE_STAGES = new Set<TicketStage>([
    'building',
    'reviewing',
    'testing',
    'fixing',
    'joining',
])

const isActive = ({ state }: { state: BoardState }): boolean =>
    state.tickets.some(
        (ticket) => ticket.started && ACTIVE_STAGES.has(ticket.stage)
    ) ||
    state.final_review.state === 'reviewing' ||
    state.final_review.state === 'fixing'

const runStatus = ({ state }: { state: BoardState }): RunStatus => {
    const { phase, engine_ended, stopped } = state.run
    if (phase === 'done' || phase === 'refused' || phase === 'nothing_to_do')
        return phase
    if (stopped) return 'stopped'
    if (engine_ended && !engine_ended.ok) return 'ended_with_error'
    if (state.limit_wait) return 'limit_wait'
    if (state.usage_line_wait) return 'usage_line_wait'
    // Nothing new starts while the run is stuck on its budget.
    if (state.needs_you.some((item) => item.key === RUN_KEY)) return 'stuck'
    if (state.needs_you.length > 0 && !isActive({ state })) return 'stuck'
    return phase
}

/**
 * Recomputes what depends on the whole board: which unstarted tickets are
 * blocked, whether the final review is active, and the run's status.
 */
export const settle = ({ state }: { state: BoardState }): BoardState => {
    const tickets = state.tickets.map((ticket): TicketCard => {
        if (ticket.started) return ticket
        if (ticket.stage !== 'blocked' && ticket.stage !== 'building')
            return ticket
        const waiting = unfinishedBlockers({ state, ticket })
        return waiting.length > 0
            ? {
                  ...ticket,
                  stage: 'blocked',
                  activity: `waits on ${waiting.map((number) => `#${number}`).join(', ')}`,
              }
            : { ...ticket, stage: 'building', activity: 'queued' }
    })
    const settledTickets = { ...state, tickets }
    const active =
        tickets.length > 0 &&
        tickets.every(
            (ticket) => ticket.stage === 'done' || ticket.stage === 'skipped'
        )
    const withReview = {
        ...settledTickets,
        final_review: { ...state.final_review, active },
    }
    return {
        ...withReview,
        run: { ...withReview.run, status: runStatus({ state: withReview }) },
    }
}
