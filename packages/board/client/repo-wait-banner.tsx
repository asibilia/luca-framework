/**
 * The repo wait's banner (#632): the run waits for an earlier run on the
 * same repo (#615), from `repo_wait_started` until `repo_wait_ended`. It
 * says which run, how long it has waited, counting up by itself, and has
 * the amber bar of a wait on purpose.
 */
import { Icon } from '@getpaseo/plugin/client/react-native'
import { Text, View } from 'react-native'

import { useNow } from './board-look'
import type { Look } from './board-panel-styles'

import { elapsedText, type BoardState } from '../shared/board-state'

/**
 * The banner's words.
 *
 * @example
 * repoWaitText({ runs: ['20260923t113000z-5b1e0c2a'], ms: 725_000 })
 * // 'waiting for run 20260923t113000z-5b1e0c2a on this repo · 12m 5s'
 */
export const repoWaitText = ({
    runs,
    ms,
}: {
    runs: string[]
    ms: number
}): string => {
    const which =
        runs.length === 0
            ? 'an earlier run'
            : runs.map((run_id) => `run ${run_id}`).join(', ')
    return `waiting for ${which} on this repo · ${elapsedText({ ms })}`
}

export const RepoWaitBanner = ({
    wait,
    theme,
    styles,
}: { wait: NonNullable<BoardState['repo_wait']> } & Look) => {
    const now = useNow()
    const color = theme.colors.statusWarning
    return (
        <View style={[styles.banner, { borderColor: color }]}>
            <Icon name="Hourglass" size={13} color={color} />
            <Text style={[styles.bannerText, { color }]}>
                {repoWaitText({
                    runs: wait.runs,
                    ms: now - Date.parse(wait.since),
                })}
            </Text>
            <View style={styles.spacer} />
            <View
                accessibilityLabel="waiting"
                style={[styles.waitBar, { backgroundColor: color }]}
            />
        </View>
    )
}
