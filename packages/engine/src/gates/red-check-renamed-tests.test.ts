import { describe, expect, test } from 'bun:test'

import type { TestCase, TestRun } from './gate-schemas'
import { checkRed, type ChangedTestSource } from './red-check'

import type { TestRef } from '../agents/role-results'
import { parseTestRenames } from '../intake/test-renames'

/**
 * The red check with declared renames: a test the ticket's renamed-tests
 * table renames is judged under its new name, as a new test when it is
 * mapped to a criterion and as an old test when it is not. A rename the
 * table doesn't declare is still a missing old test.
 */

const GREET = 'src/greet.test.ts'
const SUM = 'src/sum.test.ts'

const run = (
    cases: TestCase[],
    files_without_results: string[] = []
): TestRun => ({
    command: 'bun test',
    ok: false,
    exit_code: 1,
    no_test_files: false,
    cases,
    files_without_results,
    output: '',
})

const ran = (
    full_name: string,
    status: TestCase['status'] = 'passed',
    file = GREET
): TestCase => ({ file, full_name, status })

const source = (describe_name: string, names: string[]) =>
    `describe('${describe_name}', () => {\n${names.map((n) => `  test('${n}', () => {})`).join('\n')}\n})`

/** The renames a table with these rows declares. */
const declared = (rows: string[]) =>
    parseTestRenames({
        body: [
            '## Renamed tests',
            '',
            '| File | Old name | New name |',
            '| --- | --- | --- |',
            ...rows,
        ].join('\n'),
    }).renames

const SUM_SOURCE = source('sum', ['adds'])

/** The red check of a ticket with a mapped, failing `sum > adds` (AC1). */
const redOf = ({
    baseline,
    current,
    changed,
    mapped = [],
    renames = [],
    not_loaded = [],
}: {
    baseline: TestCase[]
    current: TestCase[]
    changed: ChangedTestSource[]
    mapped?: TestRef[]
    renames?: ReturnType<typeof declared>
    not_loaded?: string[]
}) =>
    checkRed({
        criteria_ids: mapped.length === 0 ? ['AC1'] : ['AC1', 'AC2'],
        mapping: [
            { criterion_id: 'AC1', tests: [{ file: SUM, name: 'sum > adds' }] },
            ...(mapped.length === 0
                ? []
                : [{ criterion_id: 'AC2', tests: mapped }]),
        ],
        baseline: run(baseline),
        current: run(
            [...current, ran('sum > adds', 'failed', SUM)],
            not_loaded
        ),
        test_files: [
            ...new Set([
                SUM,
                ...changed.map(({ file }) => file),
                ...current.map(({ file }) => file),
            ]),
        ],
        sources: Object.fromEntries([
            [SUM, SUM_SOURCE],
            ...changed.map(({ file, current: text }) => [file, text]),
        ]),
        changed_test_sources: [
            ...changed,
            { file: SUM, base: null, current: SUM_SOURCE },
        ],
        renames,
    })

const BASE = [ran('greet > says hi'), ran('greet > says bye')]
const RENAMED: ChangedTestSource = {
    file: GREET,
    base: source('greet', ['says hi', 'says bye']),
    current: source('greet', ['says hi', 'waves bye']),
}
const RENAME_BYE = declared([
    '| `src/greet.test.ts` | `greet > says bye` | `greet > waves bye` |',
])
const OLD = `old test "greet > says bye" in ${GREET}`
const UNMAPPED = "a new test the map doesn't name"

