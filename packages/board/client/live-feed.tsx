/**
 * The live feed (#634): a folded section at the bottom of the side panel,
 * the run's last actions from its live file, across tickets. Open, it
 * shows one line per action, newest last: the time, the ticket, the role
 * in its model's colour, and the action. The panel keeps whether it is
 * open, so a new read leaves it as it was.
 */
import { Text, View } from 'react-native'

import { clockText, modelColor } from './board-look'
import { Section, StageHeader } from './board-panel-parts'
import type { Look } from './board-panel-styles'
import { callWords } from './live-line'
import { BubbleScope, CutLine, useBubbles } from './one-line'

import type { BoardState, LiveFeedEntry } from '../shared/board-state'

const FeedLine = ({
    entry,
    theme,
    styles,
}: { entry: LiveFeedEntry } & Look) => (
    <View style={styles.line}>
        <Text style={[styles.mono, styles.fixed]} numberOfLines={1}>
            {clockText({ iso: entry.at })}
        </Text>
        {entry.ticket === null ? null : (
            <Text style={[styles.muted, styles.fixed]} numberOfLines={1}>
                #{entry.ticket}
            </Text>
        )}
        <Text
            style={[
                styles.muted,
                styles.fixed,
                { color: modelColor({ model: entry.model ?? '', theme }) },
            ]}
            numberOfLines={1}
        >
            {entry.role}
        </Text>
        <CutLine text={callWords(entry)} style={styles.muted} styles={styles} />
    </View>
)

export const LiveFeed = ({
    state,
    folded,
    onToggle,
    theme,
    styles,
}: {
    state: BoardState
    folded: boolean
    onToggle: () => void
} & Look) => {
    const bubbles = useBubbles()
    const look = { theme, styles }
    return (
        <Section styles={styles}>
            <StageHeader
                title="Live feed"
                hint="the latest actions, newest last"
                icon="Activity"
                count={state.feed.length}
                color={theme.colors.foregroundMuted}
                folded={folded}
                onPress={onToggle}
                {...look}
            />
            {folded || state.feed.length === 0 ? null : (
                <View style={styles.stageBody}>
                    <BubbleScope bubbles={bubbles} styles={styles}>
                        {state.feed.map((entry, index) => (
                            <FeedLine
                                key={`${entry.at}-${index}`}
                                entry={entry}
                                {...look}
                            />
                        ))}
                    </BubbleScope>
                </View>
            )}
        </Section>
    )
}
