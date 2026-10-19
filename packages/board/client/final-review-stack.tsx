/**
 * The final review as a stack of its lenses (Waiting, Reviewing, Fixing,
 * Clean), with the round and fix round and a line saying where it stands.
 */
import { Icon } from '@getpaseo/plugin/client/react-native'
import { Text, View } from 'react-native'

import { DIMMED, lensColor } from './board-look'
import { Counter, StageHeader } from './board-panel-parts'
import { LENS_STAGES } from './board-panel-stages'
import type { Look } from './board-panel-styles'

import { LOOP_CAP, type BoardState, type LensCard } from '../shared/board-state'

const findingsLine = ({ lens }: { lens: LensCard }): string | null => {
    const parts = [
        lens.findings.blocker > 0 ? `${lens.findings.blocker} blocker` : null,
        lens.findings.should_fix > 0
            ? `${lens.findings.should_fix} should-fix`
            : null,
        lens.findings.nit > 0 ? `${lens.findings.nit} nit` : null,
    ].filter((part) => part !== null)
    return parts.length > 0 ? parts.join(', ') : null
}

const LensCardView = ({ lens, theme, styles }: { lens: LensCard } & Look) => {
    const color = lensColor({ state: lens.state, theme })
    const findings = findingsLine({ lens })
    return (
        <View style={styles.card}>
            <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{lens.name}</Text>
                <View style={styles.spacer} />
                <Text style={[styles.pill, { color, borderColor: color }]}>
                    {lens.state}
                </Text>
            </View>
            {findings ? (
                <Text
                    style={[
                        styles.muted,
                        {
                            color:
                                lens.findings.blocker > 0
                                    ? theme.colors.statusDanger
                                    : theme.colors.statusWarning,
                        },
                    ]}
                >
                    {findings}
                </Text>
            ) : null}
        </View>
    )
}

const reviewLine = ({ state }: { state: BoardState }): string => {
    const review = state.final_review
    const open = state.tickets.filter(
        (ticket) => ticket.stage !== 'done' && ticket.stage !== 'skipped'
    ).length
    switch (review.state) {
        case 'waiting':
            return review.active
                ? 'Every ticket is done or skipped. It starts next.'
                : `Starts when every ticket is done or skipped (${open} still open).`
        case 'reviewing':
            return `Round ${review.round}: a fresh reviewer per lens reads the whole run branch.`
        case 'fixing':
            return `Fix round ${review.fix_round}/${LOOP_CAP}: the implementer fixes what the lenses found.`
        case 'stuck':
            return 'Stuck: it needs your reply (see Needs you).'
        case 'passed':
            return 'Passed.'
    }
}

export const FinalReviewStack = ({
    state,
    theme,
    styles,
}: { state: BoardState } & Look) => {
    const review = state.final_review
    return (
        <View
            style={[styles.block, review.active ? null : { opacity: DIMMED }]}
        >
            <View style={styles.row}>
                <Icon
                    name="GitPullRequest"
                    size={15}
                    color={theme.colors.foreground}
                />
                <Text style={styles.reviewTitle}>Final review · 5 lenses</Text>
                <View style={styles.spacer} />
                <Counter
                    label="round"
                    value={review.round}
                    theme={theme}
                    styles={styles}
                />
                <Counter
                    label="fix"
                    value={review.fix_round}
                    theme={theme}
                    styles={styles}
                />
            </View>
            <Text style={styles.muted}>{reviewLine({ state })}</Text>
            {LENS_STAGES.map((entry) => {
                const lenses = review.lenses.filter(
                    (lens) => lens.state === entry.stage
                )
                return (
                    <View key={entry.stage} style={styles.block}>
                        <StageHeader
                            title={entry.title}
                            hint=""
                            icon={entry.icon}
                            count={lenses.length}
                            color={lensColor({ state: entry.stage, theme })}
                            folded={null}
                            onPress={null}
                            theme={theme}
                            styles={styles}
                        />
                        {lenses.length > 0 ? (
                            <View style={styles.stageBody}>
                                {lenses.map((lens) => (
                                    <LensCardView
                                        key={lens.name}
                                        lens={lens}
                                        theme={theme}
                                        styles={styles}
                                    />
                                ))}
                            </View>
                        ) : null}
                    </View>
                )
            })}
        </View>
    )
}
