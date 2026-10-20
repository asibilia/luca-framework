/**
 * Records that reach across tickets in replay: a restarted engine's
 * `run_resumed`, a closed or gone session, and the other joins an undo took
 * off the run branch.
 */
import mapValues from 'lodash/mapValues'
import omit from 'lodash/omit'
import omitBy from 'lodash/omitBy'
import uniq from 'lodash/uniq'

import { isFixerRole } from './agent-turn-replay'
import type { JournalRecord } from './journal-record'
import type { RunState } from './run-state'
import { EMPTY_TICKET_PROGRESS } from './ticket-progress'

import { AgentRoleSchema, type AgentRole } from '../agents/role-results'

/** A failed turn's session forgotten, when it is this role's. */
const failureWithoutSession = <
    Failure extends { role: AgentRole; session_id: string | null },
>({
    failure,
    role,
}: {
    failure: Failure | null | undefined
    role: AgentRole
}): Failure | null =>
    failure === null || failure === undefined
        ? null
        : failure.role === role
          ? { ...failure, session_id: null }
          : failure

/**
 * A restarted engine's `run_resumed`: each agent turn a crash cut off is
 * taken again in a fresh session, so its role's session (and a failed
 * turn's session, for a follow-up) is forgotten, on its ticket or in the
 * final review, and the fresh agent is told of the crash. The counts it
 * adds live in `crashes`.
 */
export const resumedAfter = ({
    state,
    record,
}: {
    state: RunState
    record: Extract<JournalRecord, { kind: 'run_resumed' }>
}): RunState =>
    record.content.interrupted.reduce((current, { key, ticket, role }) => {
        const parsed = AgentRoleSchema.safeParse(role)
        if (!parsed.success) return current
        const agent = parsed.data
        if (key === 'final') {
            const review = current.final_review
            const failed = failureWithoutSession({
                failure: review.agent_failures[agent],
                role: agent,
            })
            return {
                ...current,
                final_review: {
                    ...review,
                    sessions: omit(review.sessions, agent),
                    agent_failures:
                        failed === null
                            ? review.agent_failures
                            : { ...review.agent_failures, [agent]: failed },
                    crashed_turn: isFixerRole(agent)
                        ? agent
                        : review.crashed_turn,
                },
            }
        }
        if (ticket === null || key !== String(ticket)) return current
        const progress = current.tickets[ticket] ?? EMPTY_TICKET_PROGRESS
        return {
            ...current,
            tickets: {
                ...current.tickets,
                [ticket]: {
                    ...progress,
                    sessions: omit(progress.sessions, agent),
                    agent_failure: failureWithoutSession({
                        failure: progress.agent_failure,
                        role: agent,
                    }),
                    crashed_turn: agent,
                },
            },
        }
    }, state)

/**
 * A closed session can take no follow-up: it is forgotten wherever the
 * decision step would follow it up (a role's latest session, or a failed
 * turn's), on its ticket, in the final review, or the learner's, so a fix
 * round that would have gone to it goes to a fresh agent.
 */
export const closedSessionAfter = ({
    state,
    session_id,
}: {
    state: RunState
    session_id: string
}): RunState => {
    const forget = <Failure extends { session_id: string | null }>(
        failure: Failure
    ): Failure =>
        failure.session_id === session_id
            ? { ...failure, session_id: null }
            : failure
    const withoutIt = (sessions: Partial<Record<AgentRole, string>>) =>
        omitBy(sessions, (id) => id === session_id)
    const review = state.final_review
    const { learner } = state.memory
    return {
        ...state,
        tickets: mapValues(state.tickets, (progress) => ({
            ...progress,
            sessions: withoutIt(progress.sessions),
            agent_failure:
                progress.agent_failure === null
                    ? null
                    : forget(progress.agent_failure),
        })),
        final_review: {
            ...review,
            sessions: withoutIt(review.sessions),
            agent_failures: mapValues(review.agent_failures, (failure) =>
                failure === undefined ? failure : forget(failure)
            ),
        },
        memory: {
            ...state.memory,
            learner: {
                ...learner,
                agent_failure:
                    learner.agent_failure === null
                        ? null
                        : forget(learner.agent_failure),
            },
        },
    }
}

/**
 * The session a follow-up found gone (#521), or `null`: no agent ran, so the
 * record changes no step and counts no engine failure.
 */
export const goneSessionOf = (record: JournalRecord): string | null =>
    record.kind === 'agent_failed' && record.content.session_gone
        ? record.content.session_id
        : null

/**
 * Closed sessions after a record: one journaled as closed, or found gone by
 * a follow-up (#521), joins them and is forgotten; a later turn's end that
 * names a closed session again (`agent_finished`, `agent_failed`) has it
 * forgotten again, so it is never a follow-up target.
 */
export const closedSessionsAfter = ({
    state,
    record,
}: {
    state: RunState
    record: JournalRecord
}): RunState => {
    const closed =
        record.kind === 'agent_session_closed'
            ? record.content.session_id
            : goneSessionOf(record)
    if (closed !== null) {
        return closedSessionAfter({
            state: {
                ...state,
                closed_sessions: uniq([...state.closed_sessions, closed]),
            },
            session_id: closed,
        })
    }
    if (record.kind !== 'agent_finished' && record.kind !== 'agent_failed') {
        return state
    }
    const { session_id } = record.content
    return session_id !== null && state.closed_sessions.includes(session_id)
        ? closedSessionAfter({ state, session_id })
        : state
}

/**
 * The other tickets whose joins an undo took off the run branch (#519): an
 * undo resets the run branch to before the undone ticket's join, so any
 * join on top of it goes too. Each such ticket's join and join gates are
 * cleared, as its own undo would, so it joins again on the run branch as it
 * is now, and a stuck one is never undone a second time. Its push, stuck,
 * and reply are kept.
 */
export const undoneJoinsAfter = ({
    state,
    ticket,
    shas,
}: {
    state: RunState
    /** The ticket whose join was undone. */
    ticket: number | null
    /** Every commit the undo took off the run branch. */
    shas: string[]
}): RunState => {
    if (shas.length === 0) return state
    return {
        ...state,
        tickets: mapValues(state.tickets, (progress, number) => {
            const { joined } = progress
            const taken =
                Number(number) !== ticket &&
                joined?.ok === true &&
                joined.shas.some((sha) => shas.includes(sha))
            return taken
                ? { ...progress, joined: null, join_gates: null }
                : progress
        }),
    }
}
