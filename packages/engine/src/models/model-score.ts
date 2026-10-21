import {
    EFFORT_BEFORE_JOURNALED,
    EPSILON,
    FINDING_WEIGHTS,
    MIN_TICKETS,
    SCORED_ROLES,
    WORSE_BY,
    type ScoredRole,
} from './model-score-constants'
import {
    factsOf,
    sum,
    type RunFacts,
    type TicketFacts,
} from './model-score-facts'

import {
    EffortSchema,
    ModelNameSchema,
    type Effort,
    type ModelName,
} from '../config/engine-config'
import type { JournalRecord } from '../journal/journal-record'

export {
    EFFORT_BEFORE_JOURNALED,
    FINDING_WEIGHTS,
    MIN_TICKETS,
    SCORED_ROLES,
    WORSE_BY,
    type ScoredRole,
} from './model-score-constants'

/**
 * The model score report (#605): how good each routed role's work was on
 * each model and effort it ran at, from run journals, so the owner knows
 * when to lower a model floor or raise one back. A ticket is compared only
 * with tickets whose ticket review ran at the same effort (#662). It also
 * checks whether Clef's effort picks spot hard tickets (#663). Pure: it
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
    effort: Effort
    /** The effort its tickets' first ticket review ran at. */
    review_effort: Effort
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

/** The final review's findings over a set of runs. */
export type FinalReviewSide = {
    runs: number
    findings_per_100_lines: number | null
}

export type EffortPicksVerdict =
    | 'not enough data'
    | 'Clef spots hard tickets'
    | 'no sign yet'

/**
 * Clef's `agent_effort` answers for one writer role, in shadow mode (#663),
 * counting only answers at or above the confidence bar.
 */
export type EffortPicks = {
    role: ScoredRole
    /** The tickets where Clef wanted more effort than the role ran at. */
    wanted_more: ScoreSide
    /** The tickets where it wanted the same effort or less. */
    rest: ScoreSide
    verdict: EffortPicksVerdict
}

export type ModelReport = {
    runs: number
    scores: ModelScore[]
    effort_picks: EffortPicks[]
    /** Fresh learner agents per model; the learner isn't scored. */
    learner: { model: ModelName; agents: number }[]
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
    if (side.tickets < MIN_TICKETS || baseline.tickets < MIN_TICKETS) {
        return 'not enough data'
    }
    const worse =
        above(side.findings_per_100_lines, baseline.findings_per_100_lines) ||
        above(side.fix_rounds_per_ticket, baseline.fix_rounds_per_ticket)
    return worse ? 'worse' : 'about the same'
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
    effort: Effort
    review_effort: Effort
}): ModelScore => {
    const other = SCORED_ROLES.find((scored) => scored !== role) ?? role
    const alike = tickets.filter(
        (ticket) =>
            ticket.efforts[role] === effort &&
            (ticket.review_effort ?? EFFORT_BEFORE_JOURNALED) === review_effort
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

/** Clef's effort picks read as the model verdict's rules read a baseline. */
const EFFORT_PICKS_VERDICTS: Record<Verdict, EffortPicksVerdict> = {
    'not enough data': 'not enough data',
    worse: 'Clef spots hard tickets',
    'about the same': 'no sign yet',
}

const rank = (effort: Effort): number => EffortSchema.options.indexOf(effort)

/**
 * The tickets where Clef's effort answer for `role` was higher than the
 * effort its first agent ran at, against the rest, judged as a cheaper
 * model is against its baseline. Tickets with no answer are in neither.
 */
const effortPicksOf = ({
    tickets,
    role,
}: {
    tickets: TicketFacts[]
    role: ScoredRole
}): EffortPicks => {
    const answered = tickets.flatMap((ticket) => {
        const pick = ticket.effort_picks[role]
        const ran = ticket.efforts[role]
        return pick === undefined || ran === undefined
            ? []
            : [{ ticket, wanted_more: rank(pick) > rank(ran) }]
    })
    const wanted_more = sideOf(
        answered.filter((one) => one.wanted_more).map(({ ticket }) => ticket)
    )
    const rest = sideOf(
        answered.filter((one) => !one.wanted_more).map(({ ticket }) => ticket)
    )
    return {
        role,
        wanted_more,
        rest,
        verdict:
            EFFORT_PICKS_VERDICTS[
                verdictOf({ side: wanted_more, baseline: rest })
            ],
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
 * agent on it and its first ticket review's effort (an agent from before
 * #600, with no model, ran Opus; one from before #659, with no effort, ran
 * at high). Pure.
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
    const scores = SCORED_ROLES.flatMap((role) =>
        ModelNameSchema.options.flatMap((model) =>
            EffortSchema.options.flatMap((effort) =>
                EffortSchema.options.map((review_effort) =>
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
        learner: ModelNameSchema.options
            .map((model) => ({
                model,
                agents: learner.filter((ran) => ran === model).length,
            }))
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
            `ticket review at ${score.review_effort}`,
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
    "  Clef's effort picks (shadow mode), answers at or above the confidence bar:",
    `    wanted more effort than it ran at: ${sideText(picks.wanted_more)}`,
    `    the rest: ${sideText(picks.rest)}`,
    `    verdict: ${picks.verdict}`,
]

const finalText = (label: string, side: FinalReviewSide): string =>
    `${decimal(side.findings_per_100_lines)} ${label} (${plural(side.runs, 'run')})`

/**
 * The report as `luca models` prints it: each routed role's models and
 * efforts with their verdicts, Clef's effort picks for each, the learner,
 * the final review's line, and
 * the tickets left out of the rates. Pure.
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
        return [
            role,
            ...(scores.length === 0
                ? ['  no tickets yet']
                : scores.flatMap(scoreText)),
            ...report.effort_picks
                .filter((picks) => picks.role === role)
                .flatMap(effortPicksText),
        ]
    })
    const learner =
        report.learner.length === 0
            ? ''
            : ` (${report.learner.map(({ model, agents }) => `${plural(agents, 'agent')} on ${model}`).join(', ')})`
    const { routed, not_routed } = report.final_review
    return [
        `Model scores from ${plural(report.runs, 'run')}: the first ticket review's findings weighted ${weights}, per 100 changed lines.`,
        '',
        ...roles,
        `learner: not measured by findings${learner}`,
        '',
        `Final review findings per 100 changed lines: ${finalText('with routed agents', routed)}, ${finalText('without', not_routed)}.`,
        `${plural(report.without_lines_changed, 'joined ticket')} with no lines_changed, left out of the rates.`,
    ].join('\n')
}
