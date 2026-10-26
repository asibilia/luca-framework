import { describe, expect, test } from 'bun:test'
import sortBy from 'lodash/sortBy'

import type { TestRun } from './gate-schemas'
import { checkRed } from './red-check'

import type { TestRef } from '../agents/role-results'

/**
 * The red check for `.swift` test files (#668): when a `junit` command's
 * tests don't build yet, it wrote no JUnit file (`junit_missing`), so a
 * Swift file's test names are read from its text.
 */

const FILE = 'Tests/CoreTests/RankingTests.swift'

/** A run whose junit command failed and wrote no JUnit file. */
const NOT_BUILT: TestRun = {
    command: 'bun run ios:test:core',
    ok: false,
    exit_code: 1,
    no_test_files: false,
    cases: [],
    files_without_results: [FILE],
    junit_missing: true,
    output: 'error: Build failed',
}

/** A baseline where `sortsByScore()` passed. */
const BASELINE: TestRun = {
    command: 'bun run ios:test:core',
    ok: true,
    exit_code: 0,
    no_test_files: false,
    cases: [
        {
            file: FILE,
            full_name: 'RankingTests > sortsByScore()',
            status: 'passed',
        },
    ],
    files_without_results: [],
    output: '',
}

const EMPTY_BASELINE: TestRun = { ...BASELINE, cases: [] }

/** A Swift Testing suite with these `@Test` functions. */
const suite = (funcs: string[]) =>
    `import Testing
@testable import Core

struct RankingTests {
${funcs.map((name) => `    @Test func ${name}() {\n        #expect(true)\n    }`).join('\n\n')}
}
`

const red = ({
    base,
    current,
    mapped,
    baseline = EMPTY_BASELINE,
}: {
    base: string | null
    current: string
    mapped: string[]
    baseline?: TestRun
}) => {
    const tests: TestRef[] = mapped.map((name) => ({ file: FILE, name }))
    return checkRed({
        criteria_ids: ['AC1'],
        mapping: [{ criterion_id: 'AC1', tests }],
        baseline,
        current: NOT_BUILT,
        test_files: [FILE],
        sources: { [FILE]: current },
        changed_test_sources: [{ file: FILE, base, current }],
    })
}

const UNMAPPED = `: a new test the map doesn't name (map it to a criterion, or remove it)`

describe('the red check for Swift tests that do not build yet (#668)', () => {
    test("a .swift file's test names are its @Test funcs with their argument labels and its XCTest test funcs", () => {
        const source = `import Testing
import XCTest
@testable import Core

struct RankingTests {
    @Test func addsZero(n: Int) {
        #expect(n + 0 == n)
    }

    @Test("adds one",
          arguments: [1, 2])
    func adds(_ a: Int) {
        #expect(a > 0)
    }

    func helper() {}
}

final class RankingXCTests: XCTestCase {
    func testAddsMovie() {
        XCTAssertTrue(true)
    }
}
`
        const result = red({ base: null, current: source, mapped: [] })

        const unmapped = result.problems
            .filter((problem) => problem.includes(`" in ${FILE}${UNMAPPED}`))
            .map((problem) => problem.slice(1, problem.indexOf(`" in ${FILE}`)))
        expect(sortBy(unmapped)).toEqual([
            'adds(_:)',
            'addsZero(n:)',
            'testAddsMovie',
        ])
    })

    test('a mapped test named in its .swift file counts as failing, with a note', () => {
        const result = red({
            base: suite(['sortsByScore']),
            current: suite(['sortsByScore', 'addsMovie']),
            mapped: ['RankingTests > addsMovie()'],
        })

        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
        expect(result.notes).toContain(
            `"RankingTests > addsMovie()" in ${FILE}: fails (the tests do not build yet)`
        )
    })

    test('a mapped Swift test its file does not name is a problem', () => {
        const result = red({
            base: suite(['sortsByScore']),
            current: suite(['sortsByScore']),
            mapped: ['RankingTests > addsMovie()'],
        })

        expect(result.ok).toBe(false)
        expect(result.problems).toContain(
            `"RankingTests > addsMovie()" in ${FILE}: not found in the file (map a @Test func, or an XCTest func whose name starts with test, by its type names and function, such as "RankingTests > addsMovie()")`
        )
    })

    test('an unmapped new Swift test is refused, saying every test func in the text counts', () => {
        const result = red({
            base: suite(['sortsByScore']),
            current: suite(['sortsByScore', 'addsMovie', 'extraCheck']),
            mapped: ['RankingTests > addsMovie()'],
        })

        expect(result.ok).toBe(false)
        expect(result.problems).toContain(
            `"extraCheck()" in ${FILE}${UNMAPPED}. The tests do not build yet, so every @Test func and XCTest test func in its text counts, even one inside a comment`
        )
    })

    test('an old test still named in its .swift file is noted as not run, and one whose name is gone is missing', () => {
        const kept = red({
            base: suite(['sortsByScore']),
            current: suite(['sortsByScore', 'addsMovie']),
            mapped: ['RankingTests > addsMovie()'],
            baseline: BASELINE,
        })
        const gone = red({
            base: suite(['sortsByScore']),
            current: suite(['addsMovie']),
            mapped: ['RankingTests > addsMovie()'],
            baseline: BASELINE,
        })

        expect(kept.problems).toEqual([])
        expect(kept.ok).toBe(true)
        expect(kept.notes).toContain(
            `old test "RankingTests > sortsByScore()" in ${FILE}: not run (the tests do not build yet); the gates run it`
        )
        expect(gone.ok).toBe(false)
        expect(gone.problems).toContain(
            `old test "RankingTests > sortsByScore()" in ${FILE} is missing`
        )
    })
})
