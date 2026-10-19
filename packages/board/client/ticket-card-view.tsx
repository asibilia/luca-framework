/**
 * A ticket's card in the panel: its number and title, its stage pill, the
 * step dots, the fix and review counters, its tokens and tests, and its
 * details when opened.
 */
import { Icon } from '@getpaseo/plugin/client/react-native'
import { Pressable, Text, View } from 'react-native'

import { stageColor, tokensText } from './board-look'
import { Counter, StepLine } from './board-panel-parts'
import type { Look } from './board-panel-styles'
import { StepDots } from './step-dots'
import { TicketDetail } from './ticket-detail'

import {
    planUsedText,
    type BoardState,
    type TicketCard,
} from '../shared/board-state'

export const TicketCardView = ({
    ticket,
    state,
    open,
    onToggle,
    theme,
    styles,
}: {
    ticket: TicketCard
    state: BoardState
    open: boolean
    onToggle: () => void
} & Look) => {
    const color = stageColor({ stage: ticket.stage, theme })
    const failing =
        ticket.tests &&
        ticket.tests.failing > 0 &&
        ticket.stage !== 'done' &&
        ticket.stage !== 'skipped'
            ? ticket.tests
            : null
    const blockers =
        ticket.findings && ticket.stage !== 'done' ? ticket.findings.blocker : 0
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ticket ${ticket.number}, ${ticket.stage}. ${open ? 'Hide' : 'Show'} details`}
            onPress={onToggle}
            style={({ pressed }) => [
                styles.card,
                pressed ? styles.cardPressed : null,
            ]}
        >
            <View style={styles.cardTop}>
                <Text style={styles.number}>#{ticket.number}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {ticket.title}
                </Text>
                {ticket.refactor ? (
                    <Text style={styles.tag}>refactor</Text>
                ) : null}
                <View style={styles.spacer} />
                <Text style={[styles.pill, { color, borderColor: color }]}>
                    {ticket.activity}
                </Text>
                <Icon
                    name={open ? 'ChevronDown' : 'ChevronRight'}
                    size={14}
                    color={theme.colors.foregroundMuted}
                />
            </View>
            <View style={styles.row}>
                <StepDots ticket={ticket} theme={theme} styles={styles} />
                <Text style={styles.text} numberOfLines={1}>
                    {ticket.role ?? ''}
                </Text>
            </View>
            {ticket.current_step ? (
                <StepLine
                    step={ticket.current_step}
                    prefix=""
                    styles={styles}
                />
            ) : null}
            <View style={styles.row}>
                <Counter
                    label="fix"
                    value={ticket.fix_round}
                    theme={theme}
                    styles={styles}
                />
                <Counter
                    label="review"
                    value={ticket.review_round}
                    theme={theme}
                    styles={styles}
                />
                <Text style={styles.mono}>
                    {tokensText({ tokens: ticket.tokens })} tokens
                </Text>
                {ticket.plan_used.length > 0 ? (
                    <Text style={styles.mono}>
                        plan:{' '}
                        {planUsedText({ used: ticket.plan_used, sign: '+' })}
                    </Text>
                ) : null}
                {failing ? (
                    <Text
                        style={[
                            styles.muted,
                            { color: theme.colors.statusDanger },
                        ]}
                    >
                        {failing.failing} of {failing.total} tests failing
                    </Text>
                ) : null}
                {blockers > 0 ? (
                    <Text
                        style={[
                            styles.muted,
                            { color: theme.colors.statusWarning },
                        ]}
                    >
                        {blockers} blocker from the ticket review
                    </Text>
                ) : null}
            </View>
            {open ? (
                <TicketDetail ticket={ticket} state={state} styles={styles} />
            ) : null}
        </Pressable>
    )
}
