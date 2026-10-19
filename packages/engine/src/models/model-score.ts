import type { FindingSeverity } from '../agents/role-results'
import { ModelNameSchema, type ModelName } from '../config/engine-config'
import type { JournalRecord } from '../journal/journal-record'
import { countedTokens } from '../limits/plan-usage'

/**
 * The model score report (#605): how good each routed role's work was on
 * each model it ran on, from run journals, so the owner knows when to lower
 * a model floor or raise one back. Pure: it reads records and never writes.
 */

/** How much each ticket review finding weighs. */
export const FINDING_WEIGHTS: Record<FindingSeverity, number> = {
    blocker: 3,
    should_fix: 1,
    nit: 0,
}

/** The fewest tickets on each side before a verdict is given. */
export const MIN_TICKETS = 10

/** How far above the baseline a rate may be before it is "worse". */
export const WORSE_BY = 0.2

/** Rounding slack when a rate is compared with the baseline's. */
const EPSILON = 1e-9

/** The roles scored by the ticket review's findings. */
export const SCORED_ROLES = ['test-writer', 'implementer'] as const

export type ScoredRole = (typeof SCORED_ROLES)[number]

export type Verdict = 'not enough data' | 'worse' | 'about the same'

/** The rates a model is judged by, for its tickets or its baseline's. */
export type ScoreSide = {
    tickets: number
    /** Weighted first-review findings per 100 changed lines; `null` with no lines. */
    findings_per_100_lines: number | null
    /** `null` with no tickets. */
    fix_rounds_per_ticket: number | null
}

/** One routed role on one model. */
export type ModelScore = ScoreSide & {
    role: ScoredRole
    model: ModelName
    stuck_tickets: number
    /** `null` when no finished ticket has its usage journaled. */
    tokens_per_finished_ticket: number | null
    /** Clef's median confidence in its model pick; `null` with none. */
    median_confidence: number | null
    /** Its tickets whose other build role ran on a cheaper model than Opus. */
    other_role_cheaper: number
    /**
     * The tickets where Clef picked this model in shadow mode but the role
     * ran Opus. Empty for Opus.
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

export type ModelReport = {
    runs: number
    scores: ModelScore[]
    /** Fresh learner agents per model; the learner isn't scored. */
    learner: { model: ModelName; agents: number }[]
    /** Runs with any agent on a cheaper model, and runs without. */
    final_review: { routed: FinalReviewSide; not_routed: FinalReviewSide }
    /** Joined tickets with no `lines_changed`, left out of the rates. */
    without_lines_changed: number
}

/** Clef's first model pick for a role on a ticket. */
type Pick = {
    model: ModelName | null
    confidence: number | null
    /** Asked in shadow mode: `acted: false`, or an older `ticket_model` ask. */
    shadow: boolean
}

/** What one run's journal says about one ticket. */
type TicketFacts = {
    /** The model of each role's first agent. */
    models: Partial<Record<ScoredRole, ModelName>>
    picks: Partial<Record<ScoredRole, Pick>>
    reviews: number
    /** The first ticket review's weighted findings. */
    findings: number
    fix_rounds: number
    joined: boolean
    lines: number | null
    stuck: boolean
    tokens: number | null
}

/** What one run's journal says. */
type RunFacts = {
    tickets: TicketFacts[]
    routed: boolean
    learner: ModelName[]
    /** The first final review round's weighted findings, or `null` with none. */
    final_findings: number | null
    /** The joined tickets' lines, or `null` when one has none. */
    lines: number | null
}

/**
 * The model family a short name or full model id (as older `ticket_model`
 * asks named them) belongs to, or `null` for none.
 *
 * @example
 * familyOf('sonnet') // 'sonnet'
 */
const familyOf = (name: unknown): ModelName | null => {
    if (typeof name !== 'string') return null
    const lower = name.toLowerCase()
    return (
        ModelNameSchema.options.find((model) => lower.includes(model)) ?? null
    )
}

const isScored = (role: string | null): role is ScoredRole =>
    SCORED_ROLES.some((scored) => scored === role)

const sum = (values: number[]): number =>
    values.reduce((total, value) => total + value, 0)

