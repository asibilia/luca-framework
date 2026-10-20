/**
 * The bottom of the side panel's scrolling part: the run id, the event
 * count and engine state, and the counters (the decision model, memory,
 * agent messages, outside changes to the shared .git). The latest event's
 * age is in the status bar (`status-bar.tsx`). Each stays on one line
 * (`one-line.tsx`); a tap shows it whole in a bubble.
 */
import { View } from 'react-native'

import type { Look } from './board-panel-styles'
import { BubbleScope, CutLine, useBubbles } from './one-line'

import type { BoardState } from '../shared/board-state'

export const RunFooter = ({ state, styles }: { state: BoardState } & Look) => {
    const bubbles = useBubbles()
    const { run, memory } = state
    const line = (text: string) => (
        <CutLine text={text} style={styles.small} styles={styles} />
    )
    const engine = run.engine_ended
        ? run.engine_ended.ok
            ? 'finished'
            : 'stopped'
        : 'running'
    const memoryChanges =
        memory.added + memory.updated + memory.refused + memory.failed > 0
            ? `; ${memory.added} added, ${memory.updated} updated, ${memory.refused} refused, ${memory.failed} failed`
            : ''
    return (
        <>
            <View style={styles.rule} />
            <BubbleScope bubbles={bubbles} styles={styles}>
                {line(
                    `${run.run_id} · ${state.event_count} events · engine ${engine}`
                )}
                {state.jev.asked > 0
                    ? line(
                          `Decision model, in shadow mode: ${state.jev.asked} asked, ${state.jev.answered} answered, ${state.jev.failed} without an answer. The engine doesn't act on them.`
                      )
                    : null}
                {memory.searches > 0 || memory.learner !== 'waiting'
                    ? line(
                          `Memory: ${memory.searches} searches (${memory.search_errors} vault errors), ${memory.shown} shown. Learner: ${memory.learner}${memoryChanges}.`
                      )
                    : null}
                {state.messages.sent + state.messages.refused > 0
                    ? line(
                          `Agent messages: ${state.messages.sent} sent, ${state.messages.delivered} handed over, ${state.messages.refused} refused.`
                      )
                    : null}
                {state.shared_git_changed > 0
                    ? line(
                          `Outside changes to the shared .git: ${state.shared_git_changed}. Other processes made them, not the agents.`
                      )
                    : null}
            </BubbleScope>
        </>
    )
}
