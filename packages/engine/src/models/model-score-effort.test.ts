import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels, type ModelScore } from './model-score'

import type { Effort } from '../config/engine-config'
import {
    runOf,
    ticketRun,
    type Built,
    type Model,
} from '../testing/model-score-fixtures'

/**
 * The model score report by effort (#662): each role's lines are grouped
 * by model and effort, and an agent journaled before #659, with no effort,
 * counts as high, the effort every role ran at then.
 */

/** The ticket counts of a role's scores on `model` with tickets, sorted. */
const counts = (scores: ModelScore[], role: Built, model: Model) =>
    scores
        .filter((score) => score.role === role && score.model === model)
        .map(({ tickets }) => tickets)
        .filter((tickets) => tickets > 0)
        .toSorted((a, b) => a - b)

describe('grouping tickets by model and effort', () => {
    test("a role's lines are grouped by model and effort, each starting with both", () => {
        const at = (tw: Model, tw_effort: Effort) => ({
            tw,
            tw_effort,
            impl_effort: 'medium' as const,
            review_effort: 'xhigh' as const,
        })
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({ ticket: 11, ...at('sonnet', 'medium') }),
                    ...ticketRun({ ticket: 12, ...at('sonnet', 'medium') }),
                    ...ticketRun({ ticket: 13, ...at('sonnet', 'high') }),
                    ...ticketRun({ ticket: 14, ...at('opus', 'medium') }),
                ]),
            ],
        })
        expect(counts(report.scores, 'test-writer', 'sonnet')).toEqual([1, 2])
        expect(counts(report.scores, 'implementer', 'opus')).toEqual([4])
        const text = formatModelReport({ report })
        expect(text).toMatch(/^\s*sonnet at medium: 2 tickets, /m)
        expect(text).toMatch(/^\s*sonnet at high: 1 ticket, /m)
        expect(text).toMatch(/^\s*opus at medium: 1 ticket, /m)
        expect(text).toMatch(/^\s*opus at medium: 4 tickets, /m)
    })

    test('an agent with no effort, from before efforts were journaled, counts as high', () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...ticketRun({ ticket: 11, tw: 'sonnet' }),
                    ...ticketRun({
                        ticket: 12,
                        tw: 'sonnet',
                        tw_effort: 'high',
                        impl_effort: 'high',
                        review_effort: 'high',
                    }),
                ]),
            ],
        })
        // One group each: the null efforts, the reviewer's too, read as high.
        expect(counts(report.scores, 'test-writer', 'sonnet')).toEqual([2])
        expect(counts(report.scores, 'implementer', 'opus')).toEqual([2])
        const text = formatModelReport({ report })
        expect(text).toMatch(/^\s*sonnet at high: 2 tickets, /m)
        expect(text).toMatch(/^\s*opus at high: 2 tickets, /m)
    })
})
