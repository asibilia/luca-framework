import {
    factsOf,
    sum,
    type RunFacts,
    type TicketFacts,
} from './model-score-facts'
import {
    EPSILON,
    FINDING_WEIGHTS,
    MIN_TICKETS,
    SCORED_ROLES,
    WORSE_BY,
    type ScoredRole,
} from './model-score-rules'

import {
    EffortLevelSchema,
    ModelNameSchema,
    type EffortLevel,
    type ModelName,
} from '../config/engine-config'
import type { JournalRecord } from '../journal/journal-record'

export {
    FINDING_WEIGHTS,
    MIN_TICKETS,
    SCORED_ROLES,
    WORSE_BY,
    type ScoredRole,
} from './model-score-rules'

/**
 * The model score report (#605): how good each routed role's work was on
 * each model and effort it ran at (#662), from run journals, so the owner
 * knows when to lower a model floor or raise one back. A ticket is compared
 * only with tickets whose ticket review ran at the same effort. Pure: it
 * reads records and never writes.
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

/** One routed role on one model at one effort, its tickets reviewed at one effort. */
export type ModelScore = ScoreSide & {
    role: ScoredRole
    model: ModelName
    /** The effort the role's first agent on each ticket ran at. */
    effort: EffortLevel
    /** The effort each ticket's first ticket review ran at. */
    review_effort: EffortLevel
    stuck_tickets: number
    /** `null` when no finished ticket has its usage journaled. */
    tokens_per_finished_ticket: number | null
    /** Clef's median confidence in its model pick; `null` with none. */
    median_confidence: number | null
    /** Its tickets whose other build role ran on a cheaper model than Opus. */
    other_role_cheaper: number
    /**
     * The tickets where Clef picked this model in shadow mode but the role
     * ran Opus, at the same effort and reviewed at the same effort. Empty
     * for Opus.
     */
    baseline: ScoreSide
    /** `null` for Opus, which is the baseline the others are judged by. */
    verdict: Verdict | null
}

export type EffortPicksVerdict =
    | 'not enough data'
    | 'Clef spots hard tickets'
    | 'no sign yet'

/** Clef's confidence bands its effort picks are broken down by (#697). */
const CONFIDENCE_BANDS = [
    { band: 'below 0.3', from: -Infinity, below: 0.3 },
    { band: '0.3 to 0.5', from: 0.3, below: 0.5 },
    { band: '0.5 and up', from: 0.5, below: Infinity },
] as const

/** The two sides of Clef's effort picks within one confidence band. */
export type EffortPicksBand = {
    band: (typeof CONFIDENCE_BANDS)[number]['band']
    wanted_more: ScoreSide
    rest: ScoreSide
}

/**
 * Clef's shadow-mode effort picks for one writer role (#663): the tickets
 * where its first `agent_effort` answer with a confidence, at any
 * confidence (#697), was higher than the effort the role's first agent ran
 * at, against the tickets where it was the same or lower, then the same by
 * Clef's confidence.
 */
export type EffortPicks = {
    role: ScoredRole
    wanted_more: ScoreSide
    rest: ScoreSide
    verdict: EffortPicksVerdict
    by_confidence: EffortPicksBand[]
}

/** The final review's findings over a set of runs. */
export type FinalReviewSide = {
    runs: number
    findings_per_100_lines: number | null
}

export type ModelReport = {
    runs: number
    scores: ModelScore[]
    /** One per scored role. */
    effort_picks: EffortPicks[]
    /**
     * The roles whose every counted ticket with a model reason ran Opus for
     * its floor (#697): no cheaper model was ever tried.
     */
    floor_only: ScoredRole[]
    /** Fresh learner agents per model and effort; the learner isn't scored. */
    learner: { model: ModelName; effort: EffortLevel; agents: number }[]
    /** Runs with any agent on a cheaper model, and runs without. */
    final_review: { routed: FinalReviewSide; not_routed: FinalReviewSide }
    /** Joined tickets with no `lines_changed`, left out of the rates. */
    without_lines_changed: number
}

