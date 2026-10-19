import chunk from 'lodash/chunk'
import fromPairs from 'lodash/fromPairs'

import {
    CLEF_MAX_QUESTIONS,
    type JevFixed,
    type JevJob,
    type JevQuestion,
    type JevRequest,
} from './jev-schemas'

import type { Finding } from '../agents/role-results'
import type { EngineAction } from '../core/decide'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalRecord } from '../journal/journal-record'
import type { RunState } from '../journal/replay'

/**
 * The shadow-mode questions for Jev around each engine step. Pure: an action
 * or the records it appended in, asks out. Each ask carries the engine's own
 * fixed choice, which is what the engine really does.
 */

/** One call to make to Jev, and the engine's fixed answer to it. */
export type JevAsk = {
    job: JevJob
    /** The ticket the ask is about, `null` for the whole run. */
    ticket: number | null
    /** The agent role the ask is about, if any. */
    role: string | null
    request: JevRequest
    fixed: JevFixed
}

/** The models Jev may pick for an agent, by short name. */
export const JEV_MODEL_OPTIONS = ['opus', 'sonnet', 'haiku'] as const

/** The model the engine really uses for every agent. */
export const JEV_FIXED_MODEL = 'opus'

/**
 * The stock skills Jev may give an agent. The engine gives agents none, so
 * its fixed answer is no to each.
 */
export const JEV_CANDIDATE_SKILLS = [
    {
        skill: 'tdd',
        description: 'Test-driven development: red, green, refactor.',
    },
    {
        skill: 'systematic-debugging',
        description: 'Find the root cause of a bug before fixing it.',
    },
    {
        skill: 'codebase-design',
        description: 'Shape modules and their seams to fit the codebase.',
    },
    {
        skill: 'domain-modeling',
        description: "Use and sharpen the project's domain words.",
    },
] as const

/** The failure kinds Jev may pick, each with who fixes it. */
const FAILURE_KINDS = {
    code: 'The code is wrong; the implementer fixes it.',
    test: 'A test is wrong; the test-writer fixes it.',
    agent: "The agent's turn failed or its result was malformed.",
    clash: 'Tickets clash on the run branch.',
} as const

type FailureKind = keyof typeof FAILURE_KINDS

/** The severity scale for findings, lowest first. */
const SEVERITY_SCALE = ['nit', 'should_fix', 'blocker']

/** How much failure text Jev gets: the end, where errors usually are. */
export const JEV_FAILURE_TEXT_CHARS = 8000

const choice = ({
    instructions,
    options,
}: {
    instructions: string
    options: readonly string[]
}): JevQuestion => ({
    type: 'choice',
    instructions,
    criteria: fromPairs(options.map((option) => [option, null])),
})

const ticketKey = (number: number): string => `ticket_${number}`

/** A question id from any text: letters, digits, and underscores only. */
const questionId = (text: string): string => text.replace(/[^A-Za-z0-9_]/g, '_')

const ticketState = ({
    state,
    ticket,
}: {
    state: RunState
    ticket: number | null
}): Record<string, string> => {
    const snapshot = state.snapshot
    const found: TicketSnapshot | undefined =
        ticket === null ? undefined : snapshot?.tickets[ticket]
    return {
        spec: snapshot?.spec.title ?? '',
        ...(found === undefined
            ? {}
            : { ticket: `#${found.number} ${found.title}`, body: found.body }),
    }
}

