import type { LeftOutTicket } from '../intake/intake-schemas'
import { HUMAN_LABEL } from '../tracker/tracker'

/**
 * Words for the tickets intake left out for a person (#499): a ticket with
 * `ready-for-human`, or one that waits on such a ticket. The PR, the run's
 * end, and the board all say it the same way.
 */

/** Issue numbers as `#12`, `#12 and #13`, or `#12, #13 and #14`. */
const numbersText = ({ numbers }: { numbers: number[] }): string => {
    const refs = numbers.map((number) => `#${number}`)
    const last = refs.at(-1) ?? ''
    return refs.length <= 1
        ? last
        : `${refs.slice(0, -1).join(', ')} and ${last}`
}

/**
 * Why a left-out ticket isn't in the run, in words.
 *
 * @example
 * leftOutWhy({ ticket: { reason: 'for_a_person', ... } }) // 'for a person'
 * leftOutWhy({ ticket: { reason: 'waits_on_person', waits_on: [12], through: [13], ... } })
 * // 'waits on #12, which is for a person (through #13)'
 */
export const leftOutWhy = ({ ticket }: { ticket: LeftOutTicket }): string => {
    if (ticket.reason === 'for_a_person') return 'for a person'
    const which =
        ticket.waits_on.length === 1
            ? 'which is for a person'
            : 'which are for a person'
    const through =
        ticket.through.length === 0
            ? ''
            : ` (through ${numbersText({ numbers: ticket.through })})`
    return `waits on ${numbersText({ numbers: ticket.waits_on })}, ${which}${through}`
}

/**
 * The PR's sections for the tickets left out for a person: "For a person"
 * (the `ready-for-human` tickets) and "Waiting on a person" (the tickets
 * blocked by them). Empty when none was left out.
 *
 * @example
 * leftOutSections({ left_out })
 * // ['## For a person\n\n...\n\n- #12 Make the store page', '## Waiting on a person\n\n...']
 */
export const leftOutSections = ({
    left_out,
}: {
    left_out: LeftOutTicket[]
}): string[] => {
    const people = left_out.filter(({ reason }) => reason === 'for_a_person')
    const waiting = left_out.filter(
        ({ reason }) => reason === 'waits_on_person'
    )
    return [
        people.length === 0
            ? ''
            : `## For a person\n\nTickets labeled \`${HUMAN_LABEL}\`. An agent doesn't build them, so this PR doesn't close them.\n\n` +
              people
                  .map(({ number, title }) => `- #${number} ${title}`)
                  .join('\n'),
        waiting.length === 0
            ? ''
            : "## Waiting on a person\n\nTickets that can't be built until a person's ticket is done. A later run builds them.\n\n" +
              waiting
                  .map(
                      (ticket) =>
                          `- #${ticket.number} ${ticket.title}: ${leftOutWhy({ ticket })}`
                  )
                  .join('\n'),
    ].filter((section) => section !== '')
}

/**
 * Why a run ended with nothing to do, in one line: every ticket closed,
 * the work already done (#484), or the rest left for a person (#499).
 *
 * @example
 * nothingToDoText({ content: { closed_tickets: [11], already_done: [], left_out: [] } })
 * // 'Nothing to do: every ticket of the spec is closed.'
 */
export const nothingToDoText = ({
    content,
}: {
    content: {
        closed_tickets: number[]
        already_done: number[]
        left_out: LeftOutTicket[]
    }
}): string => {
    const numbersOf = (reason: LeftOutTicket['reason']) =>
        content.left_out
            .filter((ticket) => ticket.reason === reason)
            .map(({ number }) => number)
    const people = numbersOf('for_a_person')
    const waiting = numbersOf('waits_on_person')
    const parts = [
        content.already_done.length === 0
            ? ''
            : `the work of ${content.already_done.map((number) => `#${number}`).join(', ')} was already on the base branch`,
        people.length === 0
            ? ''
            : `${numbersText({ numbers: people })} ${people.length === 1 ? 'is' : 'are'} for a person`,
        waiting.length === 0
            ? ''
            : `${numbersText({ numbers: waiting })} ${waiting.length === 1 ? 'waits' : 'wait'} on a ticket for a person`,
    ].filter((part) => part !== '')
    if (parts.length === 0) {
        return 'Nothing to do: every ticket of the spec is closed.'
    }
    const last = parts.at(-1) ?? ''
    const text =
        parts.length === 1
            ? last
            : `${parts.slice(0, -1).join(', ')}, and ${last}`
    return `Nothing to do: ${text}.`
}
