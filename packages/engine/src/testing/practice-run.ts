import { ticketIssue } from './intake-fixtures'
import {
    APPROVE,
    HAPPY_TURNS,
    makePracticeRepo,
    PRACTICE_SPEC_NUMBER,
    practiceSpec,
    sumTicket,
} from './practice-repo'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'

/**
 * The command line's `--demo` run: main's practice repo (`practice-repo.ts`)
 * with a second ticket on top, so the board shows a blocked ticket waiting
 * and then building. No GitHub, no models, no setup.
 *
 * Seam 2 (`core/run-one-ticket.test.ts`) runs on `practice-repo.ts` itself.
 */

export { makePracticeRepo, PRACTICE_SPEC_NUMBER }

export const AVERAGE_TEST = `import { describe, expect, test } from 'bun:test'

import { average } from './average'

describe('average', () => {
    test('of two numbers is the one between them', () => {
        expect(average({ numbers: [2, 4] })).toBe(3)
    })

    test('of no numbers is zero', () => {
        expect(average({ numbers: [] })).toBe(0)
    })
})
`

export const AVERAGE = `import { sum } from './sum'

export const average = ({ numbers }: { numbers: number[] }): number =>
    numbers.length === 0 ? 0 : sum({ numbers }) / numbers.length
`

/** The scripted turns that build ticket #12 (average, blocked by #11). */
const SECOND_TICKET_TURNS: ScriptedTurn[] = [
    {
        role: 'test-writer',
        ticket: 12,
        files: { 'src/average.test.ts': AVERAGE_TEST },
        result: {
            outcome: 'tests_written',
            criteria: [
                {
                    criterion_id: 'AC1',
                    tests: [
                        {
                            file: 'src/average.test.ts',
                            name: 'average > of two numbers is the one between them',
                        },
                    ],
                },
                {
                    criterion_id: 'AC2',
                    tests: [
                        {
                            file: 'src/average.test.ts',
                            name: 'average > of no numbers is zero',
                        },
                    ],
                },
            ],
            summary: 'One test per criterion.',
            assumptions: ['The average of no numbers is zero, not NaN.'],
            run_notes: [],
        },
    },
    {
        role: 'implementer',
        ticket: 12,
        files: {
            'src/average.ts': AVERAGE,
            'src/index.ts':
                "export { average } from './average'\nexport { sum } from './sum'\n",
        },
        result: {
            outcome: 'done',
            bad_test: null,
            summary: 'Added average on top of sum and exported it.',
            assumptions: [],
            run_notes: [],
        },
    },
    { role: 'ticket-reviewer', ticket: 12, result: APPROVE },
]

/** The demo's scripted turns: ticket #11 (sum), then ticket #12 (average). */
export const DEMO_TURNS: ScriptedTurn[] = [
    ...HAPPY_TURNS,
    ...SECOND_TICKET_TURNS,
]

/**
 * The practice spec (#10) in an in-memory tracker, with ticket #11 (sum)
 * and ticket #12 (average), which is blocked by #11.
 */
export const demoTracker = (): InMemoryTracker =>
    createInMemoryTracker({
        issues: [
            practiceSpec(),
            sumTicket(),
            ticketIssue({
                number: 12,
                title: 'Add average',
                criteria: [
                    'average of two numbers is the one between them',
                    'average of no numbers is zero',
                ],
                blocked_by_section: '- #11',
                blocked_by: [11],
            }),
        ],
        sub_tickets: { [PRACTICE_SPEC_NUMBER]: [11, 12] },
    })
