import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels } from './model-score'

import type { JournalEntry } from '../journal/journal-record'
import {
    effortPicksOf,
    pickedTicket,
    pickSection,
    runWithBar,
    type EffortPick,
} from '../testing/effort-pick-fixtures'
import {
    runOf,
    type Effort,
    type Severity,
} from '../testing/model-score-fixtures'

/**
 * The score report's "Clef's effort picks (shadow mode)" section (#663):
 * per writer role, the tickets where Clef's `agent_effort` answer, at or
 * above the confidence bar, wanted more effort than the agent ran at,
 * against the rest. Every ticket changes 100 lines, so a ticket's weighted
 * findings are its rate, and a ticket whose first review blocks has one
 * fix round.
 */

/** Weighs 5: one fix round, and 5 per 100 lines. */
const FIVE: Severity[] = ['blocker', 'should_fix', 'should_fix']

/** Clef wanted `pick` for the test-writer. */
const tw = (pick: Effort, confidence: number | null = 0.9): EffortPick => ({
    role: 'test-writer',
    pick,
    confidence,
})

/** Clef wanted `pick` for the implementer. */
const impl = (pick: Effort): EffortPick => ({
    role: 'implementer',
    pick,
    confidence: 0.9,
})

/** Whether one of `lines` is indented and matches `pattern` to its end. */
const hasLine = (lines: string[], pattern: string): boolean =>
    lines.some((line) => new RegExp(`^\\s+${pattern}$`).test(line))

/** A group's line in the section, its label left loose. */
const groupLine = (label: 'wanted more' | 'rest', side: string): string =>
    `${label === 'rest' ? '[^:]*rest' : 'wanted more'}[^:]*: ${side}`

/**
 * One run: a ticket per item of `wanted`, where Clef wanted high for the
 * test-writer at medium, then one per item of `rest`, where it wanted
 * medium; each item is the ticket's first-review findings.
 */
