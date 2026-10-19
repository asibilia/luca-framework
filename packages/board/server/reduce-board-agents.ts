/**
 * An agent's turn on a ticket or the final review: its start, how it
 * finished, and how it failed.
 */
import type { BoardRecord } from './board-vocabulary'
import { agentStarted } from './reduce-board-agent-start'
import { countFindings, failureText, roleWords } from './reduce-board-text'
import {
    LEARNER,
    finalTried,
    updateTicket,
    withLearner,
    withTried,
} from './reduce-board-update'

import { ALL_STEPS_DONE, type BoardState } from '../shared/board-state'

const agentFinished = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'agent_finished' }>
}): BoardState => {
    const { role, result } = record.content
    return updateTicket({
        state,
        number: record.ticket,
        update: (card) => {
            const wontFix = result.finding_responses.filter(
                ({ response }) => response === 'wont_fix'
            )
            const done = {
                ...card,
                role: null,
                failed_turn: null,
                tried: wontFix.reduce(
                    (tried, { finding_id, reason }) =>
                        withTried({
                            tried,
                            line: `Won't fix ${finding_id}: ${reason}`,
                        }),
                    card.tried
                ),
            }
            if (role === 'test-writer') {
                if (card.open_check === 'review') {
                    return { ...done, activity: 'test findings answered' }
                }
                if (result.outcome === 'already_done') {
                    return { ...done, activity: 'already done' }
                }
                return result.outcome === 'nothing_new_to_test'
                    ? { ...done, step: 2, activity: 'nothing new to test' }
                    : { ...done, step: 1, activity: 'red check' }
            }
            if (role === 'implementer') {
                return result.outcome === 'bad_test'
                    ? { ...done, activity: 'bad test' }
                    : { ...done, step: 3, activity: 'checks' }
            }
            if (role === 'ticket-reviewer') {
                const findings = result.findings
                    ? countFindings({ findings: result.findings })
                    : card.findings
                const ruled = result.rulings.reduce(
                    (tried, { finding_id, ruling, reason }) =>
                        withTried({
                            tried,
                            line:
                                ruling === 'accepted'
                                    ? `Declined ${finding_id} accepted: ${reason}`
                                    : `${finding_id} still stands: ${reason}`,
                        }),
                    done.tried
                )
                // Approved, it joins the run branch next; else a review fix
                // round follows.
                return result.verdict === 'approve'
                    ? {
                          ...done,
                          stage: 'joining',
                          step: ALL_STEPS_DONE,
                          findings,
                          open_check: null,
                          tried: ruled,
                          activity: 'approved',
                      }
                    : {
                          ...done,
                          stage: 'fixing',
                          findings,
                          open_check: 'review',
                          tried: ruled,
                          activity: 'changes requested',
                      }
            }
            return done
        },
    })
}

/** The record kinds of an agent's turn. */
export const AGENT_KINDS = [
    'agent_started',
    'agent_finished',
    'agent_failed',
] as const

type AgentRecord = Extract<BoardRecord, { kind: (typeof AGENT_KINDS)[number] }>

/** Applies one record of AGENT_KINDS to the board. */
export const applyAgentKind = ({
    state,
    record,
}: {
    state: BoardState
    record: AgentRecord
}): BoardState => {
    const { ticket } = record
    switch (record.kind) {
        case 'agent_started':
            // The learner (#370) has no ticket and is no final review agent.
            if (record.content.role === LEARNER) {
                return withLearner({ state, learner: 'learning' })
            }
            return agentStarted({ state, record })
        case 'agent_finished':
            if (record.content.role === LEARNER) {
                return withLearner({ state, learner: 'learned' })
            }
            return agentFinished({ state, record })
        case 'agent_failed': {
            const { role, error, failure } = record.content
            // A failed learner gets a fresh one; its row says so.
            if (role === LEARNER) return state
            // A final review agent (a lens or a fixer) has no ticket.
            if (ticket === null) {
                return finalTried({
                    state,
                    line: `The ${roleWords({ role })} ${failureText({ failure })}: ${error}`,
                })
            }
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    role: null,
                    failed_turn: role,
                    activity: `${role} ${failure === 'engine' ? 'could not run' : 'failed'}`,
                    tried: withTried({
                        tried: card.tried,
                        line: `The ${role} ${failureText({ failure })}: ${error}`,
                    }),
                }),
            })
        }
    }
}
