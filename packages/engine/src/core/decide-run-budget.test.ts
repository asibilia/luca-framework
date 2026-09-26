import { describe, expect, test } from 'bun:test'

import { decideSteps } from './decide'

import type { AgentRole } from '../agents/role-results'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import { DEFAULT_RUN_BUDGET_TOKENS } from '../limits/run-budget'
import {
    commentRead,
    intakePassed,
    practiceTicket,
    replyReceived,
    runBranchCreated,
    SESSIONS,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1 for the run budget (#435): the decision step, handed a journal
 * whose agent turns carry their tokens per model, makes the run stuck with
 * the reason "run budget" once the run's tokens reach its budget. The spec
 * owner's `retry` adds one more full budget; `stop` ends the run.
 */

const SUM = practiceTicket({ number: 11, title: 'Add sum' })
const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })

/** The budget the tests give the run in its engine config. */
const BUDGET = 50_000

type Tokens = {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
}

const tokens = (
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

const OPUS = 'claude-opus-5-5'
const HAIKU = 'claude-haiku-4-5-20251001'

/** One agent turn's session, with its tokens per model. */
const turnSession = ({
    ticket,
    role,
    model_usage,
}: {
    ticket: number | null
    role: AgentRole
    model_usage: Record<string, Tokens>
}): JournalEntry =>
    ({
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
    }) as JournalEntry

/** A turn that counts exactly `counted` tokens, all output, on Opus. */
const turnOf = ({
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
const stepsAfter = ({
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
                ...intakePassed({ tickets }).map((entry) =>
                    entry.kind === 'run_started' && budget !== undefined
                        ? ({
                              ...entry,
                              content: {
                                  ...entry.content,
                                  config: {
                                      ...entry.content.config,
                                      run_budget_tokens: budget,
                                  },
                              },
                          } as JournalEntry)
                        : entry
                ),
                ...withInstalls({ entries }),
            ],
        }),
    })

const oneSteps = (entries: JournalEntry[], budget: number | undefined) =>
    stepsAfter({ tickets: [SUM], entries, budget })

/** #11's worktree, baseline, and tests written: its red check is next. */
const sumWritten = (): JournalEntry[] => ticketBuilt({ ticket: 11 }).slice(0, 3)

/** #11 with its tests written, and its test-writer's turn counting `counted`. */
const sumSpent = (counted: number): JournalEntry[] => [
    runBranchCreated(),
    ...sumWritten(),
    turnOf({ ticket: 11, role: 'test-writer', counted }),
]

/** The run went stuck on its budget. */
const runStuck = (): JournalEntry =>
    ({
        kind: 'run_stuck',
        ticket: null,
        role: null,
        content: {
            reason: 'run_budget',
            detail: `The run used ${BUDGET} tokens of its ${BUDGET} budget.`,
        },
    }) as JournalEntry

/** The engine told the spec issue the run is stuck, in comment 150. */
const runStuckReported = (): JournalEntry => ({
    kind: 'stuck_reported',
    ticket: null,
    role: null,
    content: { comment_id: 150, body: 'stuck' },
})

/** #11 used the whole budget; the run is stuck and the spec issue told. */
const told = (): JournalEntry[] => [
    ...sumSpent(BUDGET),
    runStuck(),
    runStuckReported(),
]

