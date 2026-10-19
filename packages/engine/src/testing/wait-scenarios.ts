import { ticketIssue } from './intake-fixtures'
import {
    journalRecords,
    waitUntil,
    type ManyTicketsScenario,
} from './many-tickets'
import {
    APPROVE,
    IMPLEMENTER_RESULT,
    PRACTICE_SPEC_NUMBER,
    practiceSpec,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from './practice-repo'
import { AVERAGE, AVERAGE_TEST } from './practice-run'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * A many-ticket run with all three waits between steps (#559): #21 "Add
 * sum" and #22 "Add product" start from the same run-branch commit, so one
 * waits for the other's baseline tests. #21's reviewer approves once #22's
 * reviewer has started, and #22's reviewer approves once #21 has joined,
 * so #22 is approved while #21's checks run on the run branch: it waits to
 * join after #21. #23 "Add average" waits on #21; once #21 is pushed, #22
 * is still in the join queue, so #23 starts once #22 has joined. No ticket
 * touches another's files, so no join clashes.
 */

const PRODUCT_TEST = `import { describe, expect, test } from 'bun:test'

import { product } from './product'

describe('product', () => {
    test('multiplies two numbers', () => {
        expect(product({ numbers: [2, 3] })).toBe(6)
    })

    test('of no numbers is one', () => {
        expect(product({ numbers: [] })).toBe(1)
    })
})
`

const PRODUCT = `export const product = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce((total, each) => total * each, 1)
`

/** A test-writer's result mapping AC1 and AC2 to the tests of `file`. */
const mapped = ({
    file,
    names,
}: {
    file: string
    names: [string, string]
}) => ({
    outcome: 'tests_written',
    criteria: names.map((name, index) => ({
        criterion_id: `AC${index + 1}`,
        tests: [{ file, name }],
    })),
    summary: 'One test per criterion.',
    assumptions: [],
    run_notes: [],
})

/** The baseline, join and start waits, in one run of #21, #22 and #23. */
export const THREE_WAITS: ManyTicketsScenario = {
    tracker: () =>
        createInMemoryTracker({
            issues: [
                practiceSpec(),
                ticketIssue({
                    number: 21,
                    title: 'Add sum',
                    criteria: [
                        'sum adds two numbers',
                        'sum of no numbers is zero',
                    ],
                }),
                ticketIssue({
                    number: 22,
                    title: 'Add product',
                    criteria: [
                        'product multiplies two numbers',
                        'product of no numbers is one',
                    ],
                }),
                ticketIssue({
                    number: 23,
                    title: 'Add average',
                    criteria: [
                        'average of two numbers is the one between them',
                        'average of no numbers is zero',
                    ],
                    blocked_by_section: '- #21',
                    blocked_by: [21],
                }),
            ],
            sub_tickets: { [PRACTICE_SPEC_NUMBER]: [21, 22, 23] },
        }),
    turns: ({ journal_file }): ScriptedTurn[] => {
        const reviewing = new Set<number>()
        return [
            {
                role: 'test-writer',
                ticket: 21,
                files: { 'src/sum.test.ts': SUM_TEST },
                result: TEST_WRITER_RESULT,
            },
            {
                role: 'test-writer',
                ticket: 22,
                files: { 'src/product.test.ts': PRODUCT_TEST },
                result: mapped({
                    file: 'src/product.test.ts',
                    names: [
                        'product > multiplies two numbers',
                        'product > of no numbers is one',
                    ],
                }),
            },
            {
                role: 'implementer',
                ticket: 21,
                files: { 'src/sum.ts': SUM },
                result: IMPLEMENTER_RESULT,
            },
            {
                role: 'implementer',
                ticket: 22,
                files: { 'src/product.ts': PRODUCT },
                result: { ...IMPLEMENTER_RESULT, summary: 'Added product.' },
            },
            {
                role: 'ticket-reviewer',
                ticket: 21,
                act: async () =>
                    waitUntil({
                        check: () => reviewing.has(22),
                        what: "#22's reviewer to start",
                    }),
                result: APPROVE,
            },
            {
                role: 'ticket-reviewer',
                ticket: 22,
                act: async () => {
                    reviewing.add(22)
                    await waitUntil({
                        check: () =>
                            journalRecords(journal_file).some(
                                (record) =>
                                    record.kind === 'ticket_joined' &&
                                    record.ticket === 21 &&
                                    record.content.ok
                            ),
                        what: "#21's join",
                    })
                },
                result: APPROVE,
            },
            {
                role: 'test-writer',
                ticket: 23,
                files: { 'src/average.test.ts': AVERAGE_TEST },
                result: mapped({
                    file: 'src/average.test.ts',
                    names: [
                        'average > of two numbers is the one between them',
                        'average > of no numbers is zero',
                    ],
                }),
            },
            {
                role: 'implementer',
                ticket: 23,
                files: { 'src/average.ts': AVERAGE },
                result: { ...IMPLEMENTER_RESULT, summary: 'Added average.' },
            },
            { role: 'ticket-reviewer', ticket: 23, result: APPROVE },
        ]
    },
}
