import { sum, type TicketFacts } from './model-score-facts'
import { EPSILON, MIN_TICKETS, WORSE_BY } from './model-score-rules'

/**
 * The model score report's sides (#605): the rates a set of tickets is
 * judged by, the verdict between two sides, and a side as `luca models`
 * prints it. Pure.
 */

export type Verdict = 'not enough data' | 'worse' | 'about the same'

/** The rates a model is judged by, for its tickets or its baseline's. */
export type ScoreSide = {
    tickets: number
    /** Weighted first-review findings per 100 changed lines; `null` with no lines. */
    findings_per_100_lines: number | null
    /** `null` with no tickets. */
    fix_rounds_per_ticket: number | null
}

/** Findings per 100 lines over `tickets`, those with no lines left out. */
const findingsRate = (tickets: TicketFacts[]): number | null => {
    const rated = tickets.filter(({ lines }) => lines !== null)
    const lines = sum(rated.map(({ lines }) => lines ?? 0))
    return lines === 0
        ? null
        : (sum(rated.map(({ findings }) => findings)) * 100) / lines
}

export const sideOf = (tickets: TicketFacts[]): ScoreSide => ({
    tickets: tickets.length,
    findings_per_100_lines: findingsRate(tickets),
    fix_rounds_per_ticket:
        tickets.length === 0
            ? null
            : sum(tickets.map(({ fix_rounds }) => fix_rounds)) / tickets.length,
})

/** Whether `value` is more than `WORSE_BY` above `base`. */
const above = (value: number | null, base: number | null): boolean =>
    value !== null && base !== null && value > base * (1 + WORSE_BY) + EPSILON

/** Whether either side has fewer than `MIN_TICKETS` tickets. */
export const tooFew = (a: ScoreSide, b: ScoreSide): boolean =>
    a.tickets < MIN_TICKETS || b.tickets < MIN_TICKETS

/** Whether `side`'s findings rate or fix rounds per ticket is above `base`'s. */
export const sideAbove = (side: ScoreSide, base: ScoreSide): boolean =>
    above(side.findings_per_100_lines, base.findings_per_100_lines) ||
    above(side.fix_rounds_per_ticket, base.fix_rounds_per_ticket)

/**
 * The verdict on a cheaper model against its baseline: "not enough data"
 * while either side has fewer than `MIN_TICKETS` tickets, "worse" when its
 * findings rate or fix rounds per ticket is more than `WORSE_BY` above the
 * baseline's, else "about the same". Pure.
 */
export const verdictOf = ({
    side,
    baseline,
}: {
    side: ScoreSide
    baseline: ScoreSide
}): Verdict => {
    if (tooFew(side, baseline)) return 'not enough data'
    return sideAbove(side, baseline) ? 'worse' : 'about the same'
}

export const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`

export const decimal = (value: number | null): string =>
    value === null ? '-' : value.toFixed(2)

export const sideText = (side: ScoreSide): string =>
    [
        plural(side.tickets, 'ticket'),
        `${decimal(side.findings_per_100_lines)} findings per 100 lines`,
        `${decimal(side.fix_rounds_per_ticket)} fix rounds per ticket`,
    ].join(', ')
