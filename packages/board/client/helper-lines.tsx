/**
 * A card's helper lines (#636): under its step-dots line, one line per
 * helper its agent has running, from the run's live file: "helper", the
 * helper's model as a coloured tag, its latest action and how long ago,
 * with a left edge in the model's colour. A helper that's done has no line.
 */
import { Text, View } from 'react-native'

import { modelColor } from './board-look'
import type { Look } from './board-panel-styles'
import { callWords } from './live-line'
import { CutLine } from './one-line'

import { elapsedText, type LiveAgent } from '../shared/board-state'

export const HelperLines = ({
    live,
    now,
    theme,
    styles,
}: { live: LiveAgent | null; now: number } & Look) => (
    <>
        {(live?.helpers ?? [])
            .filter((helper) => !helper.done)
            .map((helper, index) => {
                const model = helper.model ?? 'haiku'
                const color = modelColor({ model, theme })
                const { action } = helper
                return (
                    <View
                        key={index}
                        style={[
                            styles.line,
                            styles.helperLine,
                            { borderLeftColor: color },
                        ]}
                    >
                        <Text
                            style={[styles.muted, styles.fixed]}
                            numberOfLines={1}
                        >
                            helper
                        </Text>
                        <Text
                            style={[styles.tag, { color, borderColor: color }]}
                            numberOfLines={1}
                        >
                            {model}
                        </Text>
                        {action !== null ? (
                            <>
                                <CutLine
                                    text={callWords(action)}
                                    style={styles.text}
                                    styles={styles}
                                />
                                <Text
                                    style={[styles.mono, styles.fixed]}
                                    numberOfLines={1}
                                >
                                    {`${elapsedText({ ms: now - Date.parse(action.at) })} ago`}
                                </Text>
                            </>
                        ) : null}
                    </View>
                )
            })}
    </>
)
