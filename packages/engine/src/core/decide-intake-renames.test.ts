import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { EngineConfig } from '../config/engine-config'
import type { IntakeProblem } from '../intake/intake-schemas'
import { recordsFrom, specIssue, ticketIssue } from '../testing/intake-fixtures'
import type { TrackerIssue } from '../tracker/tracker'

/**
 * Intake and a ticket's renamed-tests table: a malformed row refuses the
 * run, with the row and what to fix; a good table passes.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const problemsFor = ({
    tickets,
}: {
    tickets: TrackerIssue[]
}): IntakeProblem[] => {
    const action = decide({
        records: recordsFrom({
            entries: [
                {
                    kind: 'run_started',
                    ticket: null,
                    role: null,
                    content: { spec_number: 10, config: CONFIG },
                },
                {
                    kind: 'intake_read',
                    ticket: null,
                    role: null,
                    content: {
                        spec: specIssue({ number: 10 }),
                        sub_tickets: tickets,
                        outside_blockers: [],
                    },
                },
            ],
        }),
    })
    return action.type === 'refuse_intake' ? action.problems : []
}

const withTable = (number: number, rows: string[]): TrackerIssue =>
    ticketIssue({
        number,
        what_to_build: [
            'Rename the greeting tests.',
            '',
            '## Renamed tests',
            '',
            '| File | Old name | New name |',
            '| --- | --- | --- |',
            ...rows,
        ].join('\n'),
    })

describe('decision step: intake checks the renamed-tests table', () => {
    test('a good table passes', () => {
        expect(
            problemsFor({
                tickets: [
                    withTable(11, [
                        '| `src/greet.test.ts` | `greet > says hi` | `greet > says hello` |',
                        "| `src/greet.test.ts` | `describe('bye')` | `describe('farewell')` |",
                    ]),
                ],
            })
        ).toEqual([])
    })

    test('a malformed row refuses the run, on its ticket only, with the row and the fix', () => {
        expect(
            problemsFor({
                tickets: [
                    withTable(11, [
                        '| `src/greet.test.ts` | `greet > says hi` | greet > says hello |',
                        '| `src/greet.test.ts` | `greet > says bye` | `greet > says bye` |',
                    ]),
                    ticketIssue({ number: 12 }),
                ],
            })
        ).toEqual([
            {
                ticket: 11,
                missing: [
                    "The renamed-tests table's row 1 has no new name in backticks.",
                    "The renamed-tests table's row 2 gives the same old and new name: give the test's new name, or drop the row.",
                ],
            },
        ])
    })
})
