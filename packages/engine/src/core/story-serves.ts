/**
 * The check of a run's story serves refs (#745): each points at the run's
 * spec (`spec #12`) or one acceptance criterion of a ticket it built
 * (`ticket #14, AC2`), with that issue's URL and, for a ticket, that
 * criterion's text. Pure.
 */
import type { RunAsks } from './story-asks'

import type { Story } from '../story/story-schema'

const SPEC_LABEL = /^spec #(\d+)$/
const TICKET_LABEL = /^ticket #(\d+), AC(\d+)$/
const CRITERION_ID = /^AC(\d+)$/

/** Texts compared after trimming, each run of whitespace one space. */
const squashed = (text: string): string => text.trim().replace(/\s+/g, ' ')

type Ref = Story['stops'][number]['changes'][number]['serves']['refs'][number]

/** The one problem of a ref, or null when it passes. */
const refProblem = ({ ref, asks }: { ref: Ref; asks: RunAsks }) => {
    const spec = SPEC_LABEL.exec(ref.label)
    const ticket = TICKET_LABEL.exec(ref.label)
    if (spec === null && ticket === null) {
        return 'is not in the form "spec #12" or "ticket #14, AC2"'
    }
    const number = Number(spec?.[1] ?? ticket?.[1])
    const built = asks.tickets.find((entry) => entry.number === number)
    const named =
        spec === null
            ? built
            : number === asks.spec.number
              ? asks.spec
              : undefined
    const urls = [asks.spec.url, ...asks.tickets.map(({ url }) => url)]
    if (named === undefined || ref.url === null || !urls.includes(ref.url)) {
        return "does not point at this run's spec or tickets"
    }
    if (ref.url !== named.url) {
        return 'has the url of a different issue than its label names'
    }
    if (ticket === null || built === undefined) return null
    const criterion = built.criteria.find(
        ({ id }) => Number(CRITERION_ID.exec(id)?.[1]) === Number(ticket[2])
    )
    if (criterion === undefined) {
        return `names a criterion that ticket #${built.number} does not have`
    }
    if (
        ref.quote === null ||
        squashed(ref.quote) !== squashed(criterion.text)
    ) {
        return "has a quote that is not that criterion's text"
    }
    return null
}

/**
 * One problem line per serves ref that fails, in the order the refs appear
 * in the story, top to bottom.
 *
 * @example
 * servesProblems({ story, asks })
 * // ['"c3": serves ref "#14" is not in the form "spec #12" or "ticket #14, AC2"']
 */
export const servesProblems = ({
    story,
    asks,
}: {
    story: Story
    asks: RunAsks
}): string[] =>
    story.stops.flatMap(({ changes }) =>
        changes.flatMap(({ id, serves }) =>
            serves.refs.flatMap((ref) => {
                const problem = refProblem({ ref, asks })
                return problem === null
                    ? []
                    : [`"${id}": serves ref "${ref.label}" ${problem}`]
            })
        )
    )
