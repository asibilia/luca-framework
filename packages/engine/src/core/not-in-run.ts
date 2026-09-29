import type { RunState } from '../journal/replay'
import type { Tracker } from '../tracker/tracker'

/**
 * The spec's open tickets that aren't in the run, read from the tracker
 * again just before the PR opens (#484): a ticket reopened while the run
 * went, or one that was closed at intake and reopened since. The PR names
 * them (`withNotInRun`), so they are no surprise later. Oldest first, as
 * the tracker lists them. The tickets intake left out for a person (#499)
 * aren't among them: the PR names those in their own sections.
 *
 * @example
 * const open = await openTicketsNotInRun({ tracker, state })
 * // [{ number: 13, title: 'Add the menu item' }]
 */
export const openTicketsNotInRun = async ({
    tracker,
    state,
}: {
    tracker: Tracker
    state: RunState
}): Promise<{ number: number; title: string }[]> => {
    const { spec_number, snapshot } = state
    if (spec_number === null) return []
    const known = new Set([
        ...(snapshot?.ticket_order ?? []),
        ...(snapshot?.left_out ?? []).map(({ number }) => number),
    ])
    const tickets = await tracker.listSubTickets({ spec_number })
    return tickets
        .filter(({ number, state }) => state === 'open' && !known.has(number))
        .map(({ number, title }) => ({ number, title }))
}
