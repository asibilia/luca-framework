import {
    agentFailed,
    agentSession,
    finding,
    implemented,
    intakePassed,
    practiceTicket,
    pushed,
    reviewed,
    testsWritten,
} from './build-fixtures'
import { recordsFrom } from './intake-fixtures'

import type { AgentRole } from '../agents/role-results'
import type { Effort } from '../config/engine-config'
import type { JournalEntry, JournalRecord } from '../journal/journal-record'

/**
 * Run journals for the model score report's tests (#605): a ticket built
 * end to end on the models and efforts asked for, and a run of them.
 */

export type Model = 'opus' | 'sonnet' | 'haiku'
export type Severity = 'blocker' | 'should_fix' | 'nit'
export type Built = 'test-writer' | 'implementer'

/**
 * An agent turn started on `model` at `effort`; a `null` model writes one
 * from before #600, and no effort one from before #659.
 */
export const started = ({
    ticket,
    role,
    model,
    follow_up_of,
    effort,
}: {
    ticket: number | null
    role: AgentRole
    model: Model | null
    follow_up_of?: string
    effort?: Effort
}): JournalEntry => ({
    kind: 'agent_started',
    ticket,
    role,
    content: {
        role,
        prompt: 'p',
        follow_up_of: follow_up_of ?? null,
        ...(model === null ? {} : { model }),
        ...(effort === undefined ? {} : { effort }),
    },
})

/**
 * An `agent_model` ask about `role` and Clef's answer, or with `role` null
 * an older journal's `ticket_model` ask, which named full model ids.
 * `runOf` points the answer's `asked_seq` at the ask.
 */
export const modelAsk = ({
    ticket,
    role,
    pick,
    confidence,
    acted,
}: {
    ticket: number | null
    role: Built | 'learner' | null
    pick: string
    confidence: number | null
    acted?: boolean
}): JournalEntry[] => {
    const job = role === null ? 'ticket_model' : 'agent_model'
    const options =
        role === null
            ? ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5']
            : ['opus', 'sonnet', 'haiku']
    return [
        {
            kind: 'jev_asked',
            ticket,
            role,
            content: {
                job,
                request: {
                    state: {},
                    questions: {
                        model: {
                            type: 'choice',
                            instructions: 'Which model?',
                            criteria: Object.fromEntries(
                                options.map((option) => [option, null])
                            ),
                        },
                    },
                },
                fixed: { model: options[0] ?? 'opus' },
                ...(acted === undefined ? {} : { acted }),
            },
        },
        {
            kind: 'jev_answered',
            ticket,
            role,
            content: {
                job,
                asked_seq: 1,
                answers: { model: { value: pick, confidence, raw: {} } },
                ms: 5,
            },
        },
    ]
}

/**
 * An `agent_effort` ask about `role`, in shadow mode, its fixed choice
 * `ran`, and Clef's answer `pick`. `runOf` points the answer's `asked_seq`
 * at the ask.
 */
export const effortAsk = ({
    ticket,
    role,
    pick,
    confidence,
    ran,
}: {
    ticket: number
    role: Built
    pick: Effort
    confidence: number | null
    ran: Effort
}): JournalEntry[] => [
    {
        kind: 'jev_asked',
        ticket,
        role,
        content: {
            job: 'agent_effort',
            request: {
                state: {},
                questions: {
                    effort: {
                        type: 'choice',
                        instructions:
                            'Which effort should this agent use? Pick the lowest that will get it right.',
                        criteria: { medium: null, high: null, xhigh: null },
                    },
                },
            },
            fixed: { effort: ran },
            acted: false,
        },
    },
    {
        kind: 'jev_answered',
        ticket,
        role,
        content: {
            job: 'agent_effort',
            asked_seq: 1,
            answers: { effort: { value: pick, confidence, raw: {} } },
            ms: 5,
        },
    },
]

export type Ask = Omit<Parameters<typeof modelAsk>[0], 'ticket'>

/**
 * One ticket built: the test-writer on `tw`, the implementer on `impl`
 * (opus unless told), the first review's `findings`, then `rounds` fix
 * rounds (one when the findings block), each fix's review finding a
 * should-fix until the last approves, and a join of `lines` lines.
 */