const createTicketWorktreeAsks = ({
    state,
    ticket,
}: {
    state: RunState
    ticket: number
}): JevAsk[] => {
    const snapshot = state.snapshot
    const candidates = (snapshot?.ticket_order ?? []).flatMap((number) => {
        const found = snapshot?.tickets[number]
        if (found === undefined) return []
        if ((state.tickets[number]?.worktree ?? null) !== null) return []
        return [found]
    })
    const candidateList = candidates
        .map(({ number, title, blockers }) => {
            const blockedBy =
                blockers.length === 0
                    ? 'none'
                    : blockers.map((blocker) => `#${blocker}`).join(', ')
            return `${ticketKey(number)}: #${number} ${title} (blocked by: ${blockedBy})`
        })
        .join('\n')
    const base = ticketState({ state, ticket })
    // With one ticket left the order is obvious, and Clef refuses a
    // one-option choice (#546), so there's nothing to ask.
    const orderAsk: JevAsk[] =
        candidates.length < 2
            ? []
            : [
                  {
                      job: 'ticket_order',
                      ticket,
                      role: null,
                      request: {
                          state: { ...base, candidates: candidateList },
                          questions: {
                              next: choice({
                                  instructions:
                                      'Which of these tickets should be built next?',
                                  options: candidates.map(({ number }) =>
                                      ticketKey(number)
                                  ),
                              }),
                          },
                      },
                      fixed: { next: ticketKey(ticket) },
                  },
              ]
    return orderAsk
}

/**
 * Which model a fresh agent of a routed role should run on: the ticket's
 * facts, the role, and which try this is (#602).
 */
const agentModelAsk = ({
    state,
    ticket,
    role,
    attempt,
}: {
    state: RunState
    ticket: number | null
    role: string
    attempt: number
}): JevAsk => ({
    job: 'agent_model',
    ticket,
    role,
    request: {
        state: {
            ...ticketState({ state, ticket }),
            role,
            try: String(attempt),
        },
        questions: {
            model: choice({
                instructions: `Which model should the ${role} agent run on? Pick the cheapest that will get it right.`,
                options: JEV_MODEL_OPTIONS,
            }),
        },
    },
    fixed: { model: JEV_FIXED_MODEL },
})

const agentSkillsAsk = ({
    state,
    ticket,
    role,
}: {
    state: RunState
    ticket: number
    role: string
}): JevAsk => ({
    job: 'agent_skills',
    ticket,
    role,
    request: {
        state: { ...ticketState({ state, ticket }), role },
        questions: fromPairs(
            JEV_CANDIDATE_SKILLS.map(({ skill, description }) => [
                questionId(skill),
                {
                    type: 'noul',
                    instructions: `Should the ${role} agent on this ticket get the ${skill} skill? ${description}`,
                },
            ])
        ),
    },
    fixed: fromPairs(
        JEV_CANDIDATE_SKILLS.map(({ skill }) => [questionId(skill), false])
    ),
})

/** The roles whose fresh agents get an `agent_model` ask on a ticket. */
const ROUTED_TICKET_ROLES: readonly string[] = ['test-writer', 'implementer']

/**
 * The asks to make before the engine carries out `action`: ticket order
 * before a ticket starts, skills before each agent, and the model before
 * each fresh test-writer, implementer, and learner.
 */
export const jevAsksBefore = ({
    action,
    state,
}: {
    action: EngineAction
    state: RunState
}): JevAsk[] => {
    switch (action.type) {
        case 'create_ticket_worktree':
            return createTicketWorktreeAsks({ state, ticket: action.ticket })
        case 'launch_agent': {
            const { ticket, role } = action
            const failed = state.tickets[ticket]?.failed_tries[role] ?? 0
            return [
                ...(ROUTED_TICKET_ROLES.includes(role)
                    ? [
                          agentModelAsk({
                              state,
                              ticket,
                              role,
                              attempt: failed + 1,
                          }),
                      ]
                    : []),
                agentSkillsAsk({ state, ticket, role }),
            ]
        }
        case 'launch_learner':
            return [
                agentModelAsk({
                    state,
                    ticket: null,
                    role: 'learner',
                    attempt: state.memory.learner.failed_tries + 1,
                }),
            ]
        default:
            return []
    }
}

