import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels } from './model-score'

import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import { agentOutcome, clefAnswer } from '../testing/calibration-fixtures'
import { runOf } from '../testing/model-score-fixtures'

/**
 * The calibration section of `luca models` (#723): how often Clef's answer
 * matches a reference from the journal, per job and confidence band, with
 * a suggested bar per job.
 */

const ORDER = 'ticket_order, against the ticket the engine started'
const FAILURE =
    "failure_kind, against the engine's routing and the fix that followed"
const SEVERITY = "finding_severity, against the reviewer's severity"

/** The printed report's lines over one run of `body`. */
const reportOf = (body: JournalEntry[]): string[] => linesOf([runOf(body)])

const linesOf = (runs: JournalRecord[][]): string[] =>
    formatModelReport({ report: scoreModels({ runs }) }).split('\n')

/** The lines of `model`'s group, up to the next empty line. */
const groupOf = (lines: string[], model = 'clef'): string[] => {
    const start = lines.indexOf(`decision model: ${model}`)
    if (start < 0) return []
    const end = lines.indexOf('', start)
    return lines.slice(start, end < 0 ? undefined : end)
}

/** A job's lines in `model`'s group: its job line, bands and bar. */
const jobOf = (lines: string[], label: string, model = 'clef'): string[] => {
    const group = groupOf(lines, model)
    const start = group.findIndex((line) => line.startsWith(`  ${label}: `))
    if (start < 0) return []
    const end = group.findIndex(
        (line, at) => at > start && !line.startsWith('    ')
    )
    return group.slice(start, end < 0 ? undefined : end)
}

/** The bar line of `ticket_order` in clef's group. */
const orderBar = (lines: string[]): string | undefined =>
    jobOf(lines, ORDER).find((line) => line.startsWith('    suggested bar: '))

/** A `ticket_order` answer from Clef, right or wrong, at `confidence`. */
const order = ({
    right = true,
    confidence,
    model = 'clef',
}: {
    right?: boolean
    confidence: number | null
    model?: string
}): JournalEntry[] =>
    clefAnswer({
        job: 'ticket_order',
        fixed: 'ticket_12',
        value: right ? 'ticket_12' : 'ticket_13',
        confidence,
        model,
    })

/** `answers` `ticket_order` answers at `confidence`, the first `right` right. */
const orders = (
    answers: number,
    right: number,
    confidence: number
): JournalEntry[] =>
    Array.from({ length: answers }, (_, at) =>
        order({ right: at < right, confidence })
    ).flat()

/** A `finding_severity` answer from Clef at 0.8. */
const severity = (
    value: string | number,
    fixed: 'nit' | 'should_fix' | 'blocker'
): JournalEntry[] =>
    clefAnswer({
        job: 'finding_severity',
        fixed,
        value,
        confidence: 0.8,
        model: 'clef',
    })

