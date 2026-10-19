/**
 * A ticket card's step dots: one dot per step (tests, red check, code,
 * checks, review), done, current, stopped, skipped, or still to do, with
 * the current step's name.
 */
import { Text, View } from 'react-native'

import type { Look } from './board-panel-styles'

import {
    ALL_STEPS_DONE,
    REFACTOR_SKIPS_STEPS,
    STEP_NAMES,
    type TicketCard,
} from '../shared/board-state'

export type DotKind = 'done' | 'current' | 'todo' | 'skip' | 'stopped'

export const dotKinds = ({ ticket }: { ticket: TicketCard }): DotKind[] =>
    STEP_NAMES.map((_, index) => {
        if (ticket.refactor && index < REFACTOR_SKIPS_STEPS) return 'skip'
        if (index < ticket.step) return 'done'
        if (index === ticket.step) {
            return ticket.stage === 'skipped' || ticket.stage === 'stuck'
                ? 'stopped'
                : 'current'
        }
        return 'todo'
    })

const stepLabel = ({ ticket }: { ticket: TicketCard }): string => {
    if (ticket.step >= ALL_STEPS_DONE) return 'all steps done'
    const name = STEP_NAMES[ticket.step]
    if (!name) return ticket.activity
    if (ticket.stage === 'stuck') return `stuck at ${name}`
    if (ticket.stage === 'skipped') return `stopped at ${name}`
    return name
}

export const StepDots = ({
    ticket,
    theme,
    styles,
}: { ticket: TicketCard } & Look) => {
    const kinds = dotKinds({ ticket })
    const { colors } = theme
    const highlight =
        ticket.stage === 'stuck' ? colors.statusDanger : colors.accent
    const labelColor =
        ticket.step >= ALL_STEPS_DONE
            ? colors.statusSuccess
            : kinds.includes('current')
              ? highlight
              : colors.foregroundMuted
    const described = STEP_NAMES.map(
        (name, index) => `${name} ${kinds[index] ?? ''}`
    ).join(', ')
    return (
        <View
            style={styles.dots}
            accessible
            accessibilityLabel={`Steps: ${described}`}
        >
            {kinds.map((kind, index) => {
                const reached = kind === 'done' || kind === 'current'
                const look =
                    kind === 'done'
                        ? [
                              styles.dot,
                              {
                                  backgroundColor: colors.statusSuccess,
                                  borderColor: colors.statusSuccess,
                              },
                          ]
                        : kind === 'current'
                          ? [
                                styles.dotCurrent,
                                {
                                    backgroundColor: highlight,
                                    borderColor: highlight,
                                },
                            ]
                          : kind === 'stopped'
                            ? [
                                  styles.dotCurrent,
                                  {
                                      backgroundColor: colors.surface2,
                                      borderColor: highlight,
                                  },
                              ]
                            : kind === 'skip'
                              ? [
                                    styles.dot,
                                    styles.dotSkip,
                                    { borderColor: colors.foregroundMuted },
                                ]
                              : [
                                    styles.dot,
                                    { borderColor: colors.foregroundMuted },
                                ]
                return (
                    <View key={STEP_NAMES[index]} style={styles.dotCell}>
                        {index > 0 ? (
                            <View
                                style={[
                                    styles.link,
                                    {
                                        backgroundColor: reached
                                            ? colors.statusSuccess
                                            : colors.border,
                                    },
                                ]}
                            />
                        ) : null}
                        <View style={look} />
                    </View>
                )
            })}
            <Text style={[styles.stepLabel, { color: labelColor }]}>
                {stepLabel({ ticket })}
            </Text>
        </View>
    )
}
