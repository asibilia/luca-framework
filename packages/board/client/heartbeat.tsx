/**
 * A busy card's heartbeat (#631): 20 small bars at the end of its
 * step-dots line, one per second, oldest on the left, each as tall as its
 * agent's activity that second in the live file. Green while working; a
 * flat line in the muted colour when nothing happened in those seconds; a
 * flat red line when the run shows no sign of life (#635).
 * Plain `View`s, redrawn with the card on the board's 1-second tick.
 */
import { View } from 'react-native'

import type { Look } from './board-panel-styles'

import type { LiveAgent } from '../shared/board-state'

/** How many seconds the heartbeat shows. */
const BARS = 20

/** A quiet second's bar height, in points. */
const LOW = 2

/** A count this big or bigger fills a bar. */
const LOUD = 12

/** A bar's height for `count`: one point more per tick, up to `LOUD`. */
const heightOf = (count: number): number => LOW + Math.min(count, LOUD)

export const Heartbeat = ({
    live,
    gone = false,
    theme,
    styles,
}: {
    live: LiveAgent
    /** The run shows no sign of life (#635): a flat red line. */
    gone?: boolean
} & Look) => {
    const counts = gone ? [] : live.activity.slice(-BARS)
    const bars = [
        ...Array.from({ length: BARS - counts.length }, () => 0),
        ...counts,
    ]
    const color = gone
        ? theme.colors.statusDanger
        : bars.some((count) => count > 0)
          ? theme.colors.statusSuccess
          : theme.colors.foregroundMuted
    return (
        <View accessibilityLabel="Heartbeat" style={styles.heartbeat}>
            {bars.map((count, index) => (
                <View
                    key={index}
                    style={[
                        styles.heartbeatBar,
                        { height: heightOf(count), backgroundColor: color },
                    ]}
                />
            ))}
        </View>
    )
}
