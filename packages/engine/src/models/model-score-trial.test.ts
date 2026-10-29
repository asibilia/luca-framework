import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels } from './model-score'

import type { JournalEntry } from '../journal/journal-record'
import { runOf, ticketRun, type Model } from '../testing/model-score-fixtures'

/**
 * The score report's model trial lines (#698): a ticket is a trial or a
 * control ticket by its first test-writer's `trial_group`. Trial tickets
 * count under the model they ran on; a row's control tickets are the
 * role's control tickets where Clef picked the row's model.
 */

/**
 * #`ticket`, its test-writer on `tw` at medium after Clef picked sonnet at
 * 0.3, journaled in `trial_group` with `model_reason`.
 */
const trialTicket = ({
    ticket,
    tw,
    trial_group,
    model_reason,
}: {
    ticket: number
    tw: Model
    trial_group: 'trial' | 'control'
    model_reason: 'trial' | 'unsure'
}): JournalEntry[] =>
    ticketRun({
        ticket,
        tw,
        tw_effort: 'medium',
        impl_effort: 'medium',
        review_effort: 'xhigh',
        asks: [
            {
                role: 'test-writer',
                pick: 'sonnet',
                confidence: 0.3,
                acted: true,
            },
        ],
    }).map((entry) =>
        entry.kind === 'agent_started' && entry.role === 'test-writer'
            ? {
                  ...entry,
                  content: { ...entry.content, model_reason, trial_group },
              }
            : entry
    )

describe('the model trial in the score report (#698)', () => {
    test("two sonnet trial tickets and three control tickets give the sonnet line's trial count, then a control line and a trial verdict after its baseline and verdict lines", () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...trialTicket({
                        ticket: 11,
                        tw: 'sonnet',
                        trial_group: 'trial',
                        model_reason: 'trial',
                    }),
                    ...trialTicket({
                        ticket: 12,
                        tw: 'sonnet',
                        trial_group: 'trial',
                        model_reason: 'trial',
                    }),
                    ...[13, 14, 15].flatMap((ticket) =>
                        trialTicket({
                            ticket,
                            tw: 'opus',
                            trial_group: 'control',
                            model_reason: 'unsure',
                        })
                    ),
                ]),
            ],
        })
        const lines = formatModelReport({ report }).split('\n')
        const writer = lines.slice(lines.indexOf('test-writer'))
        const row = writer.findIndex((line) =>
            line.startsWith('  sonnet at medium: ')
        )

        expect(row).toBeGreaterThan(0)
        expect(writer[row]).toContain('0 stuck, 2 trials, ')
        expect(writer[row + 1]?.startsWith('    baseline (')).toBe(true)
        expect(writer[row + 2]?.startsWith('    verdict: ')).toBe(true)
        expect(writer[row + 3]).toStartWith(
            '    control (Clef picked sonnet, left out of the trial, ran opus at medium): 3 tickets'
        )
        expect(writer[row + 4]).toBe('    trial verdict: not enough data')
    })
})
