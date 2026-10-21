import {
    EFFORT_BEFORE_JOURNALED,
    FINDING_WEIGHTS,
    SCORED_ROLES,
    type ScoredRole,
} from './model-score-constants'

import type { FindingSeverity } from '../agents/role-results'
import {
    ModelNameSchema,
    type Effort,
    type ModelName,
} from '../config/engine-config'
import type { JournalRecord } from '../journal/journal-record'
import { countedTokens } from '../limits/plan-usage'

/**
 * What a run journal says for the model score report (#605): each ticket's
 * models, efforts, Clef's picks, first-review findings and fix rounds, and
 * the run's final review. Pure: it reads records and never writes.
 */

/** Clef's first model pick for a role on a ticket. */
type Pick = {
    model: ModelName | null
    confidence: number | null
    /** Asked in shadow mode: `acted: false`, or an older `ticket_model` ask. */
    shadow: boolean
}

/** What one run's journal says about one ticket. */
export type TicketFacts = {
    /** The model of each role's first agent. */
    models: Partial<Record<ScoredRole, ModelName>>
    /** The effort of each role's first agent. */
    efforts: Partial<Record<ScoredRole, Effort>>
    picks: Partial<Record<ScoredRole, Pick>>
    /** The first ticket review's effort; `null` before one starts. */
    review_effort: Effort | null
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
export type RunFacts = {
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

export const sum = (values: number[]): number =>
    values.reduce((total, value) => total + value, 0)

const weigh = (counts: Record<FindingSeverity, number>): number =>
    counts.blocker * FINDING_WEIGHTS.blocker +
    counts.should_fix * FINDING_WEIGHTS.should_fix +
    counts.nit * FINDING_WEIGHTS.nit

const newTicket = (): TicketFacts => ({
    models: {},
    efforts: {},
    picks: {},
    review_effort: null,
    reviews: 0,
    findings: 0,
    fix_rounds: 0,
    joined: false,
    lines: null,
    stuck: false,
    tokens: null,
})

/**
 * What one run's records say, ticket by ticket. An agent with no effort,
 * from before #659, ran at `EFFORT_BEFORE_JOURNALED`.
 */
export const factsOf = (records: JournalRecord[]): RunFacts => {
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
                const { role, model, follow_up_of, effort } = record.content
                const family = familyOf(model) ?? 'opus'
                const ran = effort ?? EFFORT_BEFORE_JOURNALED
                if (follow_up_of !== null) break
                if (role === 'learner') learner.push(family)
                if (isScored(role) || role === 'learner') {
                    routed ||= family !== 'opus'
                }
                if (record.ticket === null) break
                const facts = ticketOf(record.ticket)
                if (isScored(role)) {
                    facts.models[role] ??= family
                    facts.efforts[role] ??= ran
                }
                if (role === 'ticket-reviewer') facts.review_effort ??= ran
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
