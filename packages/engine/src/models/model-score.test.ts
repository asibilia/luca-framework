import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels, type ModelScore } from './model-score'

import type { JournalEntry } from '../journal/journal-record'
import {
    agentFailed,
    pullRequestOpened,
    ticketStuck,
} from '../testing/build-fixtures'
import {
    finalReviewPassed,
    lensFinding,
    lensRound,
} from '../testing/final-review-fixtures'
import {
    groups,
    modelAsk,
    runOf,
    scoreOf,
    started,
    sure,
    ticketRun,
    type Ask,
    type Model,
    type Severity,
} from '../testing/model-score-fixtures'

/**
 * The model score report (#605) as a pure function: run journals in, built
 * with the engine's own fixtures, a report out. `scoreModels({ runs })`
 * takes each run's records and gives `scores`, one per routed role and
 * model it ran on, `final_review` (the run-level line), and
 * `without_lines_changed` (tickets left out of the rates).
 * `formatModelReport({ report })` is the text `luca models` prints.
 */

const rate = (score: ModelScore | undefined) => score?.findings_per_100_lines

describe('findings from the first ticket review', () => {
    test('weighs a blocker 3, a should-fix 1 and a nit 0, from the first review only', () => {
        const report = scoreModels({
            runs: [
                runOf(
                    ticketRun({
                        ticket: 11,
                        impl: 'haiku',
                        findings: [
                            'blocker',
                            'should_fix',
                            'should_fix',
                            'nit',
                            'nit',
                        ],
                        rounds: 3,
                        lines: 50,
                    })
                ),
            ],
        })
        // 3 + 1 + 1 over 50 lines; the fix rounds' should-fixes don't count.
        expect(
            rate(scoreOf(report.scores, 'implementer', 'haiku'))
        ).toBeCloseTo(10)
    })

    test("counts the findings per 100 changed lines over all of a group's tickets", () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        tw: 'sonnet',
                        findings: ['blocker'],
                        lines: 200,
                    }),
                    ...ticketRun({
                        ticket: 12,
                        tw: 'sonnet',
                        findings: ['nit'],
                        lines: 100,
                    }),
                ]),
            ],
        })
        expect(
            rate(scoreOf(report.scores, 'test-writer', 'sonnet'))
        ).toBeCloseTo(1)
    })
})

describe('what each role and model shows', () => {
    test("fix rounds per ticket, tokens per finished ticket and Clef's median confidence", () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        tw: 'sonnet',
                        asks: [sure('sonnet', 0.85)],
                        tokens: 1000,
                    }),
                    ...ticketRun({
                        ticket: 12,
                        tw: 'sonnet',
                        asks: [sure('sonnet', 0.95)],
                        findings: ['should_fix'],
                        tokens: 2000,
                    }),
                    ...ticketRun({
                        ticket: 13,
                        tw: 'sonnet',
                        asks: [sure('sonnet', 0.9)],
                        findings: ['should_fix'],
                        rounds: 2,
                        tokens: 6000,
                    }),
                ]),
            ],
        })
        expect(scoreOf(report.scores, 'test-writer', 'sonnet')).toMatchObject({
            tickets: 3,
            fix_rounds_per_ticket: 1,
            tokens_per_finished_ticket: 3000,
            median_confidence: 0.9,
            stuck_tickets: 0,
        })
        const text = formatModelReport({ report })
        expect(text).toContain('test-writer')
        expect(text).toContain('sonnet')
    })

    test('stuck tickets', () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({ ticket: 11, tw: 'haiku' }),
                    started({
                        ticket: 12,
                        role: 'test-writer',
                        model: 'haiku',
                    }),
                    agentFailed({
                        ticket: 12,
                        role: 'test-writer',
                        failure: 'agent',
                        session_id: null,
                    }),
                    ticketStuck({ ticket: 12, reason: 'agent_failed' }),
                ]),
            ],
        })
        expect(scoreOf(report.scores, 'test-writer', 'haiku')).toMatchObject({
            tickets: 2,
            stuck_tickets: 1,
        })
    })
})

describe('grouping tickets by model', () => {
    test("a ticket counts under the model of the role's first agent, and says when the other role ran cheaper", () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        tw: 'sonnet',
                        tw_failed_first: true,
                    }),
                    ...ticketRun({ ticket: 12, impl: 'haiku' }),
                ]),
            ],
        })
        expect(groups(report.scores)).toEqual([
            'implementer/haiku',
            'implementer/opus',
            'test-writer/opus',
            'test-writer/sonnet',
        ])
        expect(scoreOf(report.scores, 'test-writer', 'sonnet')?.tickets).toBe(1)
        expect(scoreOf(report.scores, 'test-writer', 'opus')).toMatchObject({
            tickets: 1,
            other_role_cheaper: 1,
        })
        expect(
            scoreOf(report.scores, 'implementer', 'opus')?.other_role_cheaper
        ).toBe(1)
    })
})

