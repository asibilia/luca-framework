import { describe, expect, test } from 'bun:test'

import {
    evidenceSection,
    MAX_EVIDENCE_NAME,
    MAX_EVIDENCE_TESTS,
} from './evidence-text'

import type { TestRef } from '../agents/role-results'
import {
    EMPTY_TICKET_PROGRESS,
    type ReplayedSnapshot,
    type TicketProgress,
} from '../journal/replay'
import { practiceTicket } from '../testing/build-fixtures'

/**
 * The PR's Evidence section (#513), from the journal alone: for each ticket
 * in the run, the new tests its red check proved fail first, and whether
 * the gates pass them now. An already-done ticket and a refactor ticket say
 * why they have no new tests.
 */

const HEADING =
    "## Evidence\n\nEach ticket's new tests failed before its code was written (the red check), and pass now (the gates)."

const snapshot = ({
    order,
    refactor,
}: {
    order: number[]
    /** The tickets labeled `refactor`. */
    refactor?: number[]
}): ReplayedSnapshot => ({
    spec: {
        number: 10,
        title: 'Spec',
        body: '',
        labels: [],
        url: 'https://github.com/acme/app/issues/10',
        author: 'owner',
    },
    ticket_order: order,
    closed_tickets: [],
    tickets: Object.fromEntries(
        order.map((number) => [
            number,
            practiceTicket({
                number,
                labels: (refactor ?? []).includes(number)
                    ? ['ready-for-agent', 'refactor']
                    : ['ready-for-agent'],
            }),
        ])
    ),
    left_out: [],
})

const tests = (names: string[]): TestRef[] =>
    names.map((name) => ({ file: 'src/sum.test.ts', name }))

const passing = (red_tests: TestRef[]): TicketProgress => ({
    ...EMPTY_TICKET_PROGRESS,
    red_tests,
    gates: { ok: true, checks: [] },
})

describe('the Evidence section', () => {
    test('names the new tests that failed first and pass now', () => {
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11, 12] }),
                tickets: {
                    11: passing(tests(['sum > adds', 'sum > subtracts'])),
                    12: passing(tests(['menu shows the item'])),
                },
            })
        ).toBe(
            [
                HEADING,
                '- #11: 2 new tests failed first, now pass: sum > adds, sum > subtracts\n' +
                    '- #12: 1 new test failed first, now passes: menu shows the item',
            ].join('\n\n')
        )
    })

    test('a join gate pass counts as passing too', () => {
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11] }),
                tickets: {
                    11: {
                        ...EMPTY_TICKET_PROGRESS,
                        red_tests: tests(['sum > adds']),
                        join_gates: { ok: true, checks: [] },
                    },
                },
            })
        ).toContain('- #11: 1 new test failed first, now passes: sum > adds')
    })

    test('a refactor ticket has no new tests, and its old tests still pass', () => {
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11], refactor: [11] }),
                tickets: { 11: passing([]) },
            })
        ).toBe(
            `${HEADING}\n\n- #11: a refactor, so no new tests; the old tests still pass.`
        )
    })

    test('an already-done ticket has no new tests', () => {
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11] }),
                tickets: {
                    11: {
                        ...EMPTY_TICKET_PROGRESS,
                        already_done: { shas: ['3559c25f5'] },
                    },
                },
            })
        ).toBe(
            `${HEADING}\n\n- #11: already done on the base branch, so no new tests.`
        )
    })

    test(`a long list names the first ${MAX_EVIDENCE_TESTS} tests, then how many more`, () => {
        const names = Array.from({ length: 12 }, (_, index) => `t${index + 1}`)
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11] }),
                tickets: { 11: passing(tests(names)) },
            })
        ).toContain(
            '- #11: 12 new tests failed first, now pass: t1, t2, t3, t4, t5, and 7 more'
        )
    })

    test('a very long test name is clipped', () => {
        const long = 'x'.repeat(200)
        const section = evidenceSection({
            snapshot: snapshot({ order: [11] }),
            tickets: { 11: passing(tests([long])) },
        })
        expect(section).toContain(
            `now passes: ${'x'.repeat(MAX_EVIDENCE_NAME - 1)}…`
        )
        expect(section).not.toContain(long)
    })

    test('a ticket whose gates have not passed says so', () => {
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11, 12] }),
                tickets: {
                    11: {
                        ...EMPTY_TICKET_PROGRESS,
                        red_tests: tests(['sum > adds', 'sum > subtracts']),
                        gates: { ok: false, checks: [] },
                    },
                    12: {
                        ...EMPTY_TICKET_PROGRESS,
                        red_tests: tests(['menu shows the item']),
                    },
                },
            })
        ).toBe(
            [
                HEADING,
                '- #11: 2 new tests failed first; the gates have not passed them yet: sum > adds, sum > subtracts\n' +
                    '- #12: 1 new test failed first; the gates have not passed it yet: menu shows the item',
            ].join('\n\n')
        )
    })

    test('a ticket with no red check recorded says so', () => {
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11] }),
                tickets: {},
            })
        ).toBe(`${HEADING}\n\n- #11: no red check recorded.`)
    })

    test('skipped tickets are left out, and a run with no ticket has no section', () => {
        const skipped: TicketProgress = {
            ...EMPTY_TICKET_PROGRESS,
            skipped: { because: null },
        }
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11, 12] }),
                tickets: { 11: passing(tests(['sum > adds'])), 12: skipped },
            })
        ).not.toContain('#12')
        expect(
            evidenceSection({
                snapshot: snapshot({ order: [11] }),
                tickets: { 11: skipped },
            })
        ).toBe('')
        expect(
            evidenceSection({ snapshot: snapshot({ order: [] }), tickets: {} })
        ).toBe('')
    })
})
