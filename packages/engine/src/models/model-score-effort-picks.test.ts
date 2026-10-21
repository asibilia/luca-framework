import { describe, expect, test } from 'bun:test'

import { formatModelReport, scoreModels } from './model-score'

import type { Effort } from '../config/engine-config'
import {
    effortAsk,
    runOf,
    ticketRun,
    type Built,
    type Severity,
} from '../testing/model-score-fixtures'

/**
 * The "Clef's effort picks (shadow mode)" section of `luca models` (#663):
 * for each writer role, the tickets where Clef's `agent_effort` answer, at
 * or above the confidence bar (0.8 by default), was higher than the effort
 * the agent ran at, against the rest. Every ticket changes 100 lines and is
 * reviewed at xhigh, so a ticket's weighted findings are its rate, and a
 * ticket whose first review blocks has one fix round.
 */

const HEADING = "Clef's effort picks (shadow mode)"

const VERDICTS = [
    'not enough data',
    'Clef spots hard tickets',
    'no sign yet',
] as const

/**
 * One ticket: Clef answered `role`'s `agent_effort` ask with `pick` at
 * `confidence` (no ask without a pick), `role` ran at `ran`, and the other
 * writer at medium.
 */
type Picked = {
    role?: Built
    pick?: Effort
    confidence?: number | null
    ran?: Effort
    findings?: Severity[]
}

/** The report `luca models` prints for one run of `picked` tickets. */
const textOf = (picked: Picked[]): string => {
    const body = picked.flatMap(
        (
            {
                role = 'test-writer',
                pick,
                confidence = 0.9,
                ran = 'medium',
                findings = [],
            },
            index
        ) => {
            const ticket = 11 + index
            return [
                ...(pick === undefined
                    ? []
                    : effortAsk({ ticket, role, pick, confidence, ran })),
                ...ticketRun({
                    ticket,
                    findings,
                    tw_effort: role === 'test-writer' ? ran : 'medium',
                    impl_effort: role === 'implementer' ? ran : 'medium',
                    review_effort: 'xhigh',
                }),
            ]
        }
    )
    return formatModelReport({ report: scoreModels({ runs: [runOf(body)] }) })
}

/**
 * `role`'s section: its heading after the role's own line, up to the next
 * line that isn't indented.
 */
const sectionOf = (text: string, role: Built): string[] => {
    const lines = text.split('\n')
    const from = lines.indexOf(role)
    const at = lines.findIndex(
        (line, index) => index > from && line.includes(HEADING)
    )
    const end = lines.findIndex((line, index) => index > at && /^\S/.test(line))
    return at === -1 ? [] : lines.slice(at, end === -1 ? undefined : end)
}

/** A group's line in a section, as numbers and the rates as printed. */
const groupOf = (section: string[], group: 'wanted more' | 'rest') => {
    const line =
        section.find((text) =>
            group === 'wanted more'
                ? /wanted more/i.test(text) && /tickets?\b/.test(text)
                : /\brest\b/i.test(text) && !/wanted more/i.test(text)
        ) ?? ''
    return {
        tickets: Number(/(\d+) tickets?\b/.exec(line)?.[1] ?? Number.NaN),
        findings: /(\S+) findings per 100 lines/.exec(line)?.[1],
        fix_rounds: /(\S+) fix rounds per ticket/.exec(line)?.[1],
    }
}

const verdictsIn = (section: string[]) =>
    VERDICTS.filter((verdict) => section.some((line) => line.includes(verdict)))

/** Tickets where Clef wanted high and the agent ran medium. */
const wantedMore = (list: Severity[][], role: Built = 'test-writer') =>
    list.map((findings): Picked => ({ role, pick: 'high', findings }))

/** Tickets where Clef wanted medium and the agent ran medium. */
const rest = (list: Severity[][], role: Built = 'test-writer') =>
    list.map((findings): Picked => ({ role, pick: 'medium', findings }))

/** `count` tickets: `blocking` of them with `findings`, the rest clean. */
const tickets = (count: number, blocking: Severity[][] = []): Severity[][] =>
    Array.from({ length: count }, (_, index) => blocking[index] ?? [])

/** Weighs 5: one fix round, and 5 per 100 lines. */
const FIVE: Severity[] = ['blocker', 'should_fix', 'should_fix']

/** `count` tickets, each weighing 5. */
const fives = (count: number): Severity[][] =>
    Array.from({ length: count }, () => FIVE)

/** 10 tickets, 5 of them weighing 5: 2.5 per 100 lines, 0.5 fix rounds. */
const BASELINE = tickets(10, [FIVE, FIVE, FIVE, FIVE, FIVE])