const median = (values: number[]): number | null => {
    if (values.length === 0) return null
    const sorted = values.toSorted((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
        ? (sorted[middle] ?? null)
        : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/** Findings per 100 lines over `tickets`, those with no lines left out. */
const findingsRate = (tickets: TicketFacts[]): number | null => {
    const rated = tickets.filter(({ lines }) => lines !== null)
    const lines = sum(rated.map(({ lines }) => lines ?? 0))
    return lines === 0
        ? null
        : (sum(rated.map(({ findings }) => findings)) * 100) / lines
}

const sideOf = (tickets: TicketFacts[]): ScoreSide => ({
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
const tooFew = (a: ScoreSide, b: ScoreSide): boolean =>
    a.tickets < MIN_TICKETS || b.tickets < MIN_TICKETS

/** Whether `side`'s findings rate or fix rounds per ticket is above `base`'s. */
const sideAbove = (side: ScoreSide, base: ScoreSide): boolean =>
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

/**
 * Clef's effort picks for `role` over every run's tickets: a ticket wants
 * more when its pick is above the effort the role's first agent ran at, in
 * `EffortLevelSchema`'s order. "Clef spots hard tickets" when the "wanted
 * more" side's findings rate or fix rounds per ticket is more than
 * `WORSE_BY` above the rest's, with `MIN_TICKETS` on each side. Each band
 * holds the tickets whose pick's confidence is at or above its lower edge.
 */
const effortPicksOf = ({
    tickets,
    role,
}: {
    tickets: TicketFacts[]
    role: ScoredRole
}): EffortPicks => {
    const rank = (level: EffortLevel): number =>
        EffortLevelSchema.options.indexOf(level)
    const picked = tickets.flatMap((ticket) => {
        const pick = ticket.effort_picks[role]
        const ran = ticket.efforts[role]
        return pick === undefined || ran === undefined
            ? []
            : [
                  {
                      ticket,
                      confidence: pick.confidence,
                      wants_more: rank(pick.effort) > rank(ran),
                  },
              ]
    })
    const sideWhere = (
        wants_more: boolean,
        within: (confidence: number) => boolean = () => true
    ): ScoreSide =>
        sideOf(
            picked.flatMap((entry) =>
                entry.wants_more === wants_more && within(entry.confidence)
                    ? [entry.ticket]
                    : []
            )
        )
    const wanted_more = sideWhere(true)
    const rest = sideWhere(false)
    const verdictOn = (): EffortPicksVerdict => {
        if (tooFew(wanted_more, rest)) return 'not enough data'
        return sideAbove(wanted_more, rest)
            ? 'Clef spots hard tickets'
            : 'no sign yet'
    }
    const by_confidence = CONFIDENCE_BANDS.map(({ band, from, below }) => {
        const within = (confidence: number) =>
            confidence >= from && confidence < below
        return {
            band,
            wanted_more: sideWhere(true, within),
            rest: sideWhere(false, within),
        }
    })
    return { role, wanted_more, rest, verdict: verdictOn(), by_confidence }
}

/**
 * Whether every one of `role`'s tickets that has a model reason ran Opus
 * for its floor, with at least one such ticket. A `null` reason, from
 * before #603, counts neither way.
 */
const isFloorOnly = ({
    tickets,
    role,
}: {
    tickets: TicketFacts[]
    role: ScoredRole
}): boolean => {
    const reasons = tickets.flatMap(({ models, model_reasons }) => {
        const reason = model_reasons[role] ?? null
        return models[role] === undefined || reason === null ? [] : [reason]
    })
    return reasons.length > 0 && reasons.every((reason) => reason === 'floor')
}

/**
 * One routed role on one model at one effort, over every run's tickets
 * whose first ticket review ran at `review_effort`.
 */
const scoreOf = ({
    tickets,
    role,
    model,
    effort,
    review_effort,
}: {
    tickets: TicketFacts[]
    role: ScoredRole
    model: ModelName
    effort: EffortLevel
    review_effort: EffortLevel
}): ModelScore => {
    const other = SCORED_ROLES.find((scored) => scored !== role) ?? role
    const alike = tickets.filter(
        (ticket) =>
            ticket.efforts[role] === effort &&
            ticket.review_effort === review_effort
    )
    const group = alike.filter((ticket) => ticket.models[role] === model)
    const finished = group.flatMap(({ joined, tokens }) =>
        joined && tokens !== null ? [tokens] : []
    )
    const baseline =
        model === 'opus'
            ? []
            : alike.filter(
                  ({ models, picks }) =>
                      models[role] === 'opus' &&
                      picks[role]?.shadow === true &&
                      picks[role]?.model === model
              )
    const side = sideOf(group)
    const baseline_side = sideOf(baseline)
    return {
        role,
        model,
        effort,
        review_effort,
        ...side,
        stuck_tickets: group.filter(({ stuck }) => stuck).length,
        tokens_per_finished_ticket:
            finished.length === 0 ? null : sum(finished) / finished.length,
        median_confidence: median(
            group.flatMap(({ picks }) => {
                const confidence = picks[role]?.confidence ?? null
                return confidence === null ? [] : [confidence]
            })
        ),
        other_role_cheaper: group.filter(({ models }) => {
            const ran = models[other]
            return ran !== undefined && ran !== 'opus'
        }).length,
        baseline: baseline_side,
        verdict:
            model === 'opus'
                ? null
                : verdictOf({ side, baseline: baseline_side }),
    }
}

/** The final review's findings per 100 changed lines over `runs`. */
const finalReviewOf = (runs: RunFacts[]): FinalReviewSide => {
    const reviewed = runs.filter(
        ({ final_findings }) => final_findings !== null
    )
    const rated = reviewed.filter(({ lines }) => lines !== null)
    const lines = sum(rated.map(({ lines }) => lines ?? 0))
    return {
        runs: reviewed.length,
        findings_per_100_lines:
            lines === 0
                ? null
                : (sum(rated.map(({ final_findings }) => final_findings ?? 0)) *
                      100) /
                  lines,
    }
}

/**
 * The model score report from run journals, each run's records oldest
 * first. A ticket counts under the model and effort of each role's first
 * agent on it (an agent from before #600, with no model, ran Opus; one from
 * before #659, with no effort, ran at high), and under its first ticket
 * review's effort. Pure.
 *
 * @example
 * const report = scoreModels({ runs: [createJournal({ file }).read()] })
 * console.log(formatModelReport({ report }))
 */
export const scoreModels = ({
    runs,
}: {
    runs: JournalRecord[][]
}): ModelReport => {
    const facts = runs.map(factsOf)
    const tickets = facts
        .flatMap((run) => run.tickets)
        .filter(({ models }) => Object.keys(models).length > 0)
    const levels = EffortLevelSchema.options
    const scores = SCORED_ROLES.flatMap((role) =>
        ModelNameSchema.options.flatMap((model) =>
            levels.flatMap((effort) =>
                levels.map((review_effort) =>
                    scoreOf({ tickets, role, model, effort, review_effort })
                )
            )
        )
    ).filter(({ tickets, baseline }) => tickets > 0 || baseline.tickets > 0)
    const learner = facts.flatMap((run) => run.learner)
    return {
        runs: runs.length,
        scores,
        effort_picks: SCORED_ROLES.map((role) =>
            effortPicksOf({ tickets, role })
        ),
        floor_only: SCORED_ROLES.filter((role) =>
            isFloorOnly({ tickets, role })
        ),
        learner: ModelNameSchema.options
            .flatMap((model) =>
                levels.map((effort) => ({
                    model,
                    effort,
                    agents: learner.filter(
                        (ran) => ran.model === model && ran.effort === effort
                    ).length,
                }))
            )
            .filter(({ agents }) => agents > 0),
        final_review: {
            routed: finalReviewOf(facts.filter(({ routed }) => routed)),
            not_routed: finalReviewOf(facts.filter(({ routed }) => !routed)),
        },
        without_lines_changed: tickets.filter(
            ({ joined, lines }) => joined && lines === null
        ).length,
    }
}

const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`

const decimal = (value: number | null): string =>
    value === null ? '-' : value.toFixed(2)

const sideText = (side: ScoreSide): string =>
    [
        plural(side.tickets, 'ticket'),
        `${decimal(side.findings_per_100_lines)} findings per 100 lines`,
        `${decimal(side.fix_rounds_per_ticket)} fix rounds per ticket`,
    ].join(', ')

const scoreText = (score: ModelScore): string[] => {
    const other = SCORED_ROLES.find((role) => role !== score.role)
    const tokens = score.tokens_per_finished_ticket
    return [
        `  ${score.model} at ${score.effort}: ${[
            sideText(score),
            `${score.stuck_tickets} stuck`,
            `${tokens === null ? '-' : Math.round(tokens)} tokens per finished ticket`,
            `median confidence ${decimal(score.median_confidence)}`,
            `${other} cheaper on ${score.other_role_cheaper}`,
            `reviewed at ${score.review_effort}`,
        ].join(', ')}`,
        ...(score.verdict === null
            ? []
            : [
                  `    baseline (Clef picked ${score.model} in shadow mode, ran opus at ${score.effort}): ${sideText(score.baseline)}`,
                  `    verdict: ${score.verdict}`,
              ]),
    ]
}

const effortPicksText = (picks: EffortPicks): string[] => [
    "  Clef's effort picks (shadow mode), every answer",
    `    wanted more effort than it ran at: ${sideText(picks.wanted_more)}`,
    `    the rest: ${sideText(picks.rest)}`,
    `    verdict: ${picks.verdict}`,
    "    by Clef's confidence:",
    ...picks.by_confidence.map(
        ({ band, wanted_more, rest }) =>
            `      ${band}: wanted more ${sideText(wanted_more)}; the rest ${sideText(rest)}`
    ),
]

const FLOOR_LINE =
    "  no cheaper model was ever tried: this role's floor is opus in every run. Set models.floors in .luca/config.json to let it."

/**
 * A role's model lines: for a floor-only role, its Opus lines and the floor
 * line in place of the rest.
 */
const scoresText = (scores: ModelScore[], floor_only: boolean): string[] => {
    if (scores.length === 0) return ['  no tickets yet']
    if (!floor_only) return scores.flatMap(scoreText)
    return [
        ...scores.filter(({ model }) => model === 'opus').flatMap(scoreText),
        FLOOR_LINE,
    ]
}

const finalText = (label: string, side: FinalReviewSide): string =>
    `${decimal(side.findings_per_100_lines)} ${label} (${plural(side.runs, 'run')})`

/**
 * The report as `luca models` prints it: each routed role's models and
 * efforts with their verdicts and Clef's effort picks, the learner, the
 * final review's line, and the tickets left out of the rates. Pure.
 *
 * @example
 * console.log(formatModelReport({ report: scoreModels({ runs }) }))
 */
export const formatModelReport = ({
    report,
}: {
    report: ModelReport
}): string => {
    const weights = `blocker ${FINDING_WEIGHTS.blocker}, should-fix ${FINDING_WEIGHTS.should_fix}, nit ${FINDING_WEIGHTS.nit}`
    const roles = SCORED_ROLES.flatMap((role) => {
        const scores = report.scores.filter((score) => score.role === role)
        const picks = report.effort_picks.find((found) => found.role === role)
        return [
            role,
            ...scoresText(scores, report.floor_only.includes(role)),
            ...(picks === undefined ? [] : effortPicksText(picks)),
        ]
    })
    const learner =
        report.learner.length === 0
            ? ''
            : ` (${report.learner.map(({ model, effort, agents }) => `${plural(agents, 'agent')} on ${model} at ${effort}`).join(', ')})`
    const { routed, not_routed } = report.final_review
    return [
        `Model scores from ${plural(report.runs, 'run')}: the first ticket review's findings weighted ${weights}, per 100 changed lines.`,
        'Each line is a model at an effort, compared only with tickets reviewed at the same effort.',
        '',
        ...roles,
        `learner: not measured by findings${learner}`,
        '',
        `Final review findings per 100 changed lines: ${finalText('with routed agents', routed)}, ${finalText('without', not_routed)}.`,
        `${plural(report.without_lines_changed, 'joined ticket')} with no lines_changed, left out of the rates.`,
    ].join('\n')
}