describe('the baseline', () => {
    test('is the tickets where Clef picked the model in shadow mode but the role ran opus, old ticket_model asks included', () => {
        const shadow = (pick: Model): Ask => ({
            role: 'test-writer',
            pick,
            confidence: 0.7,
            acted: false,
        })
        const old: Ask = {
            role: null,
            pick: 'claude-sonnet-5',
            confidence: 0.6,
        }
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        asks: [shadow('sonnet')],
                        findings: ['blocker'],
                    }),
                    ...ticketRun({
                        ticket: 12,
                        asks: [shadow('haiku')],
                        findings: ['blocker'],
                    }),
                    ...ticketRun({
                        ticket: 13,
                        tw: 'sonnet',
                        asks: [sure('sonnet')],
                    }),
                    ...ticketRun({ ticket: 14, impl: 'sonnet' }),
                ]),
                runOf(
                    ticketRun({
                        ticket: 21,
                        tw: null,
                        impl: null,
                        asks: [old],
                        findings: ['should_fix'],
                    })
                ),
            ],
        })
        // #11 (3 over 100 lines) and #21 (1 over 100), not #12's haiku pick.
        expect(
            scoreOf(report.scores, 'test-writer', 'sonnet')?.baseline
        ).toMatchObject({ tickets: 2, findings_per_100_lines: 2 })
        // The old ask was about the whole ticket, so the implementer too.
        expect(
            scoreOf(report.scores, 'implementer', 'sonnet')?.baseline.tickets
        ).toBe(1)
    })
})

describe('the run-level final review line', () => {
    test('splits runs with routed agents from runs without', () => {
        const finalReview = (severities: Severity[]): JournalEntry[] => [
            ...lensRound({
                round: 1,
                findings: {
                    architecture: severities.map((severity, at) =>
                        lensFinding({ id: `L${at}`, severity })
                    ),
                },
            }),
            finalReviewPassed(),
            pullRequestOpened(),
        ]
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        tw: 'sonnet',
                        asks: [sure('sonnet')],
                    }),
                    ...ticketRun({
                        ticket: 12,
                        tw: 'sonnet',
                        asks: [sure('sonnet')],
                    }),
                    ...finalReview(['blocker', 'should_fix']),
                ]),
                runOf([
                    ...ticketRun({ ticket: 21 }),
                    ...finalReview(['should_fix', 'nit']),
                ]),
            ],
        })
        expect(report.final_review).toMatchObject({
            routed: { runs: 1, findings_per_100_lines: 2 },
            not_routed: { runs: 1, findings_per_100_lines: 1 },
        })
    })
})

describe('the learner', () => {
    test('shows as not measured by findings', () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({ ticket: 11 }),
                    ...modelAsk({
                        ticket: null,
                        role: 'learner',
                        pick: 'sonnet',
                        confidence: 0.9,
                    }),
                    started({ ticket: null, role: 'learner', model: 'sonnet' }),
                ]),
            ],
        })
        expect(formatModelReport({ report })).toMatch(
            /learner\b.*not measured by findings/
        )
    })
})

describe('missing data', () => {
    test('tickets with no lines_changed are left out of the rates, and their count is shown', () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        tw: 'sonnet',
                        findings: ['should_fix', 'should_fix'],
                    }),
                    ...ticketRun({
                        ticket: 12,
                        tw: 'sonnet',
                        findings: ['blocker', 'blocker'],
                        lines: null,
                    }),
                ]),
            ],
        })
        expect(
            rate(scoreOf(report.scores, 'test-writer', 'sonnet'))
        ).toBeCloseTo(2)
        expect(report.without_lines_changed).toBe(1)
        const lines = formatModelReport({ report }).split('\n')
        expect(
            lines.some(
                (line) => /lines[_ ]changed/i.test(line) && /\b1\b/.test(line)
            )
        ).toBe(true)
    })

    test('older journals read, and count as opus', () => {
        const old = { tw: null, impl: null, lines: null }
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({ ticket: 11, ...old }),
                    ...ticketRun({ ticket: 12, ...old }),
                ]),
            ],
        })
        expect(groups(report.scores)).toEqual([
            'implementer/opus',
            'test-writer/opus',
        ])
        expect(scoreOf(report.scores, 'test-writer', 'opus')?.tickets).toBe(2)
        expect(report.without_lines_changed).toBe(2)
    })
})
