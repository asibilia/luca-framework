import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels, type ModelScore } from './model-score'

import {
    runOf,
    scoreOf,
    ticketRun,
    type Ask,
    type Built,
    type Model,
} from '../testing/model-score-fixtures'

/**
 * The model score report by effort (#662): each role's lines grouped by
 * model and effort, a ticket compared only with tickets whose ticket review
 * ran at the same effort, and an agent from before #659, with no effort,
 * counted at high.
 */

/** The role, model and effort of each score with tickets, sorted. */
const effortGroups = (scores: ModelScore[]): string[] =>
    scores
        .filter(({ tickets }) => tickets > 0)
        .map(({ role, model, effort }) => `${role}/${model}/${effort}`)
        .sort()

/** The scores of `role` on `model`, fewest tickets first. */
const scoresOf = (
    scores: ModelScore[],
    role: Built,
    model: Model
): ModelScore[] =>
    scores
        .filter((score) => score.role === role && score.model === model)
        .toSorted((a, b) => a.tickets - b.tickets)

/** Clef picked `pick` for the test-writer in shadow mode. */
const shadowPick = (pick: Model): Ask => ({
    role: 'test-writer',
    pick,
    confidence: 0.7,
    acted: false,
})

describe('grouping tickets by model and effort', () => {
    test("each role's lines are grouped by model and effort, and each line starts with the model and the effort", () => {
        const review_effort = 'xhigh'
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        tw_effort: 'medium',
                        impl_effort: 'medium',
                        review_effort,
                    }),
                    ...ticketRun({
                        ticket: 12,
                        tw_effort: 'medium',
                        impl: 'sonnet',
                        impl_effort: 'high',
                        review_effort,
                    }),
                    ...ticketRun({
                        ticket: 13,
                        tw_effort: 'medium',
                        impl_effort: 'medium',
                        review_effort,
                    }),
                    ...ticketRun({
                        ticket: 14,
                        tw_effort: 'high',
                        impl_effort: 'high',
                        review_effort,
                    }),
                    ...ticketRun({
                        ticket: 15,
                        tw: 'sonnet',
                        tw_effort: 'high',
                        impl_effort: 'xhigh',
                        review_effort,
                    }),
                ]),
            ],
        })
        expect(effortGroups(report.scores)).toEqual([
            'implementer/opus/high',
            'implementer/opus/medium',
            'implementer/opus/xhigh',
            'implementer/sonnet/high',
            'test-writer/opus/high',
            'test-writer/opus/medium',
            'test-writer/sonnet/high',
        ])
        expect(
            report.scores.find(
                ({ role, model, effort }) =>
                    role === 'test-writer' &&
                    model === 'opus' &&
                    effort === 'medium'
            )?.tickets
        ).toBe(3)
        const text = formatModelReport({ report })
        // The test-writer's 3 tickets on opus at medium, the implementer's 2.
        expect(text).toMatch(/^\s*opus at medium: 3 tickets, /m)
        expect(text).toMatch(/^\s*opus at medium: 2 tickets, /m)
        expect(text).toMatch(/^\s*sonnet at high: 1 ticket, /m)
        expect(text).toMatch(/^\s*opus at xhigh: 1 ticket, /m)
        expect(text).not.toMatch(/^\s*opus: /m)
    })

    test('a ticket is compared only with tickets whose ticket review ran at the same effort', () => {
        const tw_effort = 'medium'
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        tw: 'sonnet',
                        tw_effort,
                        review_effort: 'xhigh',
                        findings: ['blocker'],
                    }),
                    ...ticketRun({
                        ticket: 12,
                        tw: 'sonnet',
                        tw_effort,
                        review_effort: 'xhigh',
                    }),
                    ...ticketRun({
                        ticket: 13,
                        tw: 'sonnet',
                        tw_effort,
                        review_effort: 'high',
                    }),
                    ...[21, 22, 23].flatMap((ticket) =>
                        ticketRun({
                            ticket,
                            tw_effort,
                            review_effort: 'xhigh',
                            asks: [shadowPick('sonnet')],
                        })
                    ),
                    ...ticketRun({
                        ticket: 24,
                        tw_effort,
                        review_effort: 'high',
                        asks: [shadowPick('sonnet')],
                        findings: ['blocker'],
                    }),
                ]),
            ],
        })
        // #13 and #24, reviewed at high; then #11 and #12, and their
        // baseline #21 to #23, reviewed at xhigh.
        expect(
            scoresOf(report.scores, 'test-writer', 'sonnet').map(
                ({ tickets, findings_per_100_lines, baseline }) => ({
                    tickets,
                    findings_per_100_lines,
                    baseline: {
                        tickets: baseline.tickets,
                        findings_per_100_lines: baseline.findings_per_100_lines,
                    },
                })
            )
        ).toEqual([
            {
                tickets: 1,
                findings_per_100_lines: 0,
                baseline: { tickets: 1, findings_per_100_lines: 3 },
            },
            {
                tickets: 2,
                findings_per_100_lines: 1.5,
                baseline: { tickets: 3, findings_per_100_lines: 0 },
            },
        ])
        expect(
            scoresOf(report.scores, 'test-writer', 'opus').map(
                ({ tickets }) => tickets
            )
        ).toEqual([1, 3])
    })
})

describe('older journals, with no effort', () => {
    test('an agent with no effort, from before #659, counts as high', () => {
        const report = scoreModels({
            runs: [
                runOf(ticketRun({ ticket: 11, tw: null, impl: null })),
                runOf(
                    ticketRun({
                        ticket: 21,
                        tw_effort: 'high',
                        impl_effort: 'high',
                        review_effort: 'high',
                    })
                ),
            ],
        })
        expect(effortGroups(report.scores)).toEqual([
            'implementer/opus/high',
            'test-writer/opus/high',
        ])
        expect(scoreOf(report.scores, 'test-writer', 'opus')?.tickets).toBe(2)
        expect(formatModelReport({ report })).toMatch(
            /^\s*opus at high: 2 tickets, /m
        )
    })

    test('a ticket review with no effort counts as high, so its ticket is compared with tickets reviewed at high', () => {
        const tw_effort = 'medium'
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({ ticket: 11, tw: 'sonnet', tw_effort }),
                    ...ticketRun({
                        ticket: 12,
                        tw: 'sonnet',
                        tw_effort,
                        review_effort: 'high',
                    }),
                    ...ticketRun({
                        ticket: 13,
                        tw_effort,
                        review_effort: 'high',
                        asks: [shadowPick('sonnet')],
                    }),
                    ...ticketRun({
                        ticket: 14,
                        tw_effort,
                        asks: [shadowPick('sonnet')],
                    }),
                ]),
            ],
        })
        const sonnet = scoresOf(report.scores, 'test-writer', 'sonnet')
        expect(sonnet).toHaveLength(1)
        expect(sonnet[0]).toMatchObject({
            tickets: 2,
            effort: 'medium',
            baseline: { tickets: 2 },
        })
    })
})
