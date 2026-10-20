/**
 * What a waiting card waits for (#558, #559): a ticket the engine holds on
 * purpose between steps. The engine's `ticket_waiting` names the reason; an
 * old journal without it gets the same reasons from the board's own rules,
 * or "waiting for the engine's next step" when none fits, never a guess.
 * A check waiting for a slot inside its step (#632) comes from the live file.
 */
import {
    BASELINE_STEP_TEXT,
    type BoardState,
    type TicketCard,
    type TicketStage,
    type WaitFor,
} from '../shared/board-state'

/** A wait as the card shows it: its text, and since when (if known). */
export type ShownWait = { text: string; since: string | null }

/** The cards that never wait: done, stuck, skipped, or blocked. */
const NEVER_WAITS = new Set<TicketStage>([
    'done',
    'stuck',
    'skipped',
    'blocked',
])

/** What no rule explains. */
export const ENGINE_NEXT_STEP = "waiting for the engine's next step"

/**
 * A wait's reason in words.
 *
 * @example
 * waitText({ waiting_for: 'join', on_ticket: 331 }) // 'waiting to join after #331'
 */
export const waitText = ({
    waiting_for,
    on_ticket,
}: {
    waiting_for: WaitFor
    on_ticket: number | null
}): string => {
    const other = on_ticket === null ? null : `#${on_ticket}`
    switch (waiting_for) {
        case 'baseline':
            return other === null
                ? 'waiting for the shared baseline tests'
                : `waiting for ${other}'s baseline tests`
        case 'join':
            return other === null
                ? 'waiting to join'
                : `waiting to join after ${other}`
        case 'start':
            return other === null
                ? 'waiting to start'
                : `starts once ${other} has joined`
    }
}

/**
 * What a ticket's check waits for inside its step (#632), from the live
 * file, or `null` when it waits for no slot.
 *
 * @example
 * slotWait({ ticket }) // { text: 'waiting for a test slot (2 of 2 in use)', since: '2026-...' }
 */
export const slotWait = ({
    ticket,
}: {
    ticket: TicketCard
}): ShownWait | null => {
    const wait = ticket.slot_wait
    if (wait === null) return null
    const slot = wait.for === 'prepare_slot' ? 'a prepare slot' : 'a test slot'
    return {
        text: `waiting for ${slot} (${wait.in_use} of ${wait.slots} in use)`,
        since: wait.since,
    }
}

/** An approved ticket in the join queue, not yet joining. */
const approvedWaiting = (card: TicketCard): boolean =>
    card.stage === 'joining' &&
    card.activity === 'approved' &&
    card.current_step === null

/** The ticket joining the run branch now, other than `number`. */
const joinerBesides = ({
    state,
    number,
}: {
    state: BoardState
    number: number
}): number | null =>
    state.tickets.find(
        (card) =>
            card.number !== number &&
            card.stage === 'joining' &&
            !approvedWaiting(card)
    )?.number ?? null

/** The ticket running the baseline tests now, other than `number`. */
const baselineRunner = ({
    state,
    number,
}: {
    state: BoardState
    number: number
}): number | null =>
    state.tickets.find(
        (card) =>
            card.number !== number &&
            card.current_step?.text === BASELINE_STEP_TEXT
    )?.number ?? null

/** #558's rules, for a started ticket between steps of an old journal. */
const guessedReason = ({
    state,
    ticket,
}: {
    state: BoardState
    ticket: TicketCard
}): string => {
    const { number } = ticket
    if (ticket.stage === 'building' && ticket.baseline_tests === null) {
        const runner = baselineRunner({ state, number })
        if (runner !== null) {
            return waitText({ waiting_for: 'baseline', on_ticket: runner })
        }
    }
    if (approvedWaiting(ticket)) {
        const joiner = joinerBesides({ state, number })
        if (joiner !== null) {
            return waitText({ waiting_for: 'join', on_ticket: joiner })
        }
    }
    return ENGINE_NEXT_STEP
}

/**
 * What `ticket` waits for between steps, or `null` when it isn't waiting:
 * it is in a step, it never waits (done, stuck, skipped, blocked), or the
 * engine isn't running the run. A ticket not started yet waits only to
 * start, behind a ticket in the join queue.
 *
 * @example
 * ticketWait({ state, ticket })
 * // { text: "waiting for #553's baseline tests", since: '2026-...' }
 */
export const ticketWait = ({
    state,
    ticket,
}: {
    state: BoardState
    ticket: TicketCard
}): ShownWait | null => {
    if (NEVER_WAITS.has(ticket.stage) || ticket.current_step !== null) {
        return null
    }
    if (state.run.engine_ended !== null || state.run.stopped !== null) {
        return null
    }
    const { wait } = ticket
    if (wait?.for) {
        return {
            text: waitText({
                waiting_for: wait.for,
                on_ticket: wait.on_ticket,
            }),
            since: wait.since,
        }
    }
    if (!ticket.started) {
        const ahead =
            joinerBesides({ state, number: ticket.number }) ??
            state.tickets.find(approvedWaiting)?.number ??
            null
        return ahead === null
            ? null
            : {
                  text: waitText({ waiting_for: 'start', on_ticket: ahead }),
                  since: null,
              }
    }
    // A journal with no step records never says the ticket is between steps.
    if (wait === null) return null
    return { text: guessedReason({ state, ticket }), since: wait.since }
}
