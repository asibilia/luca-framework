import { describe, expect, test } from 'bun:test'

import { parseTestRenames } from './test-renames'

/**
 * The renamed-tests table in a ticket's body: the tests its owner lets the
 * test-writer rename, read for intake and the red check.
 */

const HEADER = '| File | Old name | New name |\n| --- | --- | --- |'

const table = (rows: string[]) => [HEADER, ...rows].join('\n')

/** The table on asibilia/turbo#203, word for word. */
const TICKET_203 = `## What to build

Move the lint to oxlint.

**Owner-approved renames in this ticket (these three, and no other test renamed or removed anywhere):**

| File | Old name | New name |
| --- | --- | --- |
| \`packages/sim/tests/repo-setup.test.ts\` | \`what reads packages/sim/upstream > ESLint and the root bun test skip it\` | \`what reads packages/sim/upstream > oxlint, Prettier and the root bun test skip it\` |
| \`packages/armory/tests/repo-setup.test.ts\` | \`ESLint > takes the package .tsx files, with the Prettier rule on\` | \`oxlint and Prettier > takes the package .tsx files, with the Prettier rule on\` (only the \`describe\` changes) |

## Acceptance criteria

- [ ] It works
`

describe('the renamed-tests table', () => {
    test('the table from #203 gives two plain renames, each note after a name left out', () => {
        expect(parseTestRenames({ body: TICKET_203 })).toEqual({
            renames: [
                {
                    row: 1,
                    file: 'packages/sim/tests/repo-setup.test.ts',
                    old_name:
                        'what reads packages/sim/upstream > ESLint and the root bun test skip it',
                    new_name:
                        'what reads packages/sim/upstream > oxlint, Prettier and the root bun test skip it',
                    describe: false,
                },
                {
                    row: 2,
                    file: 'packages/armory/tests/repo-setup.test.ts',
                    old_name:
                        'ESLint > takes the package .tsx files, with the Prettier rule on',
                    new_name:
                        'oxlint and Prettier > takes the package .tsx files, with the Prettier rule on',
                    describe: false,
                },
            ],
            problems: [],
        })
    })

    test("a describe('...') name on both sides is a describe rename, in any quote", () => {
        const body = table([
            "| `packages/armory/tests/deploy-guard.test.ts` | `describe('nothing deploys the armory planner')` (the `describe` only; its tests `a` and `b` keep their titles) | `describe('only the deploy workflow deploys the armory planner')` |",
            '| `src/a.test.ts` | `describe("old")` | `` describe(`new`) `` |',
        ])
        expect(parseTestRenames({ body })).toEqual({
            renames: [
                {
                    row: 1,
                    file: 'packages/armory/tests/deploy-guard.test.ts',
                    old_name: 'nothing deploys the armory planner',
                    new_name:
                        'only the deploy workflow deploys the armory planner',
                    describe: true,
                },
                {
                    row: 2,
                    file: 'src/a.test.ts',
                    old_name: 'old',
                    new_name: 'new',
                    describe: true,
                },
            ],
            problems: [],
        })
    })

    test('the header is matched in any case; a table in a fenced code block, or with other columns, is not read', () => {
        const body = [
            '```markdown',
            table(['| `src/a.test.ts` | `a > x` | `a > y` |']),
            '```',
            '',
            '| File | Old | New |\n| --- | --- | --- |\n| `src/a.test.ts` | `a > x` | `a > y` |',
            '',
            '## Renamed tests',
            '',
            '| file | OLD NAME | new name |\n|---|---|---|\n| `src/b.test.ts` | `b > x` | `b > y` |',
        ].join('\n')
        expect(parseTestRenames({ body }).renames).toEqual([
            {
                row: 1,
                file: 'src/b.test.ts',
                old_name: 'b > x',
                new_name: 'b > y',
                describe: false,
            },
        ])
    })

    test('a body with no table has no renames and no problems', () => {
        expect(
            parseTestRenames({ body: '## What to build\n\nA slice.' })
        ).toEqual({ renames: [], problems: [] })
    })

    test('each malformed row is a problem naming its row and what to fix, and is left out', () => {
        const body = table([
            '| `src/a.test.ts` | `a > x` | `a > y` |',
            '| `src/a.test.ts` | `a > z` | a > w |',
            '| src/a.test.ts | `a > z` | `a > w` |',
            '| `src/a.test.ts` | `a > q` | `a > q` |',
            '| `src/a.test.ts` | `a > x` | `a > v` |',
            '| `src/a.test.ts` | `a > u` | `a > y` |',
            "| `src/a.test.ts` | `describe('a')` | `b > t` |",
            '| `src/a.test.ts` | | `a > s` |',
        ])
        const { renames, problems } = parseTestRenames({ body })
        expect(renames.map(({ row }) => row)).toEqual([1])
        expect(problems).toEqual([
            "The renamed-tests table's row 2 has no new name in backticks.",
            "The renamed-tests table's row 3 has no file in backticks.",
            "The renamed-tests table's row 4 gives the same old and new name: give the test's new name, or drop the row.",
            "The renamed-tests table's row 5 renames `a > x` in `src/a.test.ts` again, as row 1 does: keep one row for it.",
            "The renamed-tests table's row 6 gives `a > y` in `src/a.test.ts` as a new name, as row 1 does: give each test its own new name.",
            "The renamed-tests table's row 7 mixes a describe and a full test name: write both as describe('...') to rename a describe, or both as full test names (describe and test joined by \" > \").",
            "The renamed-tests table's row 8 has no old name in backticks.",
        ])
    })
})
