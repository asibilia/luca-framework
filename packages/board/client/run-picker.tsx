/**
 * The run tabs: one chip per recent run, with the older ones folded behind
 * one chip.
 */
import { useState } from 'react'

import { Pressable, Text, View } from 'react-native'

import { statusColor, statusText } from './board-look'
import type { Look } from './board-panel-styles'

import { foldRuns, type RunSummary } from '../shared/board-state'

/** A tab per recent run; the older ones stay folded behind one chip. */
export const RunPicker = ({
    runs,
    selected,
    onPick,
    theme,
    styles,
}: {
    runs: RunSummary[]
    selected: string
    onPick: (run_id: string) => void
} & Look) => {
    const [showOlder, setShowOlder] = useState(false)
    const { shown, folded } = foldRuns({ runs, selected })
    return (
        <View style={styles.row}>
            {(showOlder ? [...shown, ...folded] : shown).map((run) => (
                <RunChip
                    key={run.run_id}
                    run={run}
                    on={run.run_id === selected}
                    onPick={onPick}
                    theme={theme}
                    styles={styles}
                />
            ))}
            {folded.length > 0 ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                        showOlder
                            ? 'Fold the older runs'
                            : `Show ${folded.length} older runs`
                    }
                    onPress={() => setShowOlder((open) => !open)}
                    style={styles.chip}
                >
                    <Text style={styles.small}>
                        {showOlder ? 'fold older' : `${folded.length} older`}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    )
}

const RunChip = ({
    run,
    on,
    onPick,
    theme,
    styles,
}: {
    run: RunSummary
    on: boolean
    onPick: (run_id: string) => void
} & Look) => (
    <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show run ${run.run_id}`}
        onPress={() => onPick(run.run_id)}
        style={[styles.chip, on ? styles.chipOn : null]}
    >
        <Text style={styles.small}>
            {run.spec_number === null ? 'demo' : `#${run.spec_number}`} ·{' '}
            <Text
                style={{
                    color: statusColor({ status: run.status, theme }),
                }}
            >
                {statusText({ status: run.status })}
            </Text>
            {run.needs_you > 0 ? ` · ${run.needs_you} need you` : ''}
        </Text>
    </Pressable>
)