describe("Clef's effort picks (shadow mode)", () => {
    test('the test-writer and the implementer each have the section in their own lines', () => {
        const lines = textOf([
            { role: 'test-writer', pick: 'high' },
            { role: 'implementer', pick: 'xhigh' },
        ]).split('\n')
        const headings = lines.flatMap((line, index) =>
            line.includes(HEADING) ? [index] : []
        )
        const implementer = lines.indexOf('implementer')
        const learner = lines.findIndex((line) => line.startsWith('learner'))
        expect(headings).toHaveLength(2)
        expect(headings[0]).toBeGreaterThan(lines.indexOf('test-writer'))
        expect(headings[0]).toBeLessThan(implementer)
        expect(headings[1]).toBeGreaterThan(implementer)
        expect(headings[1]).toBeLessThan(learner)
    })

    test('the wanted-more group holds the tickets where an answer at or above the bar was higher than the effort the agent ran at', () => {
        const section = sectionOf(
            textOf([
                { pick: 'high', ran: 'medium' },
                { pick: 'xhigh', ran: 'medium', confidence: 0.8 },
                { pick: 'xhigh', ran: 'high' },
                { pick: 'xhigh', ran: 'xhigh' },
            ]),
            'test-writer'
        )
        expect(groupOf(section, 'wanted more').tickets).toBe(3)
        expect(groupOf(section, 'rest').tickets).toBe(1)
    })

    test('the other group holds the tickets where the answer was the same as or lower than the effort the agent ran at', () => {
        const section = sectionOf(
            textOf([
                { pick: 'medium', ran: 'medium' },
                { pick: 'medium', ran: 'high' },
                { pick: 'high', ran: 'xhigh' },
                { pick: 'high', ran: 'high', confidence: 0.8 },
                { pick: 'high', ran: 'medium' },
            ]),
            'test-writer'
        )
        expect(groupOf(section, 'rest').tickets).toBe(4)
        expect(groupOf(section, 'wanted more').tickets).toBe(1)
    })

    test('tickets with no answer at or above the bar, or only the other role answered, are in neither group', () => {
        const text = textOf([
            { pick: 'xhigh', confidence: 0.79 },
            { pick: 'xhigh', confidence: null },
            {},
            { role: 'implementer', pick: 'xhigh' },
            { pick: 'medium' },
        ])
        const writer = sectionOf(text, 'test-writer')
        expect(groupOf(writer, 'wanted more').tickets).toBe(0)
        expect(groupOf(writer, 'rest').tickets).toBe(1)
        const implementer = sectionOf(text, 'implementer')
        expect(groupOf(implementer, 'wanted more').tickets).toBe(1)
        expect(groupOf(implementer, 'rest').tickets).toBe(0)
    })

    test('is not enough data while either group has fewer than 10 tickets', () => {
        const few_wanted = sectionOf(
            textOf([...wantedMore(fives(9)), ...rest(tickets(10))]),
            'test-writer'
        )
        expect(groupOf(few_wanted, 'wanted more').tickets).toBe(9)
        expect(verdictsIn(few_wanted)).toEqual(['not enough data'])
        const few_rest = sectionOf(
            textOf([...wantedMore(fives(10)), ...rest(tickets(9))]),
            'test-writer'
        )
        expect(groupOf(few_rest, 'rest').tickets).toBe(9)
        expect(verdictsIn(few_rest)).toEqual(['not enough data'])
    })

    test("shows each group's findings per 100 lines and fix rounds per ticket, and is no sign yet at exactly 20% above the rest", () => {
        // 6 tickets weighing 5: 3.0 per 100 lines and 0.6 fix rounds.
        const section = sectionOf(
            textOf([
                ...wantedMore([...fives(6), ...tickets(4)]),
                ...rest(BASELINE),
            ]),
            'test-writer'
        )
        expect(groupOf(section, 'wanted more')).toEqual({
            tickets: 10,
            findings: '3.00',
            fix_rounds: '0.60',
        })
        expect(groupOf(section, 'rest')).toEqual({
            tickets: 10,
            findings: '2.50',
            fix_rounds: '0.50',
        })
        expect(verdictsIn(section)).toEqual(['no sign yet'])
    })

    test('is Clef spots hard tickets past 20% above the rest in findings', () => {
        // 3.1 per 100 lines, still 0.6 fix rounds.
        const section = sectionOf(
            textOf([
                ...wantedMore(
                    tickets(10, [
                        FIVE,
                        FIVE,
                        FIVE,
                        FIVE,
                        FIVE,
                        ['blocker', 'blocker'],
                    ])
                ),
                ...rest(BASELINE),
            ]),
            'test-writer'
        )
        expect(verdictsIn(section)).toEqual(['Clef spots hard tickets'])
    })

    test("is Clef spots hard tickets past 20% above the rest in fix rounds alone, for the implementer's own picks", () => {
        // 2.5 per 100 lines, as the rest, but 0.7 fix rounds.
        const section = sectionOf(
            textOf([
                ...wantedMore(
                    tickets(10, [
                        FIVE,
                        FIVE,
                        ['blocker'],
                        ['blocker'],
                        ['blocker'],
                        ['blocker'],
                        ['blocker'],
                    ]),
                    'implementer'
                ),
                ...rest(BASELINE, 'implementer'),
            ]),
            'implementer'
        )
        expect(groupOf(section, 'wanted more')).toEqual({
            tickets: 10,
            findings: '2.50',
            fix_rounds: '0.70',
        })
        expect(groupOf(section, 'rest').fix_rounds).toBe('0.50')
        expect(verdictsIn(section)).toEqual(['Clef spots hard tickets'])
    })
})
