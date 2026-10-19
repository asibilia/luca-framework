/**
 * What a ticket card shows when it is open: its steps, what it waits on, its
 * last tests, findings, review fix rounds, tokens, and what was tried.
 */
import { Text, View } from 'react-native'

import { tokensText } from './board-look'
import type { Styles } from './board-panel-styles'
import { dotKinds } from './step-dots'

import {
    LOOP_CAP,
    STEP_NAMES,
    type BoardState,
    type TicketCard,
} from '../shared/board-state'

export const TicketDetail = ({
    ticket,
    state,
    styles,
}: {
    ticket: TicketCard
    state: BoardState
    styles: Styles
}) => {
    const kinds = dotKinds({ ticket })
    const waits = ticket.blockers.map((number) => {
        const blocker = state.tickets.find((card) => card.number === number)
        return `#${number} ${blocker ? blocker.stage : 'closed'}`
    })
    return (
        <View style={styles.detail}>
            <Text style={styles.muted}>
                steps:{' '}
                {STEP_NAMES.map(
                    (name, index) =>
                        `${name} ${kinds[index] === 'skip' ? '(not needed)' : (kinds[index] ?? '')}`
                ).join(' → ')}
            </Text>
            <Text style={styles.muted}>
                waits on: {waits.length > 0 ? waits.join(', ') : 'nothing'}
            </Text>
            {ticket.tests ? (
                <Text style={styles.muted}>
                    last tests:{' '}
                    {ticket.tests.failing > 0
                        ? `${ticket.tests.failing} of ${ticket.tests.total} failing`
                        : `${ticket.tests.total} passing`}
                </Text>
            ) : null}
            {ticket.findings ? (
                <Text style={styles.muted}>
                    findings: {ticket.findings.blocker} blocker ·{' '}
                    {ticket.findings.should_fix} should-fix ·{' '}
                    {ticket.findings.nit} nit
                </Text>
            ) : null}
            {ticket.review_fix_round > 0 ? (
                <Text style={styles.muted}>
                    review fix rounds: {ticket.review_fix_round}/{LOOP_CAP}
                </Text>
            ) : null}
            {Object.keys(ticket.agent_tokens).length > 0 ? (
                <Text style={styles.muted}>
                    tokens:{' '}
                    {Object.entries(ticket.agent_tokens)
                        .map(
                            ([role, tokens]) =>
                                `${role} ${tokensText({ tokens })}`
                        )
                        .join(' · ')}
                </Text>
            ) : null}
            {ticket.tried.length > 0 ? (
                <>
                    <Text style={styles.label}>Tried</Text>
                    {ticket.tried.map((line, index) => (
                        <Text key={`${index}-${line}`} style={styles.muted}>
                            {index + 1}. {line}
                        </Text>
                    ))}
                </>
            ) : null}
        </View>
    )
}