describe('the run budget: reaching it makes the run stuck', () => {
    test('a run whose tokens reach its configured budget goes stuck with the reason "run budget", before any other step', () => {
        expect(oneSteps(sumSpent(BUDGET), BUDGET)).toMatchObject([
            {
                type: 'mark_run_stuck',
                reason: 'run_budget',
                detail: expect.any(String),
            },
        ])
    })

    test('a run one token under its budget keeps building', () => {
        const steps = oneSteps(sumSpent(BUDGET - 1), BUDGET)
        expect(steps.map(({ type }) => type)).toEqual(['run_red_check'])
    })

    test("the run's tokens are every turn's input, output, and cache-creation tokens per model, over every ticket; cache reads do not count", () => {
        const entries: JournalEntry[] = [
            runBranchCreated(),
            ...sumWritten(),
            turnSession({
                ticket: 11,
                role: 'test-writer',
                model_usage: {
                    // 10_000 + 20_000 + 5_000 counted; the cache reads are not.
                    [OPUS]: tokens(10_000, 20_000, 900_000, 5_000),
                    // 1_000 + 3_000 + 1_000 counted.
                    [HAIKU]: tokens(1_000, 3_000, 400_000, 1_000),
                },
            }),
            ...ticketBuilt({ ticket: 12 }).slice(0, 3),
        ]
        // 40_000 so far: one more counted token short of the budget of 50_000.
        const under = stepsAfter({
            tickets: [SUM, PRODUCT],
            budget: BUDGET,
            entries: [
                ...entries,
                turnOf({ ticket: 12, role: 'test-writer', counted: 9_999 }),
            ],
        })
        expect(under.map(({ type }) => type)).toEqual([
            'run_red_check',
            'run_red_check',
        ])
        const reached = stepsAfter({
            tickets: [SUM, PRODUCT],
            budget: BUDGET,
            entries: [
                ...entries,
                turnOf({ ticket: 12, role: 'test-writer', counted: 10_000 }),
            ],
        })
        expect(reached).toMatchObject([
            { type: 'mark_run_stuck', reason: 'run_budget' },
        ])
    })

    test("the final review's turns count toward the run budget too", () => {
        const entries: JournalEntry[] = [
            ...sumSpent(BUDGET - 100),
            turnSession({
                ticket: null,
                role: 'architecture-lens',
                model_usage: { [OPUS]: tokens(40, 60, 5_000, 0) },
            }),
        ]
        expect(oneSteps(entries, BUDGET)).toMatchObject([
            { type: 'mark_run_stuck', reason: 'run_budget' },
        ])
    })

    test('once stuck, the run tells the spec issue with the usual stuck comment: why, and the replies `retry` and `stop`', () => {
        const steps = oneSteps([...sumSpent(BUDGET), runStuck()], BUDGET)
        expect(steps).toEqual([
            {
                type: 'report_run_stuck',
                spec_number: 10,
                body: expect.any(String),
            },
        ])
        const body = steps[0]?.type === 'report_run_stuck' ? steps[0].body : ''
        expect(body).toMatch(/stuck/i)
        expect(body).toMatch(/run budget/i)
        expect(body).toMatch(/50[,. ]?000/)
        expect(body).toContain('`retry`')
        expect(body).toContain('`stop`')
        expect(body).toContain('Only the spec owner counts.')
        expect(body).not.toContain('`skip')
    })

    test('once told, the whole run waits for a reply: no ticket starts a new step', () => {
        const steps = stepsAfter({
            tickets: [SUM, PRODUCT],
            budget: BUDGET,
            entries: [
                runBranchCreated(),
                ...sumWritten(),
                turnOf({ ticket: 11, role: 'test-writer', counted: 30_000 }),
                ...ticketBuilt({ ticket: 12 }).slice(0, 3),
                turnOf({ ticket: 12, role: 'test-writer', counted: 20_000 }),
                runStuck(),
                runStuckReported(),
            ],
        })
        expect(steps).toEqual([
            { type: 'wait_for_reply', spec_number: 10, since_id: 150 },
        ])
    })
})

describe('the run budget: the default and the config', () => {
    test('a config with no run_budget_tokens uses the default run budget', () => {
        expect(
            oneSteps(sumSpent(DEFAULT_RUN_BUDGET_TOKENS - 1), undefined).map(
                ({ type }) => type
            )
        ).toEqual(['run_red_check'])
        expect(
            oneSteps(sumSpent(DEFAULT_RUN_BUDGET_TOKENS), undefined)
        ).toMatchObject([{ type: 'mark_run_stuck', reason: 'run_budget' }])
    })

    test('run_budget_tokens in the engine config overrides the default, both lower and higher', () => {
        expect(oneSteps(sumSpent(1_000), 1_000)).toMatchObject([
            { type: 'mark_run_stuck', reason: 'run_budget' },
        ])
        const higher = DEFAULT_RUN_BUDGET_TOKENS * 2
        expect(
            oneSteps(sumSpent(DEFAULT_RUN_BUDGET_TOKENS), higher).map(
                ({ type }) => type
            )
        ).toEqual(['run_red_check'])
    })
})

