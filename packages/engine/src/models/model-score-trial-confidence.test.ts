import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels } from './model-score'

import type { JournalEntry } from '../journal/journal-record'
import {
    roleSection,
    runOf,
    ticketRun,
    type Ask,
    type Built,
    type Effort,
    type Model,
    type Severity,
} from '../testing/model-score-fixtures'

/**
 * The model trial by Clef's confidence (#725): per writer role, its trial
 * tickets against its control tickets (#698), by the confidence of the
 * role's first `agent_model` answer from a decision model, kept apart by
 * decision model and by the ticket review's effort, with a suggested bar.
 * Every ticket changes 100 lines, so a ticket's weighted findings are its
 * rate, and a ticket whose first review blocks has one fix round.
 */

const HEADING = "model trial, by Clef's confidence"

/** A block's heading for `model`'s answers on tickets reviewed at `review`. */
const heading = (model: string, review: Effort): string =>
    `  ${HEADING} (decision model ${model}, reviewed at ${review}, every model and effort):`

const CLEAN_SIDE = (count: number): string =>
    `${count} ticket${count === 1 ? '' : 's'}, 0.00 findings per 100 lines, 0.00 fix rounds per ticket`

/**
 * #`ticket`, its test-writer in `group`, after `asks`: a trial ticket ran
 * `tw` (sonnet unless told) for the trial, a control ticket ran opus.
 */
const grouped = ({
    ticket,
    group,
    asks,
    tw,
    tw_effort = 'medium',
    review = 'xhigh',
    findings = [],
}: {
    ticket: number
    group: 'trial' | 'control'
    asks: Ask[]
    tw?: Model
    tw_effort?: Effort
    review?: Effort
    findings?: Severity[]
}): JournalEntry[] =>
    ticketRun({
        ticket,
        tw: group === 'trial' ? (tw ?? 'sonnet') : 'opus',
        tw_effort,
        impl_effort: 'medium',
        review_effort: review,
        asks,
        findings,
    }).map((entry) =>
        entry.kind === 'agent_started' && entry.role === 'test-writer'
            ? {
                  ...entry,
                  content: {
                      ...entry.content,
                      model_reason: group === 'trial' ? 'trial' : 'unsure',
                      trial_group: group,
                  },
              }
            : entry
    )

/**
 * #`ticket` in `group`, where `model` (clef unless told) picked sonnet for
 * the test-writer at `confidence`.
 */
const trialTicket = ({
    ticket,
    group,
    confidence,
    model = 'clef',
    ...rest
}: {
    ticket: number
    group: 'trial' | 'control'
    confidence: number
    model?: string
    tw?: Model
    tw_effort?: Effort
    review?: Effort
    findings?: Severity[]
}): JournalEntry[] =>
    grouped({
        ticket,
        group,
        asks: [
            {
                role: 'test-writer',
                pick: 'sonnet',
                confidence,
                acted: false,
                model,
            },
        ],
        ...rest,
    })

/**
 * `count` tickets from #`first` in `group`, each at `confidence`, with
 * `findings` at its first review.
 */
const many = ({
    first,
    count,
    group,
    confidence,
    model,
    review,
    findings,
}: {
    first: number
    count: number
    group: 'trial' | 'control'
    confidence: number
    model?: string
    review?: Effort
    findings?: Severity[]
}): JournalEntry[] =>
    Array.from({ length: count }, (_, index) =>
        trialTicket({
            ticket: first + index,
            group,
            confidence,
            model,
            review,
            findings,
        })
    ).flat()

/** `role`'s printed part of the report of one run of `body`. */
const sectionOf = (body: JournalEntry[], role: Built = 'test-writer') =>
    roleSection(
        formatModelReport({ report: scoreModels({ runs: [runOf(body)] }) }),
        role
    )

/** The lines of the block under `title`, up to and with its bar line. */
const blockOf = (section: string[], title: string): string[] => {
    const start = section.indexOf(title)
    if (start < 0) return []
    const end = section.findIndex(
        (line, at) => at > start && line.startsWith('    suggested bar: ')
    )
    return section.slice(start, end < 0 ? undefined : end + 1)
}

const BLOCKER: Severity[] = ['blocker']

