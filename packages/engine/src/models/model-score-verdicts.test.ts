import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels } from './model-score'

import type { AgentRole } from '../agents/role-results'
import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import {
    finding,
    implemented,
    intakePassed,
    practiceTicket,
    pushed,
    reviewed,
    testsWritten,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * The model score report's verdicts (#605) at their edges: the test-writer
 * on sonnet against its baseline, the tickets where Clef picked sonnet in
 * shadow mode but the test-writer ran opus. Every ticket changes 100 lines,
 * so a ticket's weighted findings are its rate, and a ticket whose first
 * review blocks has one fix round.
 */

type Severity = 'blocker' | 'should_fix' | 'nit'

const started = ({
    ticket,
    role,
    model,
    follow_up_of,
}: {
    ticket: number
    role: AgentRole
    model: string
    follow_up_of?: string
}): JournalEntry => ({
    kind: 'agent_started',
    ticket,
    role,
    content: { role, prompt: 'p', follow_up_of: follow_up_of ?? null, model },
})

/** Clef picked sonnet for the test-writer in shadow mode; it ran opus. */
const shadowPick = (ticket: number): JournalEntry[] => [
    {
        kind: 'jev_asked',
        ticket,
        role: 'test-writer',
        content: {
            job: 'agent_model',
            request: {
                state: {},
                questions: {
                    model: {
                        type: 'choice',
                        instructions: 'Which model?',
                        criteria: { opus: null, sonnet: null, haiku: null },
                    },
                },
            },
            fixed: { model: 'opus' },
            acted: false,
        },
    },
    {
        kind: 'jev_answered',
        ticket,
        role: 'test-writer',
        content: {
            job: 'agent_model',
            asked_seq: 1,
            answers: { model: { value: 'sonnet', confidence: 0.9, raw: {} } },
            ms: 5,
        },
    },
]

const ticketRun = ({
    ticket,
    side,
    findings,
}: {
    ticket: number
    side: 'sonnet' | 'baseline'
    findings: Severity[]
}): JournalEntry[] => {
    const review = (list: Severity[]): JournalEntry[] => [
        started({ ticket, role: 'ticket-reviewer', model: 'opus' }),
        reviewed({
            ticket,
            findings: list.map((severity, at) =>
                finding({ id: `F${list.length}-${at}`, severity })
            ),
        }),
    ]
    const blocks = findings.some((severity) => severity !== 'nit')
    return [
        ...(side === 'baseline' ? shadowPick(ticket) : []),
        started({
            ticket,
            role: 'test-writer',
            model: side === 'baseline' ? 'opus' : 'sonnet',
        }),
        testsWritten({ ticket }),
        started({ ticket, role: 'implementer', model: 'opus' }),
        implemented({ ticket }),
        ...review(findings),
        ...(blocks
            ? [
                  started({
                      ticket,
                      role: 'implementer',
                      model: 'opus',
                      follow_up_of: 'impl-1',
                  }),
                  implemented({ ticket }),
                  ...review([]),
              ]
            : []),
        {
            kind: 'ticket_joined',
            ticket,
            role: null,
            content: { ok: true, shas: ['r1', 'g1'], lines_changed: 100 },
        },
        pushed({ ticket }),
    ]
}

/**
 * One run: `sonnet` tickets with the test-writer on sonnet, then `baseline`
 * tickets, each list item one ticket's first-review findings.
 */
const reportOf = ({
    sonnet,
    baseline,
}: {
    sonnet: Severity[][]
    baseline: Severity[][]
}) => {
    const body = [
        ...sonnet.map((findings, index) =>
            ticketRun({ ticket: 11 + index, side: 'sonnet', findings })
        ),
        ...baseline.map((findings, index) =>
            ticketRun({ ticket: 51 + index, side: 'baseline', findings })
        ),
    ].flat()
    const numbers = [
        ...Array.from({ length: sonnet.length }, (_, index) => 11 + index),
        ...Array.from({ length: baseline.length }, (_, index) => 51 + index),
    ]
    const entries = [
        ...intakePassed({
            tickets: numbers.map((number) => practiceTicket({ number })),
        }),
        ...body,
    ]
    const records: JournalRecord[] = recordsFrom({
        entries: entries.map((entry, index) =>
            entry.kind === 'jev_answered'
                ? { ...entry, content: { ...entry.content, asked_seq: index } }
                : entry
        ),
    })
    const report = scoreModels({ runs: [records] })
    const score = report.scores.find(
        ({ role, model }) => role === 'test-writer' && model === 'sonnet'
    )
    return { report, score }
}

/** `count` tickets: `blocking` of them with `findings`, the rest clean. */
const tickets = ({
    count,
    blocking = [],
}: {
    count: number
    blocking?: Severity[][]
}): Severity[][] =>
    Array.from({ length: count }, (_, index) => blocking[index] ?? [])

/** Weighs 5: one fix round, and 5 per 100 lines. */
const FIVE: Severity[] = ['blocker', 'should_fix', 'should_fix']

/** 10 tickets, 5 of them weighing 5: 2.5 per 100 lines, 0.5 fix rounds. */
const BASELINE = tickets({
    count: 10,
    blocking: [FIVE, FIVE, FIVE, FIVE, FIVE],
})

describe('the verdict per role and model', () => {
    test('is not enough data while either side has fewer than 10 tickets', () => {
        const few_cheaper = reportOf({
            sonnet: tickets({ count: 9 }),
            baseline: tickets({ count: 10 }),
        })
        expect(few_cheaper.score?.verdict).toBe('not enough data')
        expect(formatModelReport({ report: few_cheaper.report })).toContain(
            'not enough data'
        )
        const few_baseline = reportOf({
            sonnet: tickets({ count: 10 }),
            baseline: tickets({ count: 9 }),
        })
        expect(few_baseline.score?.verdict).toBe('not enough data')
    })

    test('is about the same at exactly 20% above the baseline', () => {
        // 6 tickets weighing 5: 3.0 per 100 lines and 0.6 fix rounds.
        const { report, score } = reportOf({
            sonnet: tickets({
                count: 10,
                blocking: [FIVE, FIVE, FIVE, FIVE, FIVE, FIVE],
            }),
            baseline: BASELINE,
        })
        expect(score).toMatchObject({
            tickets: 10,
            baseline: { tickets: 10 },
            verdict: 'about the same',
        })
        expect(formatModelReport({ report })).toContain('about the same')
    })

    test('is worse past 20% above the baseline, in findings or in fix rounds', () => {
        // 3.1 per 100 lines, still 0.6 fix rounds.
        const more_findings = reportOf({
            sonnet: tickets({
                count: 10,
                blocking: [
                    FIVE,
                    FIVE,
                    FIVE,
                    FIVE,
                    FIVE,
                    ['blocker', 'blocker'],
                ],
            }),
            baseline: BASELINE,
        })
        expect(more_findings.score?.verdict).toBe('worse')
        expect(formatModelReport({ report: more_findings.report })).toContain(
            'worse'
        )
        // 2.5 per 100 lines, as the baseline, but 0.7 fix rounds.
        const more_rounds = reportOf({
            sonnet: tickets({
                count: 10,
                blocking: [
                    FIVE,
                    FIVE,
                    ['blocker'],
                    ['blocker'],
                    ['blocker'],
                    ['blocker'],
                    ['blocker'],
                ],
            }),
            baseline: BASELINE,
        })
        expect(more_rounds.score?.verdict).toBe('worse')
    })
})
