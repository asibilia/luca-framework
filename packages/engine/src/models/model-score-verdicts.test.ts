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

/** Left out, `effort` writes an agent from before #659, which ran at high. */
const started = ({
    ticket,
    role,
    model,
    follow_up_of,
    effort,
}: {
    ticket: number
    role: AgentRole
    model: string
    follow_up_of?: string
    effort?: 'xhigh'
}): JournalEntry => ({
    kind: 'agent_started',
    ticket,
    role,
    content: {
        role,
        prompt: 'p',
        follow_up_of: follow_up_of ?? null,
        model,
        ...(effort === undefined ? {} : { effort }),
    },
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

/** Its ticket reviews ran at `review`; left out, as before #659. */
const ticketRun = ({
    ticket,
    side,
    findings,
    review: review_effort,
}: {
    ticket: number
    side: 'sonnet' | 'baseline'
    findings: Severity[]
    review?: 'xhigh'
}): JournalEntry[] => {
    const review = (list: Severity[]): JournalEntry[] => [
        started({
            ticket,
            role: 'ticket-reviewer',
            model: 'opus',
            effort: review_effort,
        }),
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
 * tickets, each list item one ticket's first-review findings, reviewed as
 * before #659; then `xhigh`'s tickets the same way, reviewed at xhigh.
 */
const reportOf = ({
    sonnet,
    baseline,
    xhigh = { sonnet: [], baseline: [] },
}: {
    sonnet: Severity[][]
    baseline: Severity[][]
    xhigh?: { sonnet: Severity[][]; baseline: Severity[][] }
}) => {
    const groups = [
        { first: 11, side: 'sonnet', list: sonnet },
        { first: 51, side: 'baseline', list: baseline },
        { first: 101, side: 'sonnet', list: xhigh.sonnet, review: 'xhigh' },
        { first: 151, side: 'baseline', list: xhigh.baseline, review: 'xhigh' },
    ] as const
    const body = groups.flatMap(({ first, side, list, ...rest }) =>
        list.flatMap((findings, index) =>
            ticketRun({ ticket: first + index, side, findings, ...rest })
        )
    )
    const numbers = groups.flatMap(({ first, list }) =>
        list.map((_, index) => first + index)
    )
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
    /** The test-writer's sonnet scores, one per review effort. */
    const sonnet_scores = report.scores.filter(
        ({ role, model }) => role === 'test-writer' && model === 'sonnet'
    )
    return { report, score, sonnet_scores }
}

/** Each score's tickets and its baseline's, fewest tickets first. */
const sides = (scores: { tickets: number; baseline: { tickets: number } }[]) =>
    scores
        .map(({ tickets, baseline }) => [tickets, baseline.tickets])
        .toSorted(([a = 0], [b = 0]) => a - b)

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

describe('the verdict per ticket review effort (#662)', () => {
    test("is not enough data while either side of the group has fewer than 10 tickets reviewed at the group's effort", () => {
        // Together, 14 against 11 tickets; at xhigh alone, 9 against 10.
        const few_cheaper = reportOf({
            sonnet: tickets({ count: 5 }),
            baseline: tickets({ count: 1 }),
            xhigh: {
                sonnet: tickets({ count: 9 }),
                baseline: tickets({ count: 10 }),
            },
        })
        expect(sides(few_cheaper.sonnet_scores)).toEqual([
            [5, 1],
            [9, 10],
        ])
        expect(few_cheaper.sonnet_scores.map(({ verdict }) => verdict)).toEqual(
            ['not enough data', 'not enough data']
        )
        // Together, 11 against 14 tickets; at xhigh alone, 10 against 9.
        const few_baseline = reportOf({
            sonnet: tickets({ count: 1 }),
            baseline: tickets({ count: 5 }),
            xhigh: {
                sonnet: tickets({ count: 10 }),
                baseline: tickets({ count: 9 }),
            },
        })
        expect(sides(few_baseline.sonnet_scores)).toEqual([
            [1, 5],
            [10, 9],
        ])
        expect(
            few_baseline.sonnet_scores.map(({ verdict }) => verdict)
        ).toEqual(['not enough data', 'not enough data'])
    })

    test("is about the same at exactly 20% above the baseline reviewed at the group's effort, though worse against every baseline ticket", () => {
        // At xhigh, 3.0 against 2.5 per 100 lines and 0.6 against 0.5 fix
        // rounds; with the 10 clean tickets reviewed at high, 1.25 and 0.25.
        const { report, sonnet_scores } = reportOf({
            sonnet: [],
            baseline: tickets({ count: 10 }),
            xhigh: {
                sonnet: tickets({
                    count: 10,
                    blocking: [FIVE, FIVE, FIVE, FIVE, FIVE, FIVE],
                }),
                baseline: BASELINE,
            },
        })
        const xhigh = sonnet_scores.find(({ tickets }) => tickets === 10)
        expect(xhigh).toMatchObject({
            findings_per_100_lines: 3,
            baseline: { tickets: 10, findings_per_100_lines: 2.5 },
            verdict: 'about the same',
        })
        expect(formatModelReport({ report })).not.toContain('worse')
    })

    test("is worse past 20% above the baseline reviewed at the group's effort, though about the same against every baseline ticket", () => {
        // At xhigh, 3.1 against 2.5 per 100 lines; with the 10 tickets
        // reviewed at high, each weighing 5, 3.75 per 100 lines and 0.75
        // fix rounds.
        const { report, sonnet_scores } = reportOf({
            sonnet: [],
            baseline: tickets({
                count: 10,
                blocking: Array.from({ length: 10 }, () => FIVE),
            }),
            xhigh: {
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
            },
        })
        const xhigh = sonnet_scores.find(({ tickets }) => tickets === 10)
        expect(xhigh).toMatchObject({
            baseline: { tickets: 10, findings_per_100_lines: 2.5 },
            verdict: 'worse',
        })
        expect(formatModelReport({ report })).toContain('worse')
    })
})