describe('the calibration section in luca models (#723)', () => {
    test('one right ticket_order answer from clef at 0.95 ends the report with the calibration section', () => {
        const lines = reportOf(order({ confidence: 0.95 }))

        expect(lines.slice(-15)).toEqual([
            '0 joined tickets with no lines_changed, left out of the rates.',
            '',
            "Calibration: how often Clef's answer matches a reference from the journal, by Clef's confidence.",
            'A band is rated from 20 answers. The suggested bar is the lower edge of the lowest band in an unbroken run, from the top, of rated bands at least 90% right. It is only a suggestion: luca models changes no config.',
            '',
            'decision model: clef',
            `  ${ORDER}: 1 answer, 1 right (100%)`,
            '    below 0.3: 0 answers, too few to rate',
            '    0.3 to 0.5: 0 answers, too few to rate',
            '    0.5 to 0.7: 0 answers, too few to rate',
            '    0.7 to 0.9: 0 answers, too few to rate',
            '    0.9 and up: 1 answer, too few to rate',
            '    suggested bar: none',
            `  ${FAILURE}: no answers yet`,
            `  ${SEVERITY}: no answers yet`,
        ])
    })

    test('an answer from @cf/cloudflare/clef-flash prints a clef-flash group after an empty line', () => {
        const lines = reportOf([
            ...order({ confidence: 0.95 }),
            ...order({
                confidence: 0.95,
                model: '@cf/cloudflare/clef-flash',
            }),
        ])
        const after = lines.indexOf(`  ${SEVERITY}: no answers yet`)

        expect(after).toBeGreaterThan(0)
        expect(lines.slice(after + 1, after + 4)).toEqual([
            '',
            'decision model: clef-flash',
            `  ${ORDER}: 1 answer, 1 right (100%)`,
        ])
    })

    test('20 finding_severity answers at 0.8, 19 right, rate the 0.7 to 0.9 band and suggest 0.7', () => {
        const lines = reportOf([
            ...Array.from({ length: 19 }, () =>
                severity(1.9, 'blocker')
            ).flat(),
            ...severity(0.2, 'blocker'),
        ])
        const job = jobOf(lines, SEVERITY)

        expect(job[0]).toBe(`  ${SEVERITY}: 20 answers, 19 right (95%)`)
        expect(job.slice(4)).toEqual([
            '    0.7 to 0.9: 20 answers, 19 right (95%)',
            '    0.9 and up: 0 answers, too few to rate',
            '    suggested bar: 0.7',
        ])
    })

    test('a severity rounds to its nearest level, a half going up', () => {
        const lines = reportOf([
            ...severity(1.5, 'blocker'),
            ...severity(1.49, 'should_fix'),
            ...severity(0.5, 'nit'),
        ])

        expect(jobOf(lines, SEVERITY)[0]).toBe(
            `  ${SEVERITY}: 3 answers, 2 right (67%)`
        )
    })

    test('a severity that is a string or outside 0 to 2 is left out', () => {
        const lines = reportOf([
            ...severity('blocker', 'blocker'),
            ...severity(2.1, 'blocker'),
            ...severity(-0.1, 'blocker'),
            ...severity(1.9, 'blocker'),
        ])

        expect(jobOf(lines, SEVERITY)[0]).toBe(
            `  ${SEVERITY}: 1 answer, 1 right (100%)`
        )
    })

    test('an answer on a band edge counts in the higher band', () => {
        const lines = reportOf(
            [0.3, 0.5, 0.7, 0.9].flatMap((confidence) => order({ confidence }))
        )

        expect(jobOf(lines, ORDER).slice(1, 6)).toEqual([
            '    below 0.3: 0 answers, too few to rate',
            '    0.3 to 0.5: 1 answer, too few to rate',
            '    0.5 to 0.7: 1 answer, too few to rate',
            '    0.7 to 0.9: 1 answer, too few to rate',
            '    0.9 and up: 1 answer, too few to rate',
        ])
    })

    test('a band of 19 answers is too few to rate', () => {
        const lines = reportOf(orders(19, 19, 0.8))

        expect(jobOf(lines, ORDER)).toContain(
            '    0.7 to 0.9: 19 answers, too few to rate'
        )
    })

    test('179 right of 200 prints 90% but does not hold, so no bar', () => {
        const job = jobOf(reportOf(orders(200, 179, 0.8)), ORDER)

        expect(job.slice(-3)).toEqual([
            '    0.7 to 0.9: 200 answers, 179 right (90%)',
            '    0.9 and up: 0 answers, too few to rate',
            '    suggested bar: none',
        ])
    })

    test('18 right of 20 holds, so the bar is 0.7', () => {
        const job = jobOf(reportOf(orders(20, 18, 0.8)), ORDER)

        expect(job.slice(-3)).toEqual([
            '    0.7 to 0.9: 20 answers, 18 right (90%)',
            '    0.9 and up: 0 answers, too few to rate',
            '    suggested bar: 0.7',
        ])
    })

    test('a failure_kind answer test after failed gates is right when the implementer then sends a bad test', () => {
        const lines = reportOf([
            ...clefAnswer({
                job: 'failure_kind',
                ticket: 12,
                step: 'gates_run',
                fixed: 'code',
                value: 'test',
                confidence: 0.8,
                model: 'clef',
            }),
            agentOutcome({
                ticket: 12,
                role: 'implementer',
                outcome: 'bad_test',
            }),
        ])

        expect(jobOf(lines, FAILURE)[0]).toBe(
            `  ${FAILURE}: 1 answer, 1 right (100%)`
        )
    })

    test('a failure_kind answer after failed gates is left out when the implementer then blames the environment', () => {
        const failed = (ticket: number): JournalEntry[] =>
            clefAnswer({
                job: 'failure_kind',
                ticket,
                step: 'gates_run',
                fixed: 'code',
                value: 'code',
                confidence: 0.8,
                model: 'clef',
            })
        const lines = reportOf([
            ...failed(12),
            agentOutcome({ ticket: 12, role: 'implementer', outcome: 'done' }),
            ...failed(13),
            agentOutcome({
                ticket: 13,
                role: 'implementer',
                outcome: 'environment',
            }),
        ])

        expect(jobOf(lines, FAILURE)[0]).toBe(
            `  ${FAILURE}: 1 answer, 1 right (100%)`
        )
    })

    test('a failure_kind answer after a failed red check is left out when the test-writer then needs a setup change', () => {
        const lines = reportOf([
            ...order({ confidence: 0.95 }),
            ...clefAnswer({
                job: 'failure_kind',
                ticket: 12,
                step: 'red_check',
                fixed: 'test',
                value: 'test',
                confidence: 0.8,
                model: 'clef',
            }),
            agentOutcome({
                ticket: 12,
                role: 'test-writer',
                outcome: 'needs_setup_change',
            }),
        ])

        expect(groupOf(lines)).toContain(`  ${FAILURE}: no answers yet`)
    })

    test('a ticket_order answer is right when it names the ticket the engine started', () => {
        const lines = reportOf([
            ...order({ confidence: 0.95 }),
            ...order({ right: false, confidence: 0.95 }),
        ])

        expect(jobOf(lines, ORDER)[0]).toBe(
            `  ${ORDER}: 2 answers, 1 right (50%)`
        )
    })

    test('a rated band that holds after the top ones ends the walk at the band that breaks it: bar 0.7', () => {
        const lines = reportOf([
            ...orders(30, 30, 0.95),
            ...orders(25, 23, 0.8),
            ...orders(20, 15, 0.6),
        ])

        expect(orderBar(lines)).toBe('    suggested bar: 0.7')
    })

    test('a rated top band that does not hold gives no bar, whatever is below it', () => {
        const lines = reportOf([
            ...orders(20, 17, 0.95),
            ...orders(20, 20, 0.8),
        ])

        expect(orderBar(lines)).toBe('    suggested bar: none')
    })

    test('an unrated top band is passed over before any band holds', () => {
        const lines = reportOf([...orders(5, 5, 0.95), ...orders(20, 20, 0.8)])

        expect(orderBar(lines)).toBe('    suggested bar: 0.7')
    })

    test('an unrated band after one has held ends the walk', () => {
        const lines = reportOf([
            ...orders(20, 20, 0.95),
            ...orders(11, 11, 0.8),
            ...orders(30, 30, 0.6),
        ])

        expect(orderBar(lines)).toBe('    suggested bar: 0.9')
    })

    test('all five bands holding give a bar of 0', () => {
        const lines = reportOf(
            [0.1, 0.4, 0.6, 0.8, 0.95].flatMap((confidence) =>
                orders(20, 20, confidence)
            )
        )

        expect(orderBar(lines)).toBe('    suggested bar: 0')
    })

    test("Jev's answers and answers with no confidence are left out", () => {
        const lines = reportOf([
            ...order({ confidence: 0.95 }),
            ...clefAnswer({
                job: 'ticket_order',
                fixed: 'ticket_12',
                value: 'ticket_12',
                confidence: 0.95,
            }),
            ...order({ confidence: null }),
        ])

        expect(jobOf(lines, ORDER)[0]).toBe(
            `  ${ORDER}: 1 answer, 1 right (100%)`
        )
    })

    test('a second answer to the same ask is left out', () => {
        const [ask, answer] = order({ confidence: 0.95 })
        if (ask === undefined || answer === undefined) throw new Error('no ask')
        const records = runOf([ask, answer, answer])
        const first = records.at(-2)
        const twice = records.map((record) =>
            record === records.at(-1) &&
            record.kind === 'jev_answered' &&
            first?.kind === 'jev_answered'
                ? {
                      ...record,
                      content: {
                          ...record.content,
                          asked_seq: first.content.asked_seq,
                      },
                  }
                : record
        )

        expect(jobOf(linesOf([twice]), ORDER)[0]).toBe(
            `  ${ORDER}: 1 answer, 1 right (100%)`
        )
    })

    test('a decision model with no counted answer gets no group', () => {
        const lines = reportOf([
            ...order({ confidence: 0.95 }),
            ...order({ confidence: null, model: 'clef-flash' }),
        ])

        expect(lines).toContain('decision model: clef')
        expect(lines).not.toContain('decision model: clef-flash')
    })

    test('with only answers from Jev, the section is one line', () => {
        const lines = reportOf([
            ...clefAnswer({
                job: 'ticket_order',
                fixed: 'ticket_12',
                value: 'ticket_12',
                confidence: 0.95,
            }),
            ...clefAnswer({
                job: 'failure_kind',
                step: 'agent_failed',
                fixed: 'agent',
                value: 'agent',
                confidence: 0.95,
            }),
            ...clefAnswer({
                job: 'finding_severity',
                fixed: 'blocker',
                value: 1.9,
                confidence: 0.95,
            }),
        ])

        expect(lines.slice(-2)).toEqual([
            '',
            'Calibration: no ticket_order, failure_kind or finding_severity answers from Clef yet.',
        ])
    })
})

describe('the decision model doc on calibration (#723)', async () => {
    const doc = await Bun.file(
        join(import.meta.dir, '../../docs/decision-model.md')
    ).text()

    test('has a Calibration paragraph after the model trial paragraphs, just before Writers effort', () => {
        const paragraphs = doc.split(/\n\s*\n/).map((each) => each.trim())
        const at = (start: string) =>
            paragraphs.findIndex((each) => each.startsWith(start))
        const calibration = at('**Calibration.**')

        expect(calibration).toBeGreaterThan(at('**Model trial (#698).**'))
        expect(calibration).toBe(at("**Writers' effort (#660).**") - 1)
    })
})
