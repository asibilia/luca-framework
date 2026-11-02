/**
 * The engine's own retry of a routine stuck item (#705): which stucks are
 * routine, whether an item may still be retried by itself, and the comment
 * that says so on the spec issue. Each item (a ticket, the final review,
 * the run) gets one such retry per run, and only while the config's
 * `auto_retry` is on; any other stuck is told to the owner, as before.
 */
import { autoRetryOf } from '../config/engine-config'
import type {
    AgentFailure,
    AutoRetriedItem,
    RunStuckReason,
    StuckReason,
} from '../journal/journal-record'
import type { RunState, TicketProgress } from '../journal/replay'

/**
 * Retry a newly stuck item by itself: post `body` on the spec issue, then
 * journal `auto_retried`. The item's usual retry step comes next.
 */
export type AutoRetryAction = {
    type: 'auto_retry'
    item: AutoRetriedItem
    /** The ticket's number, or `null` for the final review and the run. */
    ticket: number | null
    reason: StuckReason | RunStuckReason
    spec_number: number
    body: string
}

/**
 * How a failed try may have failed for its stuck to be routine: the turn
 * or its output went wrong, or a chore it asked for. A `guard` (it changed
 * what its role may not) or `evidence` failure is for the owner.
 */
const ROUTINE_FAILURES: ReadonlySet<AgentFailure> = new Set([
    'agent',
    'result',
    'chore',
])

/** Whether every failed try behind an `agent_failed` stuck was routine. */
const routineTries = (kinds: AgentFailure[]): boolean =>
    kinds.every((kind) => ROUTINE_FAILURES.has(kind))

/**
 * The spec issue's comment for a retry the engine made by itself (#705).
 *
 * @example
 * autoRetryText({ item: 'ticket', ticket: 12, reason: 'agent_failed' })
 * // "Luca retried #12 by itself after agent_failed. If it gets stuck the same way again, it'll wait for a reply."
 */
export const autoRetryText = ({
    item,
    ticket,
    reason,
}: {
    item: AutoRetriedItem
    ticket: number | null
    reason: string
}): string => {
    const what =
        item === 'ticket'
            ? `#${ticket ?? '?'}`
            : item === 'final_review'
              ? 'the final review'
              : 'the run'
    return `Luca retried ${what} by itself after ${reason}. If it gets stuck the same way again, it'll wait for a reply.`
}

/** Whether the run's config lets the engine retry by itself. */
const turnedOn = (state: RunState): boolean =>
    state.config !== null && autoRetryOf({ config: state.config })

/**
 * Whether a ticket's stuck is routine: `agent_failed` with every failed
 * try of the failing role since its last retry routine, a prepare command
 * that timed out (its own output says so, not the stuck detail), or a
 * failed join or join gates.
 */
const routineTicketStuck = ({
    progress,
}: {
    progress: TicketProgress
}): boolean => {
    switch (progress.stuck?.reason) {
        case 'agent_failed': {
            const role = progress.agent_failure?.role
            return routineTries(
                role === undefined ? [] : (progress.failed_kinds[role] ?? [])
            )
        }
        case 'prepare_failed':
            return progress.prepare?.output.startsWith('Timed out') === true
        case 'join_failed':
        case 'join_gates_failed':
            return true
        default:
            return false
    }
}

/**
 * The engine's own retry of a newly stuck ticket, or `null` when the owner
 * must be told: `auto_retry` is off, the ticket already had its one, or
 * its stuck isn't routine. Pure.
 */
export const ticketAutoRetry = ({
    state,
    ticket,
    progress,
    spec_number,
}: {
    state: RunState
    ticket: number
    progress: TicketProgress
    spec_number: number
}): AutoRetryAction | null => {
    const { stuck } = progress
    if (
        stuck === null ||
        !turnedOn(state) ||
        state.auto_retried.tickets.includes(ticket) ||
        !routineTicketStuck({ progress })
    ) {
        return null
    }
    return {
        type: 'auto_retry',
        item: 'ticket',
        ticket,
        reason: stuck.reason,
        spec_number,
        body: autoRetryText({ item: 'ticket', ticket, reason: stuck.reason }),
    }
}

/**
 * The engine's own retry of the newly stuck final review, or `null`: only
 * an `agent_failed` whose roles' failed tries were all routine, once per
 * run, with `auto_retry` on. Pure.
 */
export const finalAutoRetry = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): AutoRetryAction | null => {
    const { stuck, failed_kinds } = state.final_review
    if (
        stuck?.reason !== 'agent_failed' ||
        !turnedOn(state) ||
        state.auto_retried.final_review ||
        !routineTries(Object.values(failed_kinds).flat())
    ) {
        return null
    }
    return {
        type: 'auto_retry',
        item: 'final_review',
        ticket: null,
        reason: stuck.reason,
        spec_number,
        body: autoRetryText({
            item: 'final_review',
            ticket: null,
            reason: stuck.reason,
        }),
    }
}

/**
 * The engine's own retry of the newly stuck run, or `null`: only a PR that
 * didn't open (`pull_request_failed`), once per run, with `auto_retry` on.
 * A run stuck on its budget or its repo wait always waits for the owner.
 * Pure.
 */
export const runAutoRetry = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): AutoRetryAction | null => {
    const { stuck } = state.run_budget
    if (
        stuck?.reason !== 'pull_request_failed' ||
        !turnedOn(state) ||
        state.auto_retried.run
    ) {
        return null
    }
    return {
        type: 'auto_retry',
        item: 'run',
        ticket: null,
        reason: stuck.reason,
        spec_number,
        body: autoRetryText({
            item: 'run',
            ticket: null,
            reason: stuck.reason,
        }),
    }
}
