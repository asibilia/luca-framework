/**
 * The run-wide counters: Jev's questions, agent messages, changes to the
 * shared git folder, and what the memory searched, saved and learned.
 */
import type { BoardRecord } from './board-vocabulary'
import { withLearner } from './reduce-board-update'

import type { BoardState } from '../shared/board-state'

/** The record kinds of the run-wide counters. */
export const COUNTER_KINDS = [
    'jev_asked',
    'jev_answered',
    'jev_failed',
    'decision_model_off',
    'agent_message',
    'agent_message_delivered',
    'shared_git_changed',
    'memory_recalled',
    'memories_saved',
    'learning_skipped',
    'memories_reported',
] as const

type CounterRecord = Extract<
    BoardRecord,
    { kind: (typeof COUNTER_KINDS)[number] }
>

/** Applies one record of COUNTER_KINDS to the board. */
export const applyCounterKind = ({
    state,
    record,
}: {
    state: BoardState
    record: CounterRecord
}): BoardState => {
    switch (record.kind) {
        case 'jev_asked':
            return {
                ...state,
                jev: { ...state.jev, asked: state.jev.asked + 1 },
            }
        case 'jev_answered':
            return {
                ...state,
                jev: { ...state.jev, answered: state.jev.answered + 1 },
            }
        case 'jev_failed':
            return {
                ...state,
                jev: { ...state.jev, failed: state.jev.failed + 1 },
            }
        // The decision model turning off is only a chat line (#534).
        case 'decision_model_off':
            return state
        case 'agent_message': {
            const refused = record.content.status === 'refused'
            return {
                ...state,
                messages: {
                    ...state.messages,
                    sent: state.messages.sent + (refused ? 0 : 1),
                    refused: state.messages.refused + (refused ? 1 : 0),
                },
            }
        }
        case 'agent_message_delivered':
            return {
                ...state,
                messages: {
                    ...state.messages,
                    delivered:
                        state.messages.delivered + record.content.ids.length,
                },
            }
        // Another process's change to the shared `.git`: only counted.
        case 'shared_git_changed':
            return {
                ...state,
                shared_git_changed: state.shared_git_changed + 1,
            }
        case 'memory_recalled': {
            const { vaults, memories } = record.content
            const { memory } = state
            return {
                ...state,
                memory: {
                    ...memory,
                    searches: memory.searches + 1,
                    search_errors:
                        memory.search_errors +
                        vaults.filter(({ ok }) => !ok).length,
                    shown: memory.shown + memories.length,
                },
            }
        }
        case 'memories_saved': {
            const count = (outcome: string) =>
                record.content.saves.filter((save) => save.outcome === outcome)
                    .length
            const { memory } = state
            return {
                ...state,
                memory: {
                    ...memory,
                    added: memory.added + count('added'),
                    updated: memory.updated + count('updated'),
                    refused: memory.refused + count('refused'),
                    failed: memory.failed + count('failed'),
                },
            }
        }
        case 'learning_skipped':
            return withLearner({ state, learner: 'skipped' })
        // The listing on the spec issue is only a chat row.
        case 'memories_reported':
            return state
    }
}
