import { describe, expect, test } from 'bun:test'

import { parseTestPorts } from './test-ports'

/**
 * The ported-tests table in a ticket's body: the old tests its owner lets
 * the test-writer port (same file, same names), which may fail until the
 * ticket's code exists.
 */

const table = (rows: string[]) =>
    ['## Ported tests', '', '| File | Tests |', '| --- | --- |', ...rows].join(
        '\n'
    )

/** The example the docs give, from asibilia/turbo#207. */
const EXAMPLE = table([
    '| `packages/armory/tests/app.test.tsx` | `*` (only the mount changes) |',
    "| `packages/armory/tests/error-boundary.test.tsx` | `describe('the error boundary')` |",
    '| `packages/armory/tests/remembered-file.test.tsx` | `remembered-file > a new file replaces the stored one` |',
])

describe('the ported-tests table', () => {
    test('the example gives a whole file, a describe and one test, each note left out', () => {
        expect(parseTestPorts({ body: EXAMPLE })).toEqual({
            ports: [
                {
                    row: 1,
                    file: 'packages/armory/tests/app.test.tsx',
                    kind: 'all',
                    name: '*',
                },
                {
                    row: 2,
                    file: 'packages/armory/tests/error-boundary.test.tsx',
                    kind: 'describe',
                    name: 'the error boundary',
                },
                {
                    row: 3,
                    file: 'packages/armory/tests/remembered-file.test.tsx',
                    kind: 'test',
                    name: 'remembered-file > a new file replaces the stored one',
                },
            ],
            problems: [],
        })
    })

    test('the header is matched in any case; a table in a fenced code block is not read', () => {
        const body = [
            '```',
            table(['| `src/a.test.ts` | `*` |']),
            '```',
            '| file | TESTS |\n|---|---|\n| `src/b.test.ts` | `b > x` |',
        ].join('\n')
        expect(parseTestPorts({ body }).ports).toEqual([
            { row: 1, file: 'src/b.test.ts', kind: 'test', name: 'b > x' },
        ])
    })

    test('each malformed row is a problem naming its row and what to fix, and is left out', () => {
        const { ports, problems } = parseTestPorts({
            body: table([
                '| `src/a.test.ts` | `a > x` |',
                '| src/a.test.ts | `a > y` |',
                '| `src/a.test.ts` | a > y |',
                '| `src/a.test.ts` | `a > x` (again) |',
                '| `src/a.test.ts` | `*` |',
                '| `src/b.test.ts` | `*` |',
                "| `src/b.test.ts` | `describe('b')` |",
            ]),
        })
        expect(ports.map(({ row }) => row)).toEqual([1, 6])
        expect(problems).toEqual([
            "The ported-tests table's row 2 has no file in backticks.",
            "The ported-tests table's row 3 has no tests in backticks: give a full test name, describe('...'), or *.",
            "The ported-tests table's row 4 ports `a > x` in `src/a.test.ts` again, as row 1 does: keep one row for it.",
            "The ported-tests table's row 5 and row 1 both port tests in `src/a.test.ts`, and a `*` row ports every test in it: keep only one of them.",
            "The ported-tests table's row 7 and row 6 both port tests in `src/b.test.ts`, and a `*` row ports every test in it: keep only one of them.",
        ])
    })
})
