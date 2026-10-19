/**
 * The board's reducer: pure functions that turn journal records into board
 * state. The same records in the same order always give the same state, so
 * a replayed journal rebuilds the board exactly.
 *
 * This module applies a record and passes it on by kind; the handlers are in
 * modules by responsibility, each with the record kinds it handles:
 * - `reduce-board-run.ts`: the run's own records (start, intake, snapshot,
 *   run branch, pull request, stop).
 * - `reduce-board-ticket-start.ts`, `reduce-board-ticket-checks.ts` and
 *   `reduce-board-ticket-join.ts`: a ticket from its start, through its
 *   checks, to its way onto the run branch.
 * - `reduce-board-agent-start.ts` and `reduce-board-agents.ts`: an agent's
 *   turn.
 * - `reduce-board-steps.ts`: the steps in flight.
 * - `reduce-board-needs-you.ts`: stuck items, skips, retries and replies.
 * - `reduce-board-final-review.ts`: the final review and its lenses.
 * - `reduce-board-usage.ts`: tokens, plan usage and limit waits.
 * - `reduce-board-counters.ts`: the run-wide counters.
 * - `reduce-board-settle.ts`: what depends on the whole board.
 * The pieces they share are `reduce-board-text.ts` (words),
 * `reduce-board-reasons.ts` (stuck reasons), `reduce-board-update.ts` (small
 * state updates) and `reduce-board-create.ts` (starting shapes).
 */
import type { BoardKind, BoardRecord } from './board-vocabulary'
import { AGENT_KINDS, applyAgentKind } from './reduce-board-agents'
import { COUNTER_KINDS, applyCounterKind } from './reduce-board-counters'
import {
    FINAL_REVIEW_KINDS,
    applyFinalReviewKind,
} from './reduce-board-final-review'
import { NEEDS_YOU_KINDS, applyNeedsYouKind } from './reduce-board-needs-you'
import { RUN_KINDS, applyRunKind } from './reduce-board-run'
import { settle } from './reduce-board-settle'
import { STEP_KINDS, applyStepKind, withoutSteps } from './reduce-board-steps'
import {
    TICKET_CHECKS_KINDS,
    applyTicketChecksKind,
} from './reduce-board-ticket-checks'
import {
    TICKET_JOIN_KINDS,
    applyTicketJoinKind,
} from './reduce-board-ticket-join'
import {
    TICKET_START_KINDS,
    applyTicketStartKind,
} from './reduce-board-ticket-start'
import { USAGE_KINDS, applyUsageKind } from './reduce-board-usage'

import type { BoardState, EngineEnded } from '../shared/board-state'

export { startKind } from './reduce-board-agent-start'
export { createBoardState } from './reduce-board-create'
export {
    RETRY_REFUSED_TEXT,
    finalReasonText,
    reasonText,
    runReasonText,
} from './reduce-board-reasons'
export { unfinishedBlockers } from './reduce-board-settle'
export { stepText } from './reduce-board-steps'
export {
    alreadyDoneText,
    clip,
    countFindings,
    failureText,
    numbersText,
    rebasedText,
    reviewCountsText,
    roleWords,
    shortSha,
    testsSentBackText,
} from './reduce-board-text'
export { LEARNER } from './reduce-board-update'

/** Record kinds that don't mean the engine moved on after a stop. */
const QUIET_KINDS = new Set([
    'run_stopped',
    'agent_session',
    'usage_recorded',
    'jev_asked',
    'jev_answered',
    'jev_failed',
    'decision_model_off',
    'agent_message',
    'agent_message_delivered',
    'shared_git_changed',
    // A step that ends after a stop (the stop's own, or one in flight).
    'step_ended',
])

/**
 * Applies one journal record to the board. Pure: returns a new state.
 *
 * @example
 * const next = applyRecord({ state, record })
 */
export const applyRecord = ({
    state,
    record,
}: {
    state: BoardState
    record: BoardRecord
}): BoardState => {
    const next = applyKind({ state, record })
    // Any real step after a stop means the run was started again.
    const stopped = QUIET_KINDS.has(record.kind) ? next.run.stopped : null
    return settle({
        state: {
            ...next,
            run: { ...next.run, last_time: record.time, stopped },
            event_count: state.event_count + 1,
        },
    })
}

/** Marks the engine as finished, ok or failed: no step runs anymore. */
export const applyEnded = ({
    state,
    ended,
}: {
    state: BoardState
    ended: EngineEnded
}): BoardState =>
    settle({
        state: withoutSteps({
            state: { ...state, run: { ...state.run, engine_ended: ended } },
        }),
    })

/**
 * Whether `record` is one of `kinds`, narrowing it to those kinds. A type
 * guard, so it takes its arguments by position.
 */
const isOneOf = <Kinds extends readonly BoardKind[]>(
    kinds: Kinds,
    record: BoardRecord
): record is Extract<BoardRecord, { kind: Kinds[number] }> =>
    kinds.includes(record.kind)

/**
 * Passes a record to the module that handles its kind. Every kind belongs to
 * one module's `_KINDS`; a kind that belongs to none fails the type check.
 */
const applyKind = ({
    state,
    record,
}: {
    state: BoardState
    record: BoardRecord
}): BoardState => {
    if (isOneOf(RUN_KINDS, record)) return applyRunKind({ state, record })
    if (isOneOf(TICKET_START_KINDS, record)) {
        return applyTicketStartKind({ state, record })
    }
    if (isOneOf(AGENT_KINDS, record)) return applyAgentKind({ state, record })
    if (isOneOf(TICKET_CHECKS_KINDS, record)) {
        return applyTicketChecksKind({ state, record })
    }
    if (isOneOf(TICKET_JOIN_KINDS, record)) {
        return applyTicketJoinKind({ state, record })
    }
    if (isOneOf(NEEDS_YOU_KINDS, record)) {
        return applyNeedsYouKind({ state, record })
    }
    if (isOneOf(STEP_KINDS, record)) return applyStepKind({ state, record })
    if (isOneOf(FINAL_REVIEW_KINDS, record)) {
        return applyFinalReviewKind({ state, record })
    }
    if (isOneOf(USAGE_KINDS, record)) return applyUsageKind({ state, record })
    if (isOneOf(COUNTER_KINDS, record)) {
        return applyCounterKind({ state, record })
    }
    record satisfies never
    return state
}