export const ticketRun = ({
    ticket,
    tw = 'opus',
    impl = 'opus',
    asks = [],
    findings = [],
    rounds,
    lines = 100,
    tokens = 100,
    tw_failed_first = false,
    tw_effort,
    impl_effort,
    review_effort,
}: {
    ticket: number
    tw?: Model | null
    impl?: Model | null
    /** Each agent's effort; left out, it is journaled as before #659. */
    tw_effort?: Effort
    impl_effort?: Effort
    review_effort?: Effort
    asks?: Ask[]
    findings?: Severity[]
    rounds?: number
    /** `null` joins as an older journal does, with no `lines_changed`. */
    lines?: number | null
    /** The ticket's tokens, all in its test-writer's session. */
    tokens?: number
    /** The test-writer on `tw` fails a try; a fresh one on opus follows. */
    tw_failed_first?: boolean
}): JournalEntry[] => {
    const askFor = (role: Built | null) =>
        asks
            .filter((ask) => ask.role === role)
            .flatMap((ask) => modelAsk({ ticket, ...ask }))
    const fixes =
        rounds ?? (findings.some((severity) => severity !== 'nit') ? 1 : 0)
    const review = (list: Severity[], index: number): JournalEntry[] => [
        started({
            ticket,
            role: 'ticket-reviewer',
            model: 'opus',
            effort: review_effort,
        }),
        reviewed({
            ticket,
            findings: list.map((severity, at) =>
                finding({ id: `F${index}-${at}`, severity })
            ),
        }),
    ]
    return [
        ...askFor(null),
        ...askFor('test-writer'),
        ...(tw_failed_first
            ? [
                  started({
                      ticket,
                      role: 'test-writer',
                      model: tw,
                      effort: tw_effort,
                  }),
                  agentFailed({
                      ticket,
                      role: 'test-writer',
                      failure: 'agent',
                  }),
              ]
            : []),
        started({
            ticket,
            role: 'test-writer',
            model: tw_failed_first ? 'opus' : tw,
            effort: tw_effort,
        }),
        testsWritten({ ticket }),
        agentSession({
            ticket,
            role: 'test-writer',
            output_tokens: tokens - 10,
        }),
        ...askFor('implementer'),
        started({
            ticket,
            role: 'implementer',
            model: impl,
            effort: impl_effort,
        }),
        implemented({ ticket }),
        ...review(findings, 0),
        ...Array.from({ length: fixes }, (_, index) => [
            started({
                ticket,
                role: 'implementer',
                model: impl,
                follow_up_of: 'impl-1',
                effort: impl_effort,
            }),
            implemented({ ticket }),
            ...review(index + 1 < fixes ? ['should_fix'] : [], index + 1),
        ]).flat(),
        {
            kind: 'ticket_joined',
            ticket,
            role: null,
            content: {
                ok: true,
                shas: ['r1', 'g1'],
                ...(lines === null ? {} : { lines_changed: lines }),
            },
        },
        pushed({ ticket }),
        {
            kind: 'usage_recorded',
            ticket,
            role: null,
            content: {
                scope: 'ticket',
                ticket,
                agent_turns: 1,
                tokens: {
                    input_tokens: 10,
                    output_tokens: tokens - 10,
                    cache_read_input_tokens: 0,
                    cache_creation_input_tokens: 0,
                },
                windows: {},
            },
        },
    ]
}

/** A run's records: its intake, then `body`, each answer after its ask. */
export const runOf = (body: JournalEntry[]): JournalRecord[] => {
    const numbers = [
        ...new Set(
            body.flatMap(({ ticket }) => (ticket === null ? [] : [ticket]))
        ),
    ]
    const entries = [
        ...intakePassed({
            tickets: numbers.map((number) => practiceTicket({ number })),
        }),
        ...body,
    ]
    return recordsFrom({
        entries: entries.map((entry, index) =>
            entry.kind === 'jev_answered'
                ? { ...entry, content: { ...entry.content, asked_seq: index } }
                : entry
        ),
    })
}