/** 12 clean tickets from #`first` in `group`, each at `confidence`. */
const twelve = (
    first: number,
    group: 'trial' | 'control',
    confidence: number
): JournalEntry[] => many({ first, count: 12, group, confidence })

/** 12 clean trial and 12 clean control tickets at 0.4. */
const CLEAN_AT_04 = [
    ...twelve(101, 'trial', 0.4),
    ...twelve(201, 'control', 0.4),
]

describe("the model trial by Clef's confidence (#725)", () => {
    test("12 clean trial and 12 clean control tickets at 0.4 print the block right after the test-writer's effort-picks block", () => {
        const writer = sectionOf(CLEAN_AT_04)
        const last_band = writer.findIndex((line) =>
            line.startsWith('      0.5 and up: wanted more ')
        )
        expect(last_band).toBeGreaterThan(0)
        expect(writer.slice(last_band + 1, last_band + 4)).toEqual([
            heading('clef', 'xhigh'),
            `    0.3 to 0.5: trial ${CLEAN_SIDE(12)}; control ${CLEAN_SIDE(12)}; verdict: about the same`,
            '    suggested bar: 0.3',
        ])
    })

    test('trial tickets on every model and effort are pooled into one band line', () => {
        const runs: [Model, Effort][] = [
            ['sonnet', 'medium'],
            ['sonnet', 'high'],
            ['haiku', 'medium'],
            ['haiku', 'high'],
        ]
        const writer = sectionOf([
            ...runs.flatMap(([tw, tw_effort], at) =>
                [0, 1, 2].flatMap((index) =>
                    trialTicket({
                        ticket: 101 + at * 3 + index,
                        group: 'trial',
                        confidence: 0.4,
                        tw,
                        tw_effort,
                    })
                )
            ),
            ...twelve(201, 'control', 0.4),
        ])
        const block = blockOf(writer, heading('clef', 'xhigh'))
        const bands = block.slice(1, -1)
        expect(bands).toHaveLength(1)
        expect(bands[0]).toStartWith('    0.3 to 0.5: trial 12 tickets, ')
    })

    test('a confidence of exactly 0.3 is in the 0.3 to 0.5 band', () => {
        const writer = sectionOf([
            ...trialTicket({ ticket: 11, group: 'trial', confidence: 0.3 }),
            ...trialTicket({ ticket: 12, group: 'control', confidence: 0.3 }),
        ])
        expect(writer).toContain(
            `    0.3 to 0.5: trial ${CLEAN_SIDE(1)}; control ${CLEAN_SIDE(1)}; verdict: not enough data`
        )
    })

    test('2 trial and 3 control tickets are not enough data, and give no bar', () => {
        const block = blockOf(
            sectionOf([
                ...many({
                    first: 11,
                    count: 2,
                    group: 'trial',
                    confidence: 0.4,
                }),
                ...many({
                    first: 21,
                    count: 3,
                    group: 'control',
                    confidence: 0.4,
                }),
            ]),
            heading('clef', 'xhigh')
        )
        expect(block[1]).toEndWith('; verdict: not enough data')
        expect(block.at(-1)).toBe('    suggested bar: none yet')
    })

    test('trial tickets that each find a blocker against clean control tickets are worse, and give no bar', () => {
        const writer = sectionOf([
            ...many({
                first: 101,
                count: 12,
                group: 'trial',
                confidence: 0.4,
                findings: BLOCKER,
            }),
            ...twelve(201, 'control', 0.4),
        ])
        const block = blockOf(writer, heading('clef', 'xhigh'))
        expect(block.slice(1)).toEqual([
            `    0.3 to 0.5: trial 12 tickets, 3.00 findings per 100 lines, 1.00 fix rounds per ticket; control ${CLEAN_SIDE(12)}; verdict: worse`,
            '    suggested bar: none yet',
        ])
    })

    test('a worse band below one that holds ends the walk at the band that holds', () => {
        const writer = sectionOf([
            ...CLEAN_AT_04,
            ...many({
                first: 301,
                count: 12,
                group: 'trial',
                confidence: 0.2,
                findings: BLOCKER,
            }),
            ...twelve(401, 'control', 0.2),
        ])
        expect(blockOf(writer, heading('clef', 'xhigh')).at(-1)).toBe(
            '    suggested bar: 0.3'
        )
    })

    test('two bands that both hold suggest a bar of 0', () => {
        const writer = sectionOf([
            ...CLEAN_AT_04,
            ...twelve(301, 'trial', 0.2),
            ...twelve(401, 'control', 0.2),
        ])
        expect(blockOf(writer, heading('clef', 'xhigh')).at(-1)).toBe(
            '    suggested bar: 0'
        )
    })

    test('a band with no trial or control ticket prints no line', () => {
        const block = blockOf(sectionOf(CLEAN_AT_04), heading('clef', 'xhigh'))
        expect(block.length).toBeGreaterThan(0)
        expect(block.some((line) => line.startsWith('    0.5 to 0.7:'))).toBe(
            false
        )
    })

    test('answers from two decision models print two blocks, in name order', () => {
        const flash = '@cf/cloudflare/clef-flash'
        const writer = sectionOf([
            ...CLEAN_AT_04,
            ...many({
                first: 301,
                count: 12,
                group: 'trial',
                confidence: 0.4,
                model: flash,
            }),
            ...many({
                first: 401,
                count: 12,
                group: 'control',
                confidence: 0.4,
                model: flash,
            }),
        ])
        const clef = blockOf(writer, heading('clef', 'xhigh'))
        const clef_flash = blockOf(writer, heading('clef-flash', 'xhigh'))
        expect(clef[1]).toStartWith('    0.3 to 0.5: trial 12 tickets, ')
        expect(clef_flash[1]).toStartWith('    0.3 to 0.5: trial 12 tickets, ')
        const at = writer.indexOf(heading('clef', 'xhigh'))
        expect(writer[at + clef.length]).toBe(heading('clef-flash', 'xhigh'))
    })

    test('tickets reviewed at two efforts print two blocks, in effort order', () => {
        const writer = sectionOf([
            ...CLEAN_AT_04,
            ...many({
                first: 301,
                count: 12,
                group: 'trial',
                confidence: 0.4,
                review: 'high',
            }),
            ...many({
                first: 401,
                count: 12,
                group: 'control',
                confidence: 0.4,
                review: 'high',
            }),
        ])
        const high = blockOf(writer, heading('clef', 'high'))
        const xhigh = blockOf(writer, heading('clef', 'xhigh'))
        expect(high[1]).toStartWith('    0.3 to 0.5: trial 12 tickets, ')
        expect(xhigh[1]).toStartWith('    0.3 to 0.5: trial 12 tickets, ')
        const at = writer.indexOf(heading('clef', 'high'))
        expect(writer[at + high.length]).toBe(heading('clef', 'xhigh'))
    })

    test("Jev's agent_model answers and ticket_model answers give no block", () => {
        const jev: Ask = {
            role: 'test-writer',
            pick: 'sonnet',
            confidence: 0.4,
            acted: false,
        }
        const old: Ask = {
            role: null,
            pick: 'claude-sonnet-5',
            confidence: 0.4,
            model: 'clef',
        }
        const clef: Ask = { ...jev, model: 'clef' }
        const run = (first: Ask[], second: Ask[]) =>
            sectionOf(
                [
                    ...[11, 12].map((ticket) => ({ ticket, asks: first })),
                    ...[13, 14].map((ticket) => ({ ticket, asks: second })),
                ].flatMap(({ ticket, asks }) =>
                    grouped({
                        ticket,
                        group: ticket % 2 === 1 ? 'trial' : 'control',
                        asks,
                    })
                )
            )
        // The same tickets with Clef's agent_model answers get a block.
        expect(run([clef], [clef])).toContain(heading('clef', 'xhigh'))
        const writer = run([jev], [old])
        expect(writer.length).toBeGreaterThan(0)
        expect(writer.some((line) => line.includes(HEADING))).toBe(false)
    })

    test('a role with no trial or control tickets gets no block', () => {
        const text = formatModelReport({
            report: scoreModels({ runs: [runOf(CLEAN_AT_04)] }),
        })
        expect(roleSection(text, 'test-writer')).toContain(
            heading('clef', 'xhigh')
        )
        const implementer = roleSection(text, 'implementer')
        expect(implementer.length).toBeGreaterThan(0)
        expect(implementer.some((line) => line.includes(HEADING))).toBe(false)
    })
})
