import {
    EFFORT_BEFORE_659,
    FINDING_WEIGHTS,
    SCORED_ROLES,
    type ScoredRole,
} from './model-score-rules'

import type { FindingSeverity } from '../agents/role-results'
import {
    EffortLevelSchema,
    ModelNameSchema,
    type EffortLevel,
    type ModelName,
} from '../config/engine-config'
import type { ModelReason } from '../jev/model-pick'
import type { JournalRecord } from '../journal/journal-record'
import { countedTokens } from '../limits/plan-usage'

/**
 * What one run's journal says for the model score report (#605): each
 * ticket's models, efforts, Clef's picks and review results, the learner's
 * agents, and the final review's findings. Pure: it only reads records.
 */

/** Clef's first model pick for a role on a ticket. */
export type Pick = {
    model: ModelName | null
    confidence: number | null
    /** Asked in shadow mode: `acted: false`, or an older `ticket_model` ask. */
    shadow: boolean
}

/** Clef's effort pick for a role on a ticket, with its confidence. */
export type EffortPick = { effort: EffortLevel; confidence: number }

/** What one run's journal says about one ticket. */
export type TicketFacts = {
    /** The model of each role's first agent. */
    models: Partial<Record<ScoredRole, ModelName>>
    /** The effort of each role's first agent, an older one's `high`. */
    efforts: Partial<Record<ScoredRole, EffortLevel>>
    /** The first ticket review's effort, `high` when none is journaled. */
    review_effort: EffortLevel
    picks: Partial<Record<ScoredRole, Pick>>
    /**
     * Clef's first `agent_effort` answer for each role that has a
     * confidence, at any confidence (#697).
     */
    effort_picks: Partial<Record<ScoredRole, EffortPick>>
    /**
     * Why each role's first agent got its model; `null` for one from before
     * #603.
     */
    model_reasons: Partial<Record<ScoredRole, ModelReason | null>>
    reviews: number
    /** The first ticket review's weighted findings. */
    findings: number
    fix_rounds: number
    joined: boolean
    lines: number | null
    stuck: boolean
    tokens: number | null
}

/** A fresh learner agent's model and effort. */
export type LearnerRun = { model: ModelName; effort: EffortLevel }

/** What one run's journal says. */
export type RunFacts = {
    tickets: TicketFacts[]
    routed: boolean
    learner: LearnerRun[]
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

export const sum = (values: number[]): number =>
    values.reduce((total, value) => total + value, 0)

const weigh = (counts: Record<FindingSeverity, number>): number =>
    counts.blocker * FINDING_WEIGHTS.blocker +
    counts.should_fix * FINDING_WEIGHTS.should_fix +
    counts.nit * FINDING_WEIGHTS.nit

const newTicket = (): TicketFacts => ({
    models: {},
    efforts: {},
    review_effort: EFFORT_BEFORE_659,
    picks: {},
    effort_picks: {},
    model_reasons: {},
    reviews: 0,
    findings: 0,
    fix_rounds: 0,
    joined: false,
    lines: null,
    stuck: false,
    tokens: null,
})

/**
 * What one run's records say, ticket by ticket. An agent with no model ran
 * Opus (before #600), and one with no effort ran at `high` (before #659).
 */
export const factsOf = (records: JournalRecord[]): RunFacts => {
    const tickets = new Map<number, TicketFacts>()
    const ticketOf = (number: number): TicketFacts => {
        const found = tickets.get(number) ?? newTicket()
        tickets.set(number, found)
        return found
    }
    const asks = new Map<number, { role: string | null; shadow: boolean }>()
    const effort_asks = new Map<number, string | null>()
    const reviewed = new Set<number>()
    const learner: LearnerRun[] = []
    let routed = false
    let final_rounds = 0
    let final_findings = 0
    for (const record of records) {
        switch (record.kind) {
            case 'jev_asked':
                if (record.content.job === 'agent_effort') {
                    effort_asks.set(record.seq, record.role)
                }
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
                const effort_role = effort_asks.get(record.content.asked_seq)
                if (effort_role !== undefined && record.ticket !== null) {
                    const answer = record.content.answers.effort
                    const level = EffortLevelSchema.safeParse(answer?.value)
                    const confidence = answer?.confidence ?? null
                    if (
                        isScored(effort_role) &&
                        level.success &&
                        confidence !== null
                    ) {
                        ticketOf(record.ticket).effort_picks[effort_role] ??= {
                            effort: level.data,
                            confidence,
                        }
                    }
                    break
                }
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
                const { role, model, effort, follow_up_of, model_reason } =
                    record.content
                const family = familyOf(model) ?? 'opus'
                const level = effort ?? EFFORT_BEFORE_659
                if (follow_up_of !== null) break
                if (role === 'learner') {
                    learner.push({ model: family, effort: level })
                }
                if (isScored(role) || role === 'learner') {
                    routed ||= family !== 'opus'
                }
                if (record.ticket === null) break
                if (isScored(role)) {
                    const facts = ticketOf(record.ticket)
                    if (facts.models[role] === undefined) {
                        facts.models[role] = family
                        facts.efforts[role] = level
                        facts.model_reasons[role] = model_reason
                    }
                }
                if (
                    role === 'ticket-reviewer' &&
                    !reviewed.has(record.ticket)
                ) {
                    reviewed.add(record.ticket)
                    ticketOf(record.ticket).review_effort = level
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