describe('the run budget: replies', () => {
    test('`retry` from the spec owner is taken as the reply for the run', () => {
        expect(
            oneSteps(
                [...told(), commentRead({ comment_id: 160, body: 'retry' })],
                BUDGET
            )
        ).toEqual([
            {
                type: 'take_reply',
                comment_id: 160,
                word: 'retry',
                ticket: null,
            },
        ])
    })

    test('`stop` from the spec owner is taken as the reply for the run', () => {
        expect(
            oneSteps(
                [...told(), commentRead({ comment_id: 160, body: 'stop' })],
                BUDGET
            )
        ).toEqual([
            { type: 'take_reply', comment_id: 160, word: 'stop', ticket: null },
        ])
    })

    test('`retry` or `stop` from anyone but the spec owner is ignored, and the run keeps waiting', () => {
        for (const body of ['retry', 'stop']) {
            expect(
                oneSteps(
                    [
                        ...told(),
                        commentRead({
                            comment_id: 160,
                            body,
                            author: 'passer-by',
                        }),
                    ],
                    BUDGET
                )
            ).toEqual([
                { type: 'wait_for_reply', spec_number: 10, since_id: 160 },
            ])
        }
    })

    test('`retry` adds one more full budget, and the run carries on where it stopped', () => {
        const retried = [
            ...told(),
            commentRead({ comment_id: 160, body: 'retry' }),
            replyReceived({ word: 'retry', ticket: null, comment_id: 160 }),
        ]
        expect(oneSteps(retried, BUDGET).map(({ type }) => type)).toEqual([
            'run_red_check',
        ])
    })

    test('after one `retry`, the run goes stuck again once its tokens reach two full budgets', () => {
        const steps = ticketBuilt({ ticket: 11 })
        const retried = [
            ...told(),
            commentRead({ comment_id: 160, body: 'retry' }),
            replyReceived({ word: 'retry', ticket: null, comment_id: 160 }),
            ...steps.slice(3, 7),
        ]
        const under = oneSteps(
            [
                ...retried,
                turnOf({
                    ticket: 11,
                    role: 'implementer',
                    counted: BUDGET - 1,
                }),
            ],
            BUDGET
        )
        expect(under.map(({ type }) => type)).not.toContain('mark_run_stuck')
        expect(under.length).toBeGreaterThan(0)
        expect(
            oneSteps(
                [
                    ...retried,
                    turnOf({
                        ticket: 11,
                        role: 'implementer',
                        counted: BUDGET,
                    }),
                ],
                BUDGET
            )
        ).toMatchObject([{ type: 'mark_run_stuck', reason: 'run_budget' }])
    })

    test('`stop` ends the run without a PR', () => {
        const stopped = [
            ...told(),
            commentRead({ comment_id: 160, body: 'stop' }),
            replyReceived({ word: 'stop', ticket: null, comment_id: 160 }),
        ]
        expect(oneSteps(stopped, BUDGET)).toMatchObject([
            { type: 'record_usage', usage: { scope: 'run' } },
        ])
        const usage: JournalEntry = {
            kind: 'usage_recorded',
            ticket: null,
            role: null,
            content: {
                scope: 'run',
                ticket: null,
                agent_turns: 1,
                tokens: tokens(0, BUDGET, 0, 0),
                windows: {},
            },
        }
        expect(oneSteps([...stopped, usage], BUDGET)).toEqual([
            { type: 'done', outcome: 'stopped_by_user' },
        ])
    })
})
