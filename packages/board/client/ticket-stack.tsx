/**
 * The tickets as a stack of stages (Blocked, Building, Reviewing, Testing,
 * Fixing, Joining, Done, Skipped), each a fold of ticket cards, then the
 * tickets left out for a person.
 */
import type { Dispatch, SetStateAction } from 'react'

import { Text, View } from 'react-native'

import { stageColor } from './board-look'
import { Section, StageHeader } from './board-panel-parts'
import {
    FOR_A_PERSON,
    TICKET_STAGES,
    toggled,
    type Key,
} from './board-panel-stages'
import type { Look } from './board-panel-styles'
import { TicketCardView } from './ticket-card-view'

import type { BoardState, TicketCard } from '../shared/board-state'

export const TicketStack = ({
    state,
    folded,
    setFolded,
    openCards,
    setOpenCards,
    theme,
    styles,
}: {
    state: BoardState
    folded: ReadonlySet<Key>
    setFolded: Dispatch<SetStateAction<ReadonlySet<Key>>>
    openCards: ReadonlySet<Key>
    setOpenCards: Dispatch<SetStateAction<ReadonlySet<Key>>>
} & Look) => {
    const look = { theme, styles }
    const card = (ticket: TicketCard) => {
        const key = `ticket-${ticket.number}`
        return (
            <TicketCardView
                key={key}
                ticket={ticket}
                state={state}
                open={openCards.has(key)}
                onToggle={() => setOpenCards((set) => toggled({ set, key }))}
                {...look}
            />
        )
    }

    return (
        <>
            {TICKET_STAGES.map((entry) => {
                const tickets = state.tickets.filter(
                    (ticket) => ticket.stage === entry.stage
                )
                const isFolded = folded.has(entry.stage)
                return (
                    <Section key={entry.stage} styles={styles}>
                        <StageHeader
                            title={entry.title}
                            hint={entry.hint}
                            icon={entry.icon}
                            count={tickets.length}
                            color={stageColor({ stage: entry.stage, theme })}
                            folded={isFolded}
                            onPress={() =>
                                setFolded((set) =>
                                    toggled({ set, key: entry.stage })
                                )
                            }
                            {...look}
                        />
                        {tickets.length > 0 && !isFolded ? (
                            <View style={styles.stageBody}>
                                {tickets.map(card)}
                            </View>
                        ) : null}
                    </Section>
                )
            })}

            {state.for_a_person.length > 0 ? (
                <Section styles={styles}>
                    <StageHeader
                        title="For a person"
                        hint="left out of this run: a person does these, or they wait on one"
                        icon="User"
                        count={state.for_a_person.length}
                        color={theme.colors.foregroundMuted}
                        folded={folded.has(FOR_A_PERSON)}
                        onPress={() =>
                            setFolded((set) =>
                                toggled({ set, key: FOR_A_PERSON })
                            )
                        }
                        {...look}
                    />
                    {folded.has(FOR_A_PERSON) ? null : (
                        <View style={styles.stageBody}>
                            {state.for_a_person.map((ticket) => (
                                <Text
                                    key={ticket.number}
                                    style={styles.muted}
                                    numberOfLines={2}
                                >
                                    #{ticket.number} {ticket.title} ·{' '}
                                    {ticket.why}
                                </Text>
                            ))}
                        </View>
                    )}
                </Section>
            ) : null}
        </>
    )
}