const reportOf = ({
    wanted,
    rest,
}: {
    wanted: Severity[][]
    rest: Severity[][]
}) => {
    const side = (
        list: Severity[][],
        first: number,
        pick: Effort
    ): JournalEntry[] =>
        list.flatMap((findings, index) =>
            pickedTicket({ ticket: first + index, findings, picks: [tw(pick)] })
        )
    const report = scoreModels({
        runs: [
            runOf([...side(wanted, 11, 'high'), ...side(rest, 51, 'medium')]),
        ],
    })
    return {
        picks: effortPicksOf(report, 'test-writer'),
        section: pickSection(formatModelReport({ report }), 'test-writer'),
    }
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

/** `count` tickets, each weighing 5. */
const allFive = (count: number): Severity[][] =>
    Array.from({ length: count }, () => FIVE)

/** 10 tickets, 5 of them weighing 5: 2.5 per 100 lines, 0.5 fix rounds. */
const REST = tickets({ count: 10, blocking: allFive(5) })

describe("Clef's effort picks (shadow mode)", () => {
    test("each writer role's part of the report has the section, with each group's weighted findings per 100 lines and fix rounds per ticket", () => {
        const report = scoreModels({
            runs: [
                runOf([
                    ...pickedTicket({
                        ticket: 11,
                        findings: FIVE,
                        picks: [tw('high'), impl('medium')],
                    }),
                    ...pickedTicket({
                        ticket: 12,
                        picks: [tw('xhigh'), impl('medium')],
                    }),
                    ...pickedTicket({ ticket: 13, picks: [tw('medium')] }),
                ]),
            ],
        })
        const text = formatModelReport({ report })
        const writer = pickSection(text, 'test-writer')
        const rates = (a: string, b: string) =>
            `${a} findings per 100 lines, ${b} fix rounds per ticket`
        expect(
            hasLine(
                writer,
                groupLine(
                    'wanted more',
                    `2 tickets, ${rates('2\\.50', '0\\.50')}`
                )
            )
        ).toBe(true)
        expect(
            hasLine(
                writer,
                groupLine('rest', `1 ticket, ${rates('0\\.00', '0\\.00')}`)
            )
        ).toBe(true)
        expect(hasLine(writer, 'verdict: not enough data')).toBe(true)
        const implementer = pickSection(text, 'implementer')
        expect(
            hasLine(
                implementer,
                groupLine('wanted more', `0 tickets, ${rates('-', '-')}`)
            )
        ).toBe(true)
        expect(
            hasLine(
                implementer,
                groupLine('rest', `2 tickets, ${rates('2\\.50', '0\\.50')}`)
            )
        ).toBe(true)
        expect(hasLine(implementer, 'verdict: not enough data')).toBe(true)
    })

    test("a ticket wants more effort when the role's answer is above the effort its agent ran at, in the order medium, high, xhigh, and is in the rest when the same or lower", () => {
        const ticket = (
            number: number,
            tw_effort: Effort,
            picks: EffortPick[],
            findings: Severity[] = []
        ) => pickedTicket({ ticket: number, tw_effort, picks, findings })
        const report = scoreModels({
            runs: [
                runOf([
                    // Wanted more, each weighing 5.
                    ...ticket(21, 'medium', [tw('high')], FIVE),
                    ...ticket(22, 'medium', [tw('xhigh')], FIVE),
                    ...ticket(23, 'high', [tw('xhigh')], FIVE),
                    // The rest, clean.
                    ...ticket(24, 'high', [tw('medium')]),
                    ...ticket(25, 'xhigh', [tw('high')]),
                    ...ticket(26, 'high', [tw('high')]),
                    // The implementer, at medium, is wanted at xhigh; the
                    // test-writer is not.
                    ...ticket(27, 'xhigh', [tw('xhigh'), impl('xhigh')]),
                ]),
            ],
        })
        expect(effortPicksOf(report, 'test-writer')).toMatchObject({
            wanted_more: {
                tickets: 3,
                findings_per_100_lines: 5,
                fix_rounds_per_ticket: 1,
            },
            rest: {
                tickets: 4,
                findings_per_100_lines: 0,
                fix_rounds_per_ticket: 0,
            },
        })
        expect(effortPicksOf(report, 'implementer')).toMatchObject({
            wanted_more: {
                tickets: 1,
                findings_per_100_lines: 0,
                fix_rounds_per_ticket: 0,
            },
            rest: { tickets: 0 },
        })
    })

    test("a ticket with no answer at or above the run's confidence bar is in neither group", () => {
        const at_default_bar = runOf([
            ...pickedTicket({ ticket: 31, picks: [tw('high', 0.8)] }),
            ...pickedTicket({
                ticket: 32,
                findings: FIVE,
                picks: [tw('high', 0.79)],
            }),
            ...pickedTicket({ ticket: 33, findings: FIVE }),
            ...pickedTicket({
                ticket: 34,
                findings: FIVE,
                picks: [tw('xhigh', null)],
            }),
            ...pickedTicket({ ticket: 35, picks: [tw('medium')] }),
        ])
        const at_higher_bar = runWithBar(
            [
                ...pickedTicket({
                    ticket: 41,
                    findings: FIVE,
                    picks: [tw('high', 0.9)],
                }),
                ...pickedTicket({ ticket: 42, picks: [tw('medium', 0.95)] }),
            ],
            0.95
        )
        const report = scoreModels({ runs: [at_default_bar, at_higher_bar] })
        // #31 wanted more; #35 and #42 are the rest.
        expect(effortPicksOf(report, 'test-writer')).toMatchObject({
            wanted_more: { tickets: 1, findings_per_100_lines: 0 },
            rest: { tickets: 2, findings_per_100_lines: 0 },
        })
    })
})

describe("the verdict on Clef's effort picks", () => {
    test('is not enough data while either group has fewer than 10 tickets', () => {
        const few_wanted = reportOf({
            wanted: allFive(9),
            rest: tickets({ count: 10 }),
        })
        expect(few_wanted.picks).toMatchObject({
            wanted_more: { tickets: 9 },
            rest: { tickets: 10 },
            verdict: 'not enough data',
        })
        expect(hasLine(few_wanted.section, 'verdict: not enough data')).toBe(
            true
        )
        const few_rest = reportOf({
            wanted: allFive(10),
            rest: tickets({ count: 9 }),
        })
        expect(few_rest.picks?.verdict).toBe('not enough data')
    })

    test('is no sign yet at exactly 20% above the rest', () => {
        // 6 tickets weighing 5: 3.0 per 100 lines and 0.6 fix rounds.
        const { picks, section } = reportOf({
            wanted: tickets({ count: 10, blocking: allFive(6) }),
            rest: REST,
        })
        expect(picks).toMatchObject({
            wanted_more: {
                tickets: 10,
                findings_per_100_lines: 3,
                fix_rounds_per_ticket: 0.6,
            },
            rest: {
                tickets: 10,
                findings_per_100_lines: 2.5,
                fix_rounds_per_ticket: 0.5,
            },
            verdict: 'no sign yet',
        })
        expect(hasLine(section, 'verdict: no sign yet')).toBe(true)
    })

    test('is Clef spots hard tickets past 20% above the rest, in findings or in fix rounds', () => {
        // 3.1 per 100 lines, still 0.6 fix rounds.
        const more_findings = reportOf({
            wanted: tickets({
                count: 10,
                blocking: [...allFive(5), ['blocker', 'blocker']],
            }),
            rest: REST,
        })
        expect(more_findings.picks?.verdict).toBe('Clef spots hard tickets')
        expect(
            hasLine(more_findings.section, 'verdict: Clef spots hard tickets')
        ).toBe(true)
        // 2.5 per 100 lines, as the rest, but 0.7 fix rounds.
        const more_rounds = reportOf({
            wanted: tickets({
                count: 10,
                blocking: [
                    ...allFive(2),
                    ...Array.from({ length: 5 }, (): Severity[] => ['blocker']),
                ],
            }),
            rest: REST,
        })
        expect(more_rounds.picks?.verdict).toBe('Clef spots hard tickets')
    })
})
