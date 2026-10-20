/**
 * Fixtures shared by the run budget decision tests (#435, #543): a run with
 * a budget in its engine config, agent turns that count their tokens per
 * model, and the run stuck on its budget with the spec issue told.
 */
import {
    intakePassed,
    practiceTicket,
    runBranchCreated,
    SESSIONS,
    ticketBuilt,
    withInstalls,
} from './build-fixtures'
import { recordsFrom } from './intake-fixtures'

import type { AgentRole } from '../agents/role-results'
import { decideSteps } from '../core/decide'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'

export const SUM = practiceTicket({ number: 11, title: 'Add sum' })
export const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })

/** The budget the tests give the run in its engine config. */
export const BUDGET = 50_000

type Tokens = {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
}

export const tokens = (
    input: number,
    output: number,
    cache_read: number,
    cache_creation: number
): Tokens => ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cache_read,
    cache_creation_input_tokens: cache_creation,
})

export const OPUS = 'claude-opus-5-5'
export const HAIKU = 'claude-haiku-4-5-20251001'

/** One agent turn's session, with its tokens per model. */
export const turnSession = ({
    ticket,
    role,
    model_usage,
}: {
    ticket: number | null
    role: AgentRole
    model_usage: Record<string, Tokens>
}): JournalEntry => ({
    kind: 'agent_session',
    ticket,
    role,
    content: {
        role,
        session: {
            session_id: SESSIONS[role],
            usage: tokens(0, 0, 0, 0),
            model_usage,
            rate_limit_events: [],
            billing_error: false,
        },
    },
})

/** A turn that counts exactly `counted` tokens, all output, on Opus. */
export const turnOf = ({
    ticket,
    role,
    counted,
}: {
    ticket: number
    role: AgentRole
    counted: number
}): JournalEntry =>
    turnSession({
        ticket,
        role,
        model_usage: { [OPUS]: tokens(0, counted, 0, 0) },
    })

/**
 * The decision step's actions for a run with these tickets and entries
 * after intake. `budget` is the config's `run_budget_tokens`; leave it out
 * for a config without one.
 */
export const stepsAfter = ({
    tickets,
    entries,
    budget,
}: {
    tickets: TicketSnapshot[]
    entries: JournalEntry[]
    budget?: number
}) =>
    decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets }).map(
                    (entry): JournalEntry =>
                        entry.kind === 'run_started' && budget !== undefined
                            ? {
                                  ...entry,
                                  content: {
                                      ...entry.content,
                                      config: {
                                          ...entry.content.config,
                                          run_budget_tokens: budget,
                                      },
                                  },
                              }
                            : entry
                ),
                ...withInstalls({ entries }),
            ],
        }),
    })

export const oneSteps = (entries: JournalEntry[], budget: number | undefined) =>
    stepsAfter({ tickets: [SUM], entries, budget })

/** #11's worktree, baseline, and tests written: its red check is next. */
export const sumWritten = (): JournalEntry[] =>
    ticketBuilt({ ticket: 11 }).slice(0, 3)

/** #11 with its tests written, and its test-writer's turn counting `counted`. */
export const sumSpent = (counted: number): JournalEntry[] => [
    runBranchCreated(),
    ...sumWritten(),
    turnOf({ ticket: 11, role: 'test-writer', counted }),
]

/** The run went stuck on its budget. */
export const runStuck = (): JournalEntry => ({
    kind: 'run_stuck',
    ticket: null,
    role: null,
    content: {
        reason: 'run_budget',
        detail: `The run used ${BUDGET} tokens of its ${BUDGET} budget.`,
    },
})

/** The engine told the spec issue the run is stuck, in comment 150. */
export const runStuckReported = (): JournalEntry => ({
    kind: 'stuck_reported',
    ticket: null,
    role: null,
    content: { comment_id: 150, body: 'stuck' },
})

/** #11 used the whole budget; the run is stuck and the spec issue told. */
export const told = (): JournalEntry[] => [
    ...sumSpent(BUDGET),
    runStuck(),
    runStuckReported(),
]