/** A failure record's text and the kind the engine's routing gives it. */
const failureOf = (
    record: JournalRecord
): { kind: FailureKind; text: string } | null => {
    switch (record.kind) {
        case 'gates_run': {
            if (record.content.ok) return null
            const text = record.content.checks
                .filter(({ ok }) => !ok)
                .map(({ name, output }) => `${name} failed:\n${output}`)
                .join('\n\n')
            // Gates after a join: a clash. A ticket's, or the final
            // review's fixes (no ticket): the code.
            const joined =
                record.content.target === 'run_branch' && record.ticket !== null
            return { kind: joined ? 'clash' : 'code', text }
        }
        case 'red_check':
            return record.content.ok
                ? null
                : { kind: 'test', text: record.content.problems.join('\n') }
        case 'agent_failed':
            // The learner fixes nothing, so its failures have no kind to ask about.
            if (record.content.role === 'learner') return null
            return {
                kind: 'agent',
                text: `The ${record.content.role} failed: ${record.content.error}`,
            }
        case 'ticket_joined':
            return record.content.ok
                ? null
                : { kind: 'clash', text: record.content.error }
        default:
            return null
    }
}

const failureAsk = ({
    record,
    state,
}: {
    record: JournalRecord
    state: RunState
}): JevAsk | null => {
    const failure = failureOf(record)
    if (failure === null) return null
    return {
        job: 'failure_kind',
        ticket: record.ticket,
        role: record.role,
        request: {
            state: {
                ...ticketState({ state, ticket: record.ticket }),
                step: record.kind,
                failure: failure.text.slice(-JEV_FAILURE_TEXT_CHARS),
            },
            questions: {
                kind: {
                    type: 'choice',
                    instructions: `What kind of failure is this? ${Object.entries(
                        FAILURE_KINDS
                    )
                        .map(([kind, meaning]) => `${kind}: ${meaning}`)
                        .join(' ')}`,
                    criteria: fromPairs(
                        Object.keys(FAILURE_KINDS).map((kind) => [kind, null])
                    ),
                },
            },
        },
        fixed: { kind: failure.kind },
    }
}

const findingText = ({ title, detail, file }: Finding): string =>
    [title, file === null ? null : `File: ${file}`, detail]
        .filter((part) => part !== null && part !== '')
        .join('\n')

/**
 * The severity of each finding a ticket reviewer reported, at most
 * `CLEF_MAX_QUESTIONS` findings to an ask, since Clef takes no more.
 */
const findingSeverityAsks = ({
    record,
    state,
}: {
    record: JournalRecord
    state: RunState
}): JevAsk[] => {
    if (record.kind !== 'agent_finished') return []
    if (record.content.role !== 'ticket-reviewer') return []
    return chunk(record.content.result.findings, CLEF_MAX_QUESTIONS).map(
        (findings) => findingSeverityAsk({ record, state, findings })
    )
}

const findingSeverityAsk = ({
    record,
    state,
    findings,
}: {
    record: JournalRecord
    state: RunState
    findings: Finding[]
}): JevAsk => {
    const key = (finding: Finding) => `finding_${questionId(finding.id)}`
    return {
        job: 'finding_severity',
        ticket: record.ticket,
        role: record.role,
        request: {
            state: {
                ...ticketState({ state, ticket: record.ticket }),
                ...fromPairs(
                    findings.map((finding) => [
                        key(finding),
                        findingText(finding),
                    ])
                ),
            },
            questions: fromPairs(
                findings.map((finding) => [
                    key(finding),
                    {
                        type: 'score',
                        instructions: `How severe is the reviewer's finding ${key(finding)}?`,
                        criteria: SEVERITY_SCALE,
                    },
                ])
            ),
        },
        fixed: fromPairs(
            findings.map((finding) => [key(finding), finding.severity])
        ),
    }
}

/**
 * The asks to make over the records a step just appended: the kind of each
 * failure, and the severity of each finding a ticket reviewer reported.
 * Jev's own records are skipped.
 */
export const jevAsksAfter = ({
    records,
    state,
}: {
    records: JournalRecord[]
    state: RunState
}): JevAsk[] =>
    records.flatMap((record) => {
        const failure = failureAsk({ record, state })
        return [
            ...(failure === null ? [] : [failure]),
            ...findingSeverityAsks({ record, state }),
        ]
    })
