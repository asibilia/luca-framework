/**
 * "Needs you": the stuck work waiting for a reply on the spec issue, each as
 * a card with its reason, detail, what was tried and its reply buttons, and
 * what came of the replies the board already posted.
 */
import { Icon } from '@getpaseo/plugin/client/react-native'
import { Text, View } from 'react-native'

import { Section, StageHeader } from './board-panel-parts'
import type { Look } from './board-panel-styles'
import { StuckActions } from './stuck-actions'

import type { BoardState, NeedsYou } from '../shared/board-state'
import { postedText, type PostedReply } from '../shared/reply-actions'

const NeedsYouCard = ({
    item,
    run_id,
    spec_number,
    posted,
    chat_agent_id,
    theme,
    styles,
}: {
    item: NeedsYou
    run_id: string
    spec_number: number | null
    posted: PostedReply[]
    chat_agent_id: string | null
} & Look) => (
    <View style={[styles.card, styles.cardStuck]}>
        <View style={styles.cardTop}>
            <Icon
                name="OctagonAlert"
                size={14}
                color={theme.colors.statusDanger}
            />
            <Text
                style={[styles.cardTitle, { color: theme.colors.statusDanger }]}
            >
                {item.subject}
            </Text>
        </View>
        <Text style={styles.text}>{item.reason}</Text>
        {item.detail ? (
            <Text style={styles.muted} numberOfLines={8} selectable>
                {item.detail}
            </Text>
        ) : null}
        {item.tried.length > 0 ? (
            <>
                <Text style={styles.label}>Tried</Text>
                {item.tried.map((line, index) => (
                    <Text key={`${index}-${line}`} style={styles.muted}>
                        {index + 1}. {line}
                    </Text>
                ))}
            </>
        ) : null}
        <StuckActions
            run_id={run_id}
            item={item}
            spec_number={spec_number}
            posted={posted}
            chat_agent_id={chat_agent_id}
            theme={theme}
        />
    </View>
)

export const NeedsYouSection = ({
    state,
    posted,
    chat_agent_id,
    theme,
    styles,
}: {
    state: BoardState
    posted: PostedReply[]
    chat_agent_id: string | null
} & Look) => {
    const { run } = state
    const look = { theme, styles }
    // Replies the board posted whose stuck item is gone: say what came of them.
    const answered = posted.filter(
        (entry) =>
            !state.needs_you.some(
                (item) => item.key === entry.key && item.since === entry.since
            )
    )

    return (
        <Section styles={styles}>
            <StageHeader
                title="Needs you"
                hint="stuck work waiting for your reply on the spec issue"
                icon="OctagonAlert"
                count={state.needs_you.length}
                color={theme.colors.statusDanger}
                folded={null}
                onPress={null}
                {...look}
            />
            {state.needs_you.length > 0 ? (
                <View style={styles.stageBody}>
                    {state.needs_you.map((item) => (
                        <NeedsYouCard
                            key={`${item.key}-${item.since}`}
                            item={item}
                            run_id={run.run_id}
                            spec_number={run.spec_number}
                            posted={posted}
                            chat_agent_id={chat_agent_id}
                            {...look}
                        />
                    ))}
                </View>
            ) : null}
            {answered.length > 0 ? (
                <View style={styles.stageBody}>
                    {answered.map((entry) => (
                        <Text
                            key={`${entry.key}-${entry.since}`}
                            style={styles.muted}
                        >
                            {postedText({ posted: entry })}
                        </Text>
                    ))}
                </View>
            ) : null}
        </Section>
    )
}
