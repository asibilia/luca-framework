import { describe, expect, test } from 'bun:test'

import type { TestRun } from './gate-schemas'
import { checkRed } from './red-check'

import { MAX_TESTS_PER_CRITERION } from '../core/loop-caps'

const run = (
    cases: TestRun['cases'],
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
const failing = (name: string) => ({
    file: 'src/sum.test.ts',
    full_name: `sum > ${name}`,
    status: 'failed' as const,
})
const SOURCE = (names: string[]) =>
    `describe('sum', () => {\n${names.map((n) => `  test('${n}', () => {})`).join('\n')}\n})`

const red = ({
    names,
    mapped,
    base = null,
}: {
    names: string[]
    mapped: string[]
    base?: string | null
}) =>
    checkRed({
        criteria_ids: ['AC1'],
        mapping: [
            {
                criterion_id: 'AC1',
                tests: mapped.map((n) => ({
                    file: 'src/sum.test.ts',
                    name: `sum > ${n}`,
                })),
            },
        ],
        baseline: run([]),
        current: run(names.map(failing)),
        test_files: ['src/sum.test.ts'],
        sources: { 'src/sum.test.ts': SOURCE(names) },
        changed_test_sources: [
            { file: 'src/sum.test.ts', base, current: SOURCE(names) },
        ],
    })

describe('the red check: honest new tests (#581)', () => {
    test(`a criterion with more than ${MAX_TESTS_PER_CRITERION} tests is refused`, () => {
        const names = ['a', 'b', 'c', 'd']
        const result = red({ names, mapped: names })
        expect(result.ok).toBe(false)
        expect(result.problems).toContain(
            `AC1 has 4 tests; write at most ${MAX_TESTS_PER_CRITERION} per criterion`
        )
    })

    test(`${MAX_TESTS_PER_CRITERION} tests for a criterion are fine`, () => {
        expect(
            red({ names: ['a', 'b', 'c'], mapped: ['a', 'b', 'c'] }).ok
        ).toBe(true)
    })

    test("a new test the map doesn't name is refused", () => {
        const result = red({ names: ['a', 'extra'], mapped: ['a'] })
        expect(result.problems).toContain(
            '"extra" in src/sum.test.ts: a new test the map doesn\'t name (map it to a criterion, or remove it)'
        )
    })

    test('a test whose name has " > " in it is mapped by its full name', () => {
        const name = 'returns true when a > b'
        const result = red({ names: [name], mapped: [name] })
        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
    })

    test('a new test with " > " in its name that the map does not name is still refused', () => {
        const result = red({
            names: ['a', 'returns true when a > b'],
            mapped: ['a'],
        })
        expect(result.problems).toContain(
            '"returns true when a > b" in src/sum.test.ts: a new test the map doesn\'t name (map it to a criterion, or remove it)'
        )
    })

    test('a test that was already in the base file is not new', () => {
        const result = red({
            names: ['old', 'a'],
            mapped: ['a'],
            base: SOURCE(['old']),
        })
        expect(result.problems.some((p) => p.includes('"old"'))).toBe(false)
    })

    test("an unmapped new test in a file that doesn't load yet is still found, from its source", () => {
        const source =
            "describe('new', () => { test('a', () => {}); test('b', () => {}) })"
        const result = checkRed({
            criteria_ids: ['AC1'],
            mapping: [
                {
                    criterion_id: 'AC1',
                    tests: [{ file: 'src/new.test.ts', name: 'new > a' }],
                },
            ],
            baseline: run([]),
            current: run([], ['src/new.test.ts']),
            test_files: ['src/new.test.ts'],
            sources: { 'src/new.test.ts': source },
            changed_test_sources: [
                { file: 'src/new.test.ts', base: null, current: source },
            ],
        })
        expect(result.problems).toContain(
            '"b" in src/new.test.ts: a new test the map doesn\'t name (map it to a criterion, or remove it)'
        )
    })

    test('the cap and an unmapped test are both reported', () => {
        const result = red({
            names: ['a', 'b', 'c', 'd', 'e'],
            mapped: ['a', 'b', 'c', 'd'],
        })
        expect(
            result.problems.filter(
                (p) => p.includes('at most') || p.includes("doesn't name")
            )
        ).toHaveLength(2)
    })
})

describe('the red check: the feature map (#583)', () => {
    const base = {
        criteria_ids: ['AC1'],
        mapping: [
            {
                criterion_id: 'AC1',
                tests: [{ file: 'src/new.test.ts', name: 'new > a' }],
            },
        ],
        baseline: run([]),
        current: run([], ['src/new.test.ts']),
        test_files: ['src/new.test.ts'],
        sources: {
            'src/new.test.ts': "describe('new', () => { test('a', () => {}) })",
        },
        changed_test_sources: [
            {
                file: 'src/new.test.ts',
                base: null,
                current: "describe('new', () => { test('a', () => {}) })",
            },
        ],
    }
    const edited = {
        ...base,
        changed_test_sources: [
            {
                file: 'src/new.test.ts',
                base: "describe('new', () => {})",
                current: base.sources['src/new.test.ts'],
            },
        ],
    }

    test("a new test file the map doesn't list is refused", () => {
        const result = checkRed({
            ...base,
            feature_map: {
                path: 'docs/feature-map.md',
                files: ['src/old.test.ts'],
            },
        })
        expect(result.problems).toContain(
            "src/new.test.ts: a new test file the feature map doesn't list (add it under a feature in docs/feature-map.md)"
        )
    })

    test('a listed one passes', () => {
        expect(
            checkRed({
                ...base,
                feature_map: {
                    path: 'docs/feature-map.md',
                    files: ['src/new.test.ts'],
                },
            }).ok
        ).toBe(true)
    })

    test('a configured map that is missing is a problem naming it, not a crash', () => {
        expect(
            checkRed({
                ...base,
                feature_map: { path: 'docs/feature-map.md', files: null },
            }).problems
        ).toContain(
            'The feature map docs/feature-map.md is missing: restore it, or add it with the new test file listed'
        )
    })

    test('without a feature map, nothing is checked', () => {
        expect(checkRed({ ...base, feature_map: null }).ok).toBe(true)
        expect(checkRed(base).ok).toBe(true)
    })

    test('an edited (not new) test file is never checked against the map', () => {
        expect(
            checkRed({ ...edited, feature_map: { path: 'm.md', files: [] } }).ok
        ).toBe(true)
    })

    test('a missing map is no problem when no test file is new', () => {
        expect(
            checkRed({
                ...edited,
                feature_map: { path: 'docs/feature-map.md', files: null },
            }).ok
        ).toBe(true)
    })
})
