/**
 * The bottom of the side panel: the run id, the event count and engine
 * state, the latest thing that happened, and the counters (the decision
 * model, memory, agent messages, outside changes to the shared .git).
 */
import { Text, View } from 'react-native'

import type { Styles } from './board-panel-styles'

import type { BoardState } from '../shared/board-state'

export const RunFooter = ({
    state,
    styles,
}: {
    state: BoardState
    styles: Styles
}) => {
    const { run } = state
    return (
        <>
            <View style={styles.rule} />
            <Text style={styles.small}>
                {run.run_id} · {state.event_count} events · engine{' '}
                {run.engine_ended
                    ? run.engine_ended.ok
                        ? 'finished'
                        : 'stopped'
                    : 'running'}
            </Text>
            {state.latest ? (
                <Text style={styles.small} numberOfLines={2}>
                    latest: {state.latest}
                </Text>
            ) : null}
            {state.jev.asked > 0 ? (
                <Text style={styles.small}>
                    Decision model, in shadow mode: {state.jev.asked} asked,{' '}
                    {state.jev.answered} answered, {state.jev.failed} without an
                    answer. The engine doesn't act on them.
                </Text>
            ) : null}
            {state.memory.searches > 0 || state.memory.learner !== 'waiting' ? (
                <Text style={styles.small}>
                    Memory: {state.memory.searches} searches (
                    {state.memory.search_errors} vault errors),{' '}
                    {state.memory.shown} shown. Learner: {state.memory.learner}
                    {state.memory.added +
                        state.memory.updated +
                        state.memory.refused +
                        state.memory.failed >
                    0
                        ? `; ${state.memory.added} added, ${state.memory.updated} updated, ${state.memory.refused} refused, ${state.memory.failed} failed`
                        : ''}
                    .
                </Text>
            ) : null}
            {state.messages.sent + state.messages.refused > 0 ? (
                <Text style={styles.small}>
                    Agent messages: {state.messages.sent} sent,{' '}
                    {state.messages.delivered} handed over,{' '}
                    {state.messages.refused} refused.
                </Text>
            ) : null}
            {state.shared_git_changed > 0 ? (
                <Text style={styles.small}>
                    Outside changes to the shared .git:{' '}
                    {state.shared_git_changed}. Other processes made them, not
                    the agents.
                </Text>
            ) : null}
        </>
    )
}
