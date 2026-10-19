/**
 * A ticket's card in the panel: its number and title, its stage pill, the
 * step dots, its agent's model and Clef's line, the fix and review counters, its tokens and tests, and its
 * details when opened. With an entry in the run's live file (#628), the
 * step text gives way to what its agent is doing now, and its tokens count
 * up with the turn, followed by the latest action's age. Each line stays on one line (`one-line.tsx`): the
 * number, pill, dots, counters and tokens keep their size, the text beside
 * them is cut, and a tap on it shows it whole in a bubble.
 */
import { Icon } from '@getpaseo/plugin/client/react-native'
import { Pressable, Text, View } from 'react-native'

import { stageColor, tokensText, useNow } from './board-look'
import { Counter, StepLine } from './board-panel-parts'
import type { Look } from './board-panel-styles'
import { liveAgeText, liveText } from './live-line'
import { ModelLine } from './model-line'
import { BubbleScope, CutLine, useBubbles } from './one-line'
import { StepDots } from './step-dots'
import { TicketDetail } from './ticket-detail'
import { ticketWait } from './ticket-wait'
import { WaitLine } from './wait-line'

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
    const bubbles = useBubbles()
    const now = useNow()
    // A ticket waiting on purpose between steps reads "waiting", in amber.
    const wait = ticketWait({ state, ticket })
    // What its agent is doing now, from the live file, in place of the step text.
    const doing = liveText({ live: ticket.live, now })
    const color = wait
        ? theme.colors.statusWarning
        : stageColor({ stage: ticket.stage, theme })
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
            onPress={() => {
                // A tap beside an open bubble only closes it.
                if (bubbles.open) bubbles.show(null)
                else onToggle()
            }}
            style={({ pressed }) => [
                styles.card,
                pressed ? styles.cardPressed : null,
            ]}
        >
            <BubbleScope bubbles={bubbles} styles={styles}>
                <View style={styles.cardTop}>
                    <Text style={styles.number} numberOfLines={1}>
                        #{ticket.number}
                    </Text>
                    <CutLine
                        text={ticket.title}
                        style={styles.cardTitle}
                        styles={styles}
                    />
                    {ticket.refactor ? (
                        <Text style={styles.tag} numberOfLines={1}>
                            refactor
                        </Text>
                    ) : null}
                    <View style={styles.spacer} />
                    <Text
                        style={[styles.pill, { color, borderColor: color }]}
                        numberOfLines={1}
                    >
                        {wait ? 'waiting' : ticket.activity}
                    </Text>
                    <Icon
                        name={open ? 'ChevronDown' : 'ChevronRight'}
                        size={14}
                        color={theme.colors.foregroundMuted}
                    />
                </View>
                <View style={styles.line}>
                    <StepDots ticket={ticket} theme={theme} styles={styles} />
                    {wait ? (
                        <WaitLine wait={wait} theme={theme} styles={styles} />
                    ) : doing || ticket.role ? (
                        <CutLine
                            text={doing ?? ticket.role ?? ''}
                            style={styles.text}
                            styles={styles}
                        />
                    ) : null}
                </View>
                {ticket.current_step && doing === null ? (
                    <StepLine
                        step={ticket.current_step}
                        prefix=""
                        styles={styles}
                    />
                ) : null}
                {ticket.model !== null && ticket.model.role === ticket.role ? (
                    <ModelLine
                        model={ticket.model}
                        bar={state.confidence_bar}
                        theme={theme}
                        styles={styles}
                    />
                ) : null}
                <View style={styles.line}>
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
                    <Text style={[styles.mono, styles.fixed]} numberOfLines={1}>
                        {`${tokensText({
                            tokens: ticket.tokens + (ticket.live?.tokens ?? 0),
                        })} tokens${liveAgeText({ live: ticket.live, now })}`}
                    </Text>
                    {ticket.plan_used.length > 0 ? (
                        <CutLine
                            text={`plan: ${planUsedText({ used: ticket.plan_used, sign: '+' })}`}
                            style={styles.mono}
                            styles={styles}
                        />
                    ) : null}
                    {failing ? (
                        <CutLine
                            text={`${failing.failing} of ${failing.total} tests failing`}
                            style={[
                                styles.muted,
                                { color: theme.colors.statusDanger },
                            ]}
                            styles={styles}
                        />
                    ) : null}
                    {blockers > 0 ? (
                        <CutLine
                            text={`${blockers} blocker from the ticket review`}
                            style={[
                                styles.muted,
                                { color: theme.colors.statusWarning },
                            ]}
                            styles={styles}
                        />
                    ) : null}
                </View>
            </BubbleScope>
            {open ? (
                <TicketDetail ticket={ticket} state={state} styles={styles} />
            ) : null}
        </Pressable>
    )
}
