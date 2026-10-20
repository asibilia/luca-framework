import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { EngineConfig } from '../config/engine-config'
import type { IntakeProblem } from '../intake/intake-schemas'
import { recordsFrom, specIssue, ticketIssue } from '../testing/intake-fixtures'
import type { TrackerIssue } from '../tracker/tracker'

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const PIN = 'pin the exact text'
const UNTESTABLE =
    'no agent can check this; move it out of the acceptance criteria'

/** Intake's problems for a spec #10 with these tickets; none when it passes. */
const problemsFor = ({
    spec = specIssue({ number: 10 }),
    tickets,
}: {
    spec?: TrackerIssue
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
                        spec,
                        sub_tickets: tickets,
                        outside_blockers: [],
                    },
                },
            ],
        }),
    })
    return action.type === 'refuse_intake' ? action.problems : []
}

/** One open ticket per criterion, numbered from 11. */
const oneTicketEach = (criteria: string[]): TrackerIssue[] =>
    criteria.map((criterion, index) =>
        ticketIssue({ number: 11 + index, criteria: [criterion] })
    )

/** Each ticket refused once, with a message quoting its criterion. */
const quoting = (criteria: string[]) =>
    criteria.map((criterion, index) => ({
        ticket: 11 + index,
        missing: [expect.stringContaining(criterion)],
    }))

const messages = (problems: IntakeProblem[]): string[] =>
    problems.flatMap(({ missing }) => missing)

describe('decision step: intake checks acceptance criteria', () => {
    test('only the checkbox lines under Acceptance criteria are checked, not the spec or What to build', () => {
        const problems = problemsFor({
            spec: specIssue({
                number: 10,
                testing_decisions: '- e.g. test <thing> N times, TBD.',
            }),
            tickets: [
                ticketIssue({
                    number: 11,
                    what_to_build: 'Shows <name>, e.g. TODO.',
                    criteria: ['It works', 'Retries N times'],
                }),
            ],
        })

        expect(problems).toEqual([
            {
                ticket: 11,
                missing: [expect.stringContaining('Retries N times')],
            },
        ])
        expect(messages(problems)[0]).toContain(PIN)
    })

    test('each placeholder form in a criterion is refused, quoted, with pin the exact text', () => {
        const criteria = [
            'Shows the <name> of the run',
            'Lists the tools, e.g. git',
            'Lists git, bun, etc.',
            'The limit is TBD',
            'TODO: pick the wording',
            'Prints Working... while it runs',
            'Prints Working… while it runs',
            'Retries N times',
            'Waits M seconds',
            'Moves X to the end',
            'Sets Y as the default',
        ]

        const problems = problemsFor({ tickets: oneTicketEach(criteria) })

        expect(problems).toEqual(quoting(criteria))
        for (const message of messages(problems)) {
            expect(message).toContain(PIN)
        }
    })

    test('placeholders inside quotes and code spans are refused too', () => {
        const criteria = [
            'Prints "Round N of 3" in the log',
            'Prints `Hello, <name>` on start',
            'The help reads "Use e.g. --force"',
            'The CLI accepts `luca retry N`',
            'The stub reads `TODO`',
        ]

        const problems = problemsFor({ tickets: oneTicketEach(criteria) })

        expect(problems).toEqual(quoting(criteria))
        for (const message of messages(problems)) {
            expect(message).toContain(PIN)
        }
    })

    test('screenshots, changesets and an ADR number outside code spans are refused as untestable', () => {
        const criteria = [
            'Attach a screenshot of the panel',
            'The PR has screenshots of the board',
            'A changeset bumps the minor version',
            'The release has two changesets',
            'The choice is recorded as ADR 12',
        ]

        const problems = problemsFor({ tickets: oneTicketEach(criteria) })

        expect(problems).toEqual(quoting(criteria))
        for (const message of messages(problems)) {
            expect(message).toContain(UNTESTABLE)
        }
    })

    test('clean criteria and untestable words inside code spans pass; only the bad ticket is refused', () => {
        const problems = problemsFor({
            tickets: [
                ticketIssue({
                    number: 11,
                    criteria: [
                        'It works',
                        'Max retries is 3',
                        'The board reads XML from Node',
                    ],
                }),
                ticketIssue({
                    number: 12,
                    criteria: [
                        'The `changeset` command writes one file',
                        'Files land in `screenshots/`',
                        'The `changesets` folder is read',
                        'The docs link `ADR 12`',
                    ],
                }),
                ticketIssue({
                    number: 13,
                    criteria: ['Lists the tools, e.g. git'],
                }),
            ],
        })

        expect(problems).toEqual([
            {
                ticket: 13,
                missing: [expect.stringContaining('Lists the tools, e.g. git')],
            },
        ])
    })
})

describe('the glossary on intake', () => {
    test('the Intake entry says it checks acceptance criteria for placeholders and untestable asks', async () => {
        const root = join(import.meta.dir, '../../../..')
        const glossary = await Bun.file(join(root, 'GLOSSARY.md')).text()
        const entry = (
            glossary.match(/^\*\*Intake\*\*:\n(.+)$/m)?.[1] ?? ''
        ).toLowerCase()

        expect(entry).toContain('acceptance criteria')
        expect(entry).toContain('placeholders')
        expect(entry).toContain('untestable')
    })
})