describe('the red check: declared renames', () => {
    test('a declared rename mapped to a criterion is a new test: failing, it is fine, with a note for the old name', () => {
        const result = redOf({
            baseline: BASE,
            current: [
                ran('greet > says hi'),
                ran('greet > waves bye', 'failed'),
            ],
            changed: [RENAMED],
            mapped: [{ file: GREET, name: 'greet > waves bye' }],
            renames: RENAME_BYE,
        })
        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
        expect(result.notes).toContain(
            `${OLD}: renamed to "greet > waves bye", as the ticket declares; mapped to a criterion, so it must fail first`
        )
    })

    test('a declared rename mapped to a criterion that passes already is a problem', () => {
        const result = redOf({
            baseline: BASE,
            current: [ran('greet > says hi'), ran('greet > waves bye')],
            changed: [RENAMED],
            mapped: [{ file: GREET, name: 'greet > waves bye' }],
            renames: RENAME_BYE,
        })
        expect(result.ok).toBe(false)
        expect(result.problems).toEqual([
            `"greet > waves bye" in ${GREET}: passes already (it must fail before any code is written)`,
        ])
    })

    test('an unmapped declared rename is an old test: still passing, it is fine, and its new name is no unmapped new test', () => {
        const result = redOf({
            baseline: BASE,
            current: [ran('greet > says hi'), ran('greet > waves bye')],
            changed: [RENAMED],
            renames: RENAME_BYE,
        })
        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
        expect(result.notes).toContain(
            `${OLD}: renamed to "greet > waves bye", as the ticket declares; still passes`
        )
    })

    test('an unmapped declared rename that fails no longer passes', () => {
        const result = redOf({
            baseline: BASE,
            current: [
                ran('greet > says hi'),
                ran('greet > waves bye', 'failed'),
            ],
            changed: [RENAMED],
            renames: RENAME_BYE,
        })
        expect(result.problems).toEqual([
            `${OLD}, renamed to "greet > waves bye" as the ticket declares, no longer passes`,
        ])
    })

    test('a declared rename whose new name is not in the file is a problem', () => {
        const result = redOf({
            baseline: BASE,
            current: [ran('greet > says hi')],
            changed: [{ ...RENAMED, current: source('greet', ['says hi']) }],
            renames: RENAME_BYE,
        })
        expect(result.problems).toEqual([
            `${OLD} was declared renamed to "greet > waves bye", but no test of that name is in the file`,
        ])
    })

    test('a rename the table does not declare is missing, with a hint, and its new name is an unmapped new test', () => {
        const result = redOf({
            baseline: BASE,
            current: [ran('greet > says hi'), ran('greet > waves bye')],
            changed: [RENAMED],
        })
        expect(result.ok).toBe(false)
        expect(result.problems).toEqual([
            `"waves bye" in ${GREET}: ${UNMAPPED} (map it to a criterion, or remove it)`,
            `${OLD} is missing (rename a test only when the ticket's renamed-tests table names it)`,
        ])
    })

    test('a describe rename renames every test under it, and a test outside it still counts as missing', () => {
        const result = redOf({
            baseline: [...BASE, ran('wave > waves')],
            current: [ran('hello > says hi'), ran('hello > says bye')],
            changed: [
                {
                    file: GREET,
                    base: `${source('greet', ['says hi', 'says bye'])}\n${source('wave', ['waves'])}`,
                    current: source('hello', ['says hi', 'says bye']),
                },
            ],
            renames: declared([
                "| `src/greet.test.ts` | `describe('greet')` | `describe('hello')` |",
            ]),
        })
        expect(result.problems).toEqual([
            `old test "wave > waves" in ${GREET} is missing (rename a test only when the ticket's renamed-tests table names it)`,
        ])
        expect(result.notes).toContain(
            `old test "greet > says hi" in ${GREET}: renamed to "hello > says hi", as the ticket declares; still passes`
        )
        expect(result.notes).toContain(
            `old test "greet > says bye" in ${GREET}: renamed to "hello > says bye", as the ticket declares; still passes`
        )
    })

    test('a declared rename of a test that did not pass at the baseline is a note, not a problem', () => {
        const result = redOf({
            baseline: BASE,
            current: BASE,
            changed: [],
            renames: declared([
                '| `src/greet.test.ts` | `greet > says hey` | `greet > waves hey` |',
            ]),
        })
        expect(result.problems).toEqual([])
        expect(result.notes).toContain(
            `the ticket declares "greet > says hey" in ${GREET} renamed, but no such test passed at the baseline`
        )
    })

    test('in a file that does not load yet, a declared rename whose new name is in its text is noted', () => {
        const result = redOf({
            baseline: BASE,
            current: [],
            changed: [RENAMED],
            mapped: [{ file: GREET, name: 'greet > waves bye' }],
            renames: declared([
                '| `src/greet.test.ts` | `greet > says bye` | `greet > waves bye` |',
                '| `src/greet.test.ts` | `greet > says hi` | `greet > says hey` |',
            ]),
            not_loaded: [GREET],
        })
        expect(result.problems).toEqual([
            `old test "greet > says hi" in ${GREET} was declared renamed to "greet > says hey", but no test of that name is in the file`,
        ])
        expect(result.notes).toContain(
            `${OLD}: renamed to "greet > waves bye", as the ticket declares; mapped to a criterion, so it must fail first`
        )
    })

    test('in a file that does not load yet, an unmapped declared rename does not pass', () => {
        const result = redOf({
            baseline: BASE,
            current: [],
            changed: [RENAMED],
            mapped: [],
            renames: declared([
                '| `src/greet.test.ts` | `greet > says bye` | `greet > waves bye` |',
            ]),
            not_loaded: [GREET],
        })
        expect(result.problems).toContain(
            `${OLD}, renamed to "greet > waves bye" as the ticket declares, no longer passes (its file does not load yet)`
        )
    })

    test('the renames table from asibilia/turbo#203:the renamed tests, mapped and failing, pass the red check', () => {
        const ARMORY = 'packages/armory/tests/repo-setup.test.ts'
        const SIM = 'packages/sim/tests/repo-setup.test.ts'
        const armory_old =
            'ESLint > takes the package .tsx files, with the Prettier rule on'
        const armory_new =
            'oxlint and Prettier > takes the package .tsx files, with the Prettier rule on'
        const sim_old =
            'what reads packages/sim/upstream > ESLint and the root bun test skip it'
        const sim_new =
            'what reads packages/sim/upstream > oxlint, Prettier and the root bun test skip it'
        const result = redOf({
            baseline: [
                ran(armory_old, 'passed', ARMORY),
                ran(sim_old, 'passed', SIM),
            ],
            current: [
                ran(armory_new, 'failed', ARMORY),
                ran(sim_new, 'failed', SIM),
            ],
            changed: [
                {
                    file: ARMORY,
                    base: "describe('ESLint', () => { test('takes the package .tsx files, with the Prettier rule on', () => {}) })",
                    current:
                        "describe('oxlint and Prettier', () => { test('takes the package .tsx files, with the Prettier rule on', () => {}) })",
                },
                {
                    file: SIM,
                    base: "describe('what reads packages/sim/upstream', () => { test('ESLint and the root bun test skip it', () => {}) })",
                    current:
                        "describe('what reads packages/sim/upstream', () => { test('oxlint, Prettier and the root bun test skip it', () => {}) })",
                },
            ],
            mapped: [
                { file: ARMORY, name: armory_new },
                { file: SIM, name: sim_new },
            ],
            renames: declared([
                `| \`${SIM}\` | \`${sim_old}\` | \`${sim_new}\` |`,
                `| \`${ARMORY}\` | \`${armory_old}\` | \`${armory_new}\` (only the \`describe\` changes) |`,
            ]),
        })
        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
    })
})