const median = (values: number[]): number | null => {
    if (values.length === 0) return null
    const sorted = values.toSorted((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
        ? (sorted[middle] ?? null)
        : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

const weigh = (counts: Record<FindingSeverity, number>): number =>
    counts.blocker * FINDING_WEIGHTS.blocker +
    counts.should_fix * FINDING_WEIGHTS.should_fix +
    counts.nit * FINDING_WEIGHTS.nit

const newTicket = (): TicketFacts => ({
    models: {},
    picks: {},
    reviews: 0,
    findings: 0,
    fix_rounds: 0,
    joined: false,
    lines: null,
    stuck: false,
    tokens: null,
})

/** What one run's records say, ticket by ticket. */
const factsOf = (records: JournalRecord[]): RunFacts => {
    const tickets = new Map<number, TicketFacts>()
    const ticketOf = (number: number): TicketFacts => {
        const found = tickets.get(number) ?? newTicket()
        tickets.set(number, found)
        return found
    }
    const asks = new Map<number, { role: string | null; shadow: boolean }>()
    const learner: ModelName[] = []
    let routed = false
    let final_rounds = 0
    let final_findings = 0
    for (const record of records) {
        switch (record.kind) {
            case 'jev_asked':
                if (
                    record.content.job === 'agent_model' ||
                    record.content.job === 'ticket_model'
                ) {
                    asks.set(record.seq, {
                        role: record.role,
                        shadow:
                            record.content.job === 'ticket_model' ||
                            !record.content.acted,
                    })
                }
                break
            case 'jev_answered': {
                const ask = asks.get(record.content.asked_seq)
                if (ask === undefined || record.ticket === null) break
                const answer = record.content.answers.model
                const pick: Pick = {
                    model: familyOf(answer?.value),
                    confidence: answer?.confidence ?? null,
                    shadow: ask.shadow,
                }
                const roles =
                    record.content.job === 'ticket_model'
                        ? SCORED_ROLES
                        : SCORED_ROLES.filter((role) => role === ask.role)
                const facts = ticketOf(record.ticket)
                for (const role of roles) facts.picks[role] ??= pick
                break
            }
            case 'agent_started': {
                const { role, model, follow_up_of } = record.content
                const family = familyOf(model) ?? 'opus'
                if (follow_up_of !== null) break
                if (role === 'learner') learner.push(family)
                if (isScored(role) || role === 'learner') {
                    routed ||= family !== 'opus'
                }
                if (isScored(role) && record.ticket !== null) {
                    ticketOf(record.ticket).models[role] ??= family
                }
                break
            }
            case 'agent_finished': {
                const { content } = record
                if (
                    content.role !== 'ticket-reviewer' ||
                    record.ticket === null
                ) {
                    break
                }
                const facts = ticketOf(record.ticket)
                if (facts.reviews === 0) {
                    facts.findings = sum(
                        content.result.findings.map(
                            ({ severity }) => FINDING_WEIGHTS[severity]
                        )
                    )
                }
                facts.reviews += 1
                if (content.result.verdict === 'changes_requested') {
                    facts.fix_rounds += 1
                }
                break
            }
            case 'ticket_joined':
                if (record.ticket !== null && record.content.ok) {
                    const facts = ticketOf(record.ticket)
                    facts.joined = true
                    facts.lines = record.content.lines_changed
                }
                break
            case 'ticket_stuck':
                if (record.ticket !== null) ticketOf(record.ticket).stuck = true
                break
            case 'usage_recorded': {
                const { scope, ticket, tokens } = record.content
                if (scope === 'ticket' && ticket !== null) {
                    ticketOf(ticket).tokens = countedTokens({ tokens })
                }
                break
            }
            case 'final_review_started':
                final_rounds += 1
                break
            case 'lens_finished':
                if (final_rounds === 1) {
                    final_findings += weigh(record.content.findings)
                }
                break
            default:
                break
        }
    }
    const joined = [...tickets.values()].filter(({ joined }) => joined)
    return {
        tickets: [...tickets.values()],
        routed,
        learner,
        final_findings: final_rounds > 0 ? final_findings : null,
        lines: joined.some(({ lines }) => lines === null)
            ? null
            : sum(joined.map(({ lines }) => lines ?? 0)),
    }
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

/** One routed role on one model, over every run's tickets. */
const scoreOf = ({
    tickets,
    role,
    model,
}: {
    tickets: TicketFacts[]
    role: ScoredRole
    model: ModelName
}): ModelScore => {
    const other = SCORED_ROLES.find((scored) => scored !== role) ?? role
    const group = tickets.filter((ticket) => ticket.models[role] === model)
    const finished = group.flatMap(({ joined, tokens }) =>
        joined && tokens !== null ? [tokens] : []
    )
    const baseline =
        model === 'opus'
            ? []
            : tickets.filter(
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
 * first. A ticket counts under the model of each role's first agent on it
 * (an agent from before #600, with no model, ran Opus). Pure.
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
        ModelNameSchema.options.map((model) =>
            scoreOf({ tickets, role, model })
        )
    ).filter(({ tickets, baseline }) => tickets > 0 || baseline.tickets > 0)
    const learner = facts.flatMap((run) => run.learner)
    return {
        runs: runs.length,
        scores,
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
        `  ${score.model}: ${[
            sideText(score),
            `${score.stuck_tickets} stuck`,
            `${tokens === null ? '-' : Math.round(tokens)} tokens per finished ticket`,
            `median confidence ${decimal(score.median_confidence)}`,
            `${other} cheaper on ${score.other_role_cheaper}`,
        ].join(', ')}`,
        ...(score.verdict === null
            ? []
            : [
                  `    baseline (Clef picked ${score.model} in shadow mode, ran opus): ${sideText(score.baseline)}`,
                  `    verdict: ${score.verdict}`,
              ]),
    ]
}

const finalText = (label: string, side: FinalReviewSide): string =>
    `${decimal(side.findings_per_100_lines)} ${label} (${plural(side.runs, 'run')})`

/**
 * The report as `luca models` prints it: each routed role's models with
 * their verdicts, the learner, the final review's line, and the tickets
 * left out of the rates. Pure.
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
