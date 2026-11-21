import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels } from './model-score'

import {
    groups,
    roleSection,
    runOf,
    scoreOf,
    started,
    ticketRun,
} from '../testing/model-score-fixtures'

/**
 * The model score report on `agy` runs (#777): Gemini tickets are scored
 * under their Gemini tier, and a cheaper tier is judged against the top
 * Gemini tier, as a cheaper Claude model is judged against Opus.
 */

describe('Gemini models in the model score report', () => {
    test('scores tickets on each Gemini tier instead of dropping them or counting them as opus', () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({
                        ticket: 11,
                        tw: 'gemini-4-neon-high',
                        impl: 'gemini-4-neon-high',
                        findings: ['should_fix'],
                    }),
                    ...ticketRun({
                        ticket: 12,
                        tw: 'gemini-4-neon-high',
                        impl: 'gemini-3.8-flash-high',
                    }),
                ]),
            ],
        })

        expect(groups(report.scores)).toEqual([
            'implementer/gemini-3.8-flash-high',
            'implementer/gemini-4-neon-high',
            'test-writer/gemini-4-neon-high',
        ])
        const top = scoreOf(report.scores, 'implementer', 'gemini-4-neon-high')
        const flash = scoreOf(
            report.scores,
            'implementer',
            'gemini-3.8-flash-high'
        )
        expect(top?.tickets).toBe(1)
        expect(top?.verdict).toBeNull()
        expect(flash?.tickets).toBe(1)
        expect(flash?.verdict).not.toBeNull()
        expect(
            scoreOf(report.scores, 'test-writer', 'gemini-4-neon-high')
                ?.other_role_cheaper
        ).toBe(1)
        expect(scoreOf(report.scores, 'implementer', 'opus')).toBeUndefined()
    })

    test('reads an effort-suffixed Gemini id as its tier and prints Gemini lines', () => {
        const report = scoreModels({
            runs: [
                runOf([
                    started({
                        ticket: null,
                        role: 'learner',
                        model: null,
                    }),
                ]).map((record) =>
                    record.kind === 'agent_started'
                        ? {
                              ...record,
                              content: {
                                  ...record.content,
                                  model: 'gemini-4-argon-medium',
                              },
                          }
                        : record
                ),
                runOf(
                    ticketRun({
                        ticket: 21,
                        tw: 'gemini-4-neon-high',
                        impl: 'gemini-4-argon-high',
                    })
                ),
            ],
        })

        expect(report.learner).toEqual([
            { model: 'gemini-4-argon-high', effort: 'high', agents: 1 },
        ])
        const text = formatModelReport({ report })
        expect(
            roleSection(text, 'implementer').some((line) =>
                line.startsWith('  gemini-4-argon-high at ')
            )
        ).toBe(true)
        expect(text).toContain('1 agent on gemini-4-argon-high at high')
    })
})
