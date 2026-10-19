/**
 * The plan usage line: the five-hour and weekly windows, colored by level.
 */
import { Icon } from '@getpaseo/plugin/client/react-native'
import { Text, View } from 'react-native'

import { percentText, usageColor } from './board-look'
import type { Look } from './board-panel-styles'

import type { BoardState } from '../shared/board-state'

export const UsageLine = ({
    state,
    theme,
    styles,
}: { state: BoardState } & Look) => {
    const { usage, usage_label } = state
    return (
        <View style={styles.row}>
            <Icon name="Gauge" size={13} color={theme.colors.foregroundMuted} />
            {usage ? (
                <Text style={styles.mono}>
                    {usage_label}: 5h{' '}
                    <Text
                        style={{
                            color: usageColor({
                                level: usage.five_hour_level,
                                theme,
                            }),
                        }}
                    >
                        {percentText({ percent: usage.five_hour_percent })}
                    </Text>{' '}
                    · week{' '}
                    <Text
                        style={{
                            color: usageColor({
                                level: usage.weekly_level,
                                theme,
                            }),
                        }}
                    >
                        {percentText({ percent: usage.weekly_percent })}
                    </Text>
                </Text>
            ) : (
                <Text style={styles.mono}>{usage_label}: no reading yet</Text>
            )}
        </View>
    )
}
