/**
 * A waiting card's step-dots line (#559): what it waits for, cut to fit,
 * how long it has waited, counting up by itself, and the amber bar that
 * takes the heartbeat's place.
 */
import { Text, View } from 'react-native'

import { useNow } from './board-look'
import type { Look } from './board-panel-styles'
import { CutLine } from './one-line'
import type { ShownWait } from './ticket-wait'

import { elapsedText } from '../shared/board-state'

export const WaitLine = ({
    wait,
    theme,
    styles,
}: { wait: ShownWait } & Look) => {
    const now = useNow()
    return (
        <>
            <CutLine text={wait.text} style={styles.muted} styles={styles} />
            {wait.since === null ? null : (
                <Text style={[styles.mono, styles.fixed]} numberOfLines={1}>
                    {`· ${elapsedText({ ms: now - Date.parse(wait.since) })}`}
                </Text>
            )}
            <View style={styles.spacer} />
            <View
                accessibilityLabel="waiting"
                style={[
                    styles.waitBar,
                    { backgroundColor: theme.colors.statusWarning },
                ]}
            />
        </>
    )
}
