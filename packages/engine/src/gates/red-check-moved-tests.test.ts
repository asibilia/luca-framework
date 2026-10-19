import { describe, expect, test } from 'bun:test'

import type { TestCase, TestRun } from './gate-schemas'
import { checkRed, type ChangedTestSource } from './red-check'

/**
 * The red check with a split test file (#609): a test the ticket only moved
 * to another test file, under the same full name, is an old test, not a
 * missing one and not a new one.
 */

const run = (cases: TestCase[]): TestRun => ({
    command: 'bun test',
    ok: false,
    exit_code: 1,
    no_test_files: false,
    cases,
    files_without_results: [],
    output: '',
})

const GREET = 'src/greet.test.ts'
const BYE = 'src/greet-bye.test.ts'
const SUM = 'src/sum.test.ts'

const ran = (
    file: string,
    name: string,
    status: TestCase['status'] = 'passed'
): TestCase => ({ file, full_name: `greet > ${name}`, status })

const source = (describe_name: string, names: string[]) =>
    `describe('${describe_name}', () => {\n${names.map((n) => `  test('${n}', () => {})`).join('\n')}\n})`

/** The ticket's own new test, failing and mapped to AC1. */
const SUM_SOURCE = source('sum', ['adds'])
const SUM_CASE: TestCase = {
    file: SUM,
    full_name: 'sum > adds',
    status: 'failed',
}

const redOf = ({
    baseline,
    current,
    changed,
}: {
    baseline: TestCase[]
    current: TestCase[]
    changed: ChangedTestSource[]
}) =>
    checkRed({
        criteria_ids: ['AC1'],
        mapping: [
            {
                criterion_id: 'AC1',
                tests: [{ file: SUM, name: 'sum > adds' }],
            },
        ],
        baseline: run(baseline),
        current: run([...current, SUM_CASE]),
        test_files: [
            ...new Set([
                SUM,
                ...changed.map(({ file }) => file),
                ...current.map(({ file }) => file),
            ]),
        ],
        sources: { [SUM]: SUM_SOURCE },
        changed_test_sources: [
            ...changed,
            { file: SUM, base: null, current: SUM_SOURCE },
        ],
    })

const UNMAPPED = "a new test the map doesn't name"

describe('the red check: moved tests are old tests (#609)', () => {
    test('a test moved to another test file still passes, and the notes list it as moved', () => {
        const result = redOf({
            baseline: [ran(GREET, 'says hi'), ran(GREET, 'says bye')],
            current: [ran(GREET, 'says hi'), ran(BYE, 'says bye')],
            changed: [
                {
                    file: GREET,
                    base: source('greet', ['says hi', 'says bye']),
                    current: source('greet', ['says hi']),
                },
                {
                    file: BYE,
                    base: null,
                    current: source('greet', ['says bye']),
                },
            ],
        })
        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
        expect(
            result.notes.filter(
                (note) =>
                    note.includes('greet > says bye') &&
                    note.includes(`moved from ${GREET}`)
            )
        ).toHaveLength(1)
        expect(
            result.notes.some((note) => note.includes('greet > says hi'))
        ).toBe(false)
    })

    test('a test file the ticket deleted had the names its new files add, so they are not new', () => {
        const result = redOf({
            baseline: [ran(GREET, 'says hi'), ran(GREET, 'says bye')],
            current: [
                ran('src/greet-hi.test.ts', 'says hi'),
                ran(BYE, 'says bye'),
            ],
            changed: [
                {
                    file: GREET,
                    base: source('greet', ['says hi', 'says bye']),
                    current: null,
                },
                {
                    file: 'src/greet-hi.test.ts',
                    base: null,
                    current: source('greet', ['says hi']),
                },
                {
                    file: BYE,
                    base: null,
                    current: source('greet', ['says bye']),
                },
            ],
        })
        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
    })

    test('a name moved into a test file that was already there is not new in it', () => {
        const OTHER = 'src/other.test.ts'
        const result = redOf({
            baseline: [
                ran(GREET, 'says hi'),
                ran(GREET, 'says bye'),
                ran(OTHER, 'waves'),
            ],
            current: [
                ran(GREET, 'says hi'),
                ran(OTHER, 'waves'),
                ran(OTHER, 'says bye'),
            ],
            changed: [
                {
                    file: GREET,
                    base: source('greet', ['says hi', 'says bye']),
                    current: source('greet', ['says hi']),
                },
                {
                    file: OTHER,
                    base: source('greet', ['waves']),
                    current: source('greet', ['waves', 'says bye']),
                },
            ],
        })
        expect(result.problems.filter((p) => p.includes(UNMAPPED))).toEqual([])
        expect(result.ok).toBe(true)
    })

    test('a moved test next to a real unmapped new test: only the new one is refused', () => {
        const result = redOf({
            baseline: [ran(GREET, 'says hi'), ran(GREET, 'says bye')],
            current: [
                ran(GREET, 'says hi'),
                ran(BYE, 'says bye'),
                ran(BYE, 'says hey', 'failed'),
            ],
            changed: [
                {
                    file: GREET,
                    base: source('greet', ['says hi', 'says bye']),
                    current: source('greet', ['says hi']),
                },
                {
                    file: BYE,
                    base: null,
                    current: source('greet', ['says bye', 'says hey']),
                },
            ],
        })
        expect(result.ok).toBe(false)
        expect(result.problems).toEqual([
            `"says hey" in ${BYE}: a new test the map doesn't name (map it to a criterion, or remove it)`,
        ])
    })

    test('a test deleted outright is still missing, and a moved test that now fails no longer passes', () => {
        const result = redOf({
            baseline: [
                ran(GREET, 'says hi'),
                ran(GREET, 'says bye'),
                ran(GREET, 'says hey'),
            ],
            current: [ran(GREET, 'says hi'), ran(BYE, 'says bye', 'failed')],
            changed: [
                {
                    file: GREET,
                    base: source('greet', ['says hi', 'says bye', 'says hey']),
                    current: source('greet', ['says hi']),
                },
                {
                    file: BYE,
                    base: null,
                    current: source('greet', ['says bye']),
                },
            ],
        })
        expect(result.ok).toBe(false)
        expect(result.problems).toContain(
            `old test "greet > says hey" in ${GREET} is missing`
        )
        expect(
            result.problems.filter(
                (p) =>
                    p.includes('"greet > says bye"') &&
                    p.includes('no longer passes')
            )
        ).toHaveLength(1)
        expect(
            result.problems.some(
                (p) => p.includes('"greet > says bye"') && p.includes('missing')
            )
        ).toBe(false)
    })

    test('a name matching several old tests counts as moved only once', () => {
        const A = 'src/greet-a.test.ts'
        const B = 'src/greet-b.test.ts'
        const C = 'src/greet-c.test.ts'
        const result = redOf({
            baseline: [ran(A, 'says hi'), ran(B, 'says hi')],
            current: [ran(C, 'says hi')],
            changed: [
                {
                    file: A,
                    base: source('greet', ['says hi']),
                    current: null,
                },
                {
                    file: B,
                    base: source('greet', ['says hi']),
                    current: null,
                },
                {
                    file: C,
                    base: null,
                    current: source('greet', ['says hi']),
                },
            ],
        })
        expect(result.ok).toBe(false)
        expect(
            result.problems.filter(
                (p) =>
                    p.includes('"greet > says hi"') && p.includes('is missing')
            )
        ).toHaveLength(1)
        expect(
            result.notes.filter(
                (note) =>
                    note.includes('greet > says hi') && note.includes('moved')
            )
        ).toHaveLength(1)
    })
})
