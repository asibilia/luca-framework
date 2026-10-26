import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runJunitTests } from './junit-runner'
import { TEST_TIMEOUT_HINT } from './test-runner'

import { timedOutLine } from '../shell/run-command'
import {
    ADDING_TESTS_SWIFT,
    CORE_SWIFT_TESTING_XML,
    CORE_XML,
    LEGACY_XCTESTS_SWIFT,
} from '../testing/swift-junit-fixtures'

/**
 * A `junit` test command (#668): the engine clears its `junit_path` files,
 * runs it as written in a test slot, and reads the JUnit files it wrote
 * into test cases, tying each Swift case to its `.swift` test file. The
 * commands here are stand-ins that copy SwiftPM's fixture output, or write
 * nothing, so no test needs a Swift toolchain.
 */

let root = ''
let repo = ''
let reports = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-junit-runner-'))
    repo = join(root, 'repo')
    reports = join(root, 'reports')
    await mkdir(repo)
    await mkdir(reports)
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const ADDING = 'Tests/CalcTests/AddingTests.swift'
const LEGACY = 'Tests/CalcTests/LegacyXCTests.swift'
const SWIFT_TESTING_PATH = '.derived/junit/core-swift-testing.xml'
const XCTEST_PATH = '.derived/junit/core.xml'
const JUNIT_PATH = [SWIFT_TESTING_PATH, XCTEST_PATH]

/** Copies both fixture JUnit files where `swift test` would write them. */
const WRITES_BOTH = `cp fixtures/swift-testing.xml ${SWIFT_TESTING_PATH} && cp fixtures/core.xml ${XCTEST_PATH}`

const writeFiles = async (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
        await Bun.write(join(repo, path), content)
    }
}

/** The fixture package: its two test sources and SwiftPM's two files. */
const writeFixturePackage = () =>
    writeFiles({
        [ADDING]: ADDING_TESTS_SWIFT,
        [LEGACY]: LEGACY_XCTESTS_SWIFT,
        'fixtures/swift-testing.xml': CORE_SWIFT_TESTING_XML,
        'fixtures/core.xml': CORE_XML,
    })

const junitRun = ({
    command,
    junit_path = JUNIT_PATH,
    test_files = [ADDING, LEGACY],
    cwd = repo,
    timeout_ms = 10_000,
    test_concurrency,
}: {
    command: string
    junit_path?: string[]
    test_files?: string[]
    cwd?: string
    timeout_ms?: number
    test_concurrency?: number
}) =>
    runJunitTests({
        cwd,
        command,
        junit_path,
        test_files,
        report_file: join(reports, `red-${crypto.randomUUID()}.xml`),
        timeout_ms,
        test_concurrency,
    })

describe('runJunitTests: reading SwiftPM JUnit files (#668)', () => {
    test('the two fixture files give the ten cases of the Further Notes table', async () => {
        await writeFixturePackage()

        const run = await junitRun({ command: WRITES_BOTH })

        expect(run.cases).toEqual([
            {
                full_name: 'freeFunctionTest()',
                file: ADDING,
                status: 'passed',
                duration_ms: 0,
                assertions: 1,
            },
            {
                full_name: 'AddingTests > addsZero(n:)',
                file: ADDING,
                status: 'passed',
                duration_ms: 0,
                assertions: 1,
            },
            {
                full_name: 'AddingTests > addsTwoNumbers()',
                file: ADDING,
                status: 'passed',
                duration_ms: 0,
                assertions: 1,
            },
            {
                full_name: 'AddingTests > failsOnPurpose()',
                file: ADDING,
                status: 'failed',
                duration_ms: 0,
                assertions: 2,
            },
            {
                full_name: 'AddingTests > checksNothing()',
                file: ADDING,
                status: 'passed',
                duration_ms: 0,
                assertions: 0,
            },
            {
                full_name: 'AddingTests > Nested > nestedPasses()',
                file: ADDING,
                status: 'passed',
                duration_ms: 0,
                assertions: 1,
            },
            {
                full_name: 'skippedTest()',
                file: ADDING,
                status: 'skipped',
                assertions: 0,
            },
            {
                full_name: 'LegacyXCTests > testSkippedInXCTest',
                file: LEGACY,
                status: 'passed',
                duration_ms: 127,
                assertions: 0,
            },
            {
                full_name: 'LegacyXCTests > testFailsInXCTest',
                file: LEGACY,
                status: 'failed',
                duration_ms: 127,
                assertions: 1,
            },
            {
                full_name: 'LegacyXCTests > testAddsInXCTest',
                file: LEGACY,
                status: 'passed',
                duration_ms: 127,
                assertions: 1,
            },
        ])
    })

    test('a case in two files goes to the one under a folder named after its module, and an unmatched case keeps its classname, with no assertions', async () => {
        const xml = `<testsuites><testsuite name="TestResults">
<testcase classname="CalcTests.AddingTests" name="addsTwoNumbers()" time="0.0001" />
<testcase classname="CalcTests.MissingTests" name="gone()" time="0.0001" />
</testsuite></testsuites>`
        const copy = 'Tests/CalcTestsOld/AddingTests.swift'
        await writeFiles({
            [ADDING]: ADDING_TESTS_SWIFT,
            [copy]: ADDING_TESTS_SWIFT,
            'fixtures/swift-testing.xml': xml,
        })

        const run = await junitRun({
            command: `cp fixtures/swift-testing.xml ${SWIFT_TESTING_PATH}`,
            junit_path: [SWIFT_TESTING_PATH],
            test_files: [copy, ADDING],
        })

        expect(run.cases).toEqual([
            {
                full_name: 'AddingTests > addsTwoNumbers()',
                file: ADDING,
                status: 'passed',
                duration_ms: 0,
                assertions: 1,
            },
            {
                full_name: 'MissingTests > gone()',
                file: 'CalcTests.MissingTests',
                status: 'passed',
                duration_ms: 0,
            },
        ])
    })

    test("a case in two files that are both under the module's folder keeps its classname, with no assertions", async () => {
        const xml = `<testsuites><testsuite name="TestResults">
<testcase classname="CalcTests.AddingTests" name="addsTwoNumbers()" time="0.0001" />
</testsuite></testsuites>`
        const copy = 'Tests/CalcTests/Copy/AddingTests.swift'
        await writeFiles({
            [ADDING]: ADDING_TESTS_SWIFT,
            [copy]: ADDING_TESTS_SWIFT,
            'fixtures/swift-testing.xml': xml,
        })

        const run = await junitRun({
            command: `cp fixtures/swift-testing.xml ${SWIFT_TESTING_PATH}`,
            junit_path: [SWIFT_TESTING_PATH],
            test_files: [ADDING, copy],
        })

        expect(run.cases).toEqual([
            {
                full_name: 'AddingTests > addsTwoNumbers()',
                file: 'CalcTests.AddingTests',
                status: 'passed',
                duration_ms: 0,
            },
        ])
    })

    test("assertions counts only the calls in the case's own function body", async () => {
        const source = `import Testing
import XCTest

struct CountTests {
    @Test func countsAll() throws {
        if true { #expect(1 == 1) }
        let value = try #require(Optional(1))
        Issue.record("noted")
        _ = value
    }

    @Test func empty() {
    }

    @Test func next() { #expect(true) }
}

final class CountXCTests: XCTestCase {
    func testCounts() throws {
        XCTAssertTrue(true)
        _ = try XCTUnwrap(Optional(1))
        XCTFail("no")
    }
}
`
        const xml = `<testsuites><testsuite name="TestResults">
<testcase classname="CalcTests.CountTests" name="countsAll()" time="0.0001" />
<testcase classname="CalcTests.CountTests" name="empty()" time="0.0001" />
<testcase classname="CalcTests.CountXCTests" name="testCounts" time="0.0001" />
</testsuite></testsuites>`
        const file = 'Tests/CalcTests/CountTests.swift'
        await writeFiles({ [file]: source, 'fixtures/swift-testing.xml': xml })

        const run = await junitRun({
            command: `cp fixtures/swift-testing.xml ${SWIFT_TESTING_PATH}`,
            junit_path: [SWIFT_TESTING_PATH],
            test_files: [file],
        })

        expect(
            run.cases.map(({ full_name, file, assertions }) => ({
                full_name,
                file,
                assertions,
            }))
        ).toEqual([
            { full_name: 'CountTests > countsAll()', file, assertions: 3 },
            { full_name: 'CountTests > empty()', file, assertions: 0 },
            { full_name: 'CountXCTests > testCounts', file, assertions: 3 },
        ])
    })

    test("a testcase with a file attribute keeps that file, and its enclosing suites' names in its full name", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="1">
  <testsuite name="src/sum.test.ts" file="src/sum.test.ts" tests="1">
    <testsuite name="sum" file="src/sum.test.ts" line="3" tests="1">
      <testsuite name="of two numbers" file="src/sum.test.ts" line="4" tests="1">
        <testcase name="adds" classname="of two numbers" time="0.012" file="src/sum.test.ts" line="5" assertions="2" />
      </testsuite>
    </testsuite>
  </testsuite>
</testsuites>`
        await writeFiles({ 'fixtures/bun.xml': xml })

        const run = await junitRun({
            command: 'cp fixtures/bun.xml out/bun.xml',
            junit_path: ['out/bun.xml'],
            test_files: ['src/sum.test.ts'],
        })

        expect(run.cases).toEqual([
            {
                file: 'src/sum.test.ts',
                full_name: 'sum > of two numbers > adds',
                status: 'passed',
                duration_ms: 12,
                assertions: 2,
            },
        ])
    })
})

describe('runJunitTests: the junit_path files around a run (#668)', () => {
    test('a stale junit_path file is deleted before the run, and a missing folder is made', async () => {
        await writeFixturePackage()
        await writeFiles({ [XCTEST_PATH]: CORE_XML })

        const nothing = await junitRun({ command: 'exit 1' })
        expect(nothing.cases).toEqual([])
        expect(nothing.junit_missing).toBe(true)
        expect(existsSync(join(repo, XCTEST_PATH))).toBe(false)

        await rm(join(repo, '.derived'), { recursive: true, force: true })
        const written = await junitRun({ command: WRITES_BOTH })
        expect(written.ok).toBe(true)
        expect(written.cases).toHaveLength(10)
    })

    test("the files read are copied into the run's reports folder and deleted from the worktree", async () => {
        await writeFixturePackage()

        await junitRun({ command: WRITES_BOTH })

        expect(existsSync(join(repo, SWIFT_TESTING_PATH))).toBe(false)
        expect(existsSync(join(repo, XCTEST_PATH))).toBe(false)
        const kept = await Promise.all(
            (await readdir(reports)).map((name) =>
                Bun.file(join(reports, name)).text()
            )
        )
        expect(kept).toContain(CORE_XML)
        expect(kept).toContain(CORE_SWIFT_TESTING_XML)
    })
})

describe('runJunitTests: outcomes (#668)', () => {
    test("a failed command that writes no file isn't ok, has no cases, sets junit_missing, and lists every test file bun can't run", async () => {
        await writeFixturePackage()

        const run = await junitRun({
            command: 'exit 1',
            test_files: [
                ADDING,
                'src/sum.test.ts',
                'src/view_spec.jsx',
                'lib/rank.test.rb',
                LEGACY,
            ],
        })

        expect(run.ok).toBe(false)
        expect(run.cases).toEqual([])
        expect(run.junit_missing).toBe(true)
        expect(run.files_without_results).toEqual([
            ADDING,
            'lib/rank.test.rb',
            LEGACY,
        ])
    })

    test('a passing command that writes no file fails, naming its files and junit_path', async () => {
        await writeFiles({
            'package.json': JSON.stringify({
                scripts: { 'ios:test:core': 'true' },
            }),
        })

        const run = await junitRun({
            command: 'bun run ios:test:core',
            junit_path: [
                'packages/ios/.derived/junit/core.xml',
                'packages/ios/.derived/junit/core-swift-testing.xml',
            ],
            test_files: [],
        })

        expect(run.ok).toBe(false)
        expect(run.output).toStartWith(
            '`bun run ios:test:core` passed but wrote none of its JUnit files (packages/ios/.derived/junit/core.xml, packages/ios/.derived/junit/core-swift-testing.xml). Check junit_path in .luca/config.json.'
        )
    })

    test("a command that writes its files and exits 1 isn't ok, with its cases and no files without results", async () => {
        await writeFixturePackage()

        const run = await junitRun({ command: `${WRITES_BOTH} && exit 1` })

        expect(run.ok).toBe(false)
        expect(run.cases).toHaveLength(10)
        expect(run.files_without_results).toEqual([])
    })
})

describe('runJunitTests: test slots, the time limit, and the command as written (#668)', () => {
    test('with test_concurrency: 1, the second of two runs waits for a slot and records wait_ms', async () => {
        await mkdir(join(repo, 'a'))
        await mkdir(join(repo, 'b'))
        const both = ['a', 'b'].map((name) =>
            junitRun({
                command: 'sleep 0.6; exit 1',
                cwd: join(repo, name),
                test_files: [],
                test_concurrency: 1,
            })
        )

        const waits = (await Promise.all(both))
            .map(({ wait_ms }) => wait_ms ?? 0)
            .toSorted((a, b) => a - b)

        expect(waits[0]).toBeLessThan(300)
        expect(waits[1]).toBeGreaterThanOrEqual(500)
    })

    test('a command that runs past test_timeout_ms fails with the timed-out line', async () => {
        const run = await junitRun({
            command: 'sleep 5',
            test_files: [],
            timeout_ms: 500,
        })

        expect(run.ok).toBe(false)
        expect(run.output).toStartWith(
            timedOutLine({ timeout_ms: 500, hint: TEST_TIMEOUT_HINT })
        )
    })

    test('the command runs as written, with no --reporter or --timeout added', async () => {
        await writeFixturePackage()
        await writeFiles({
            'stand-in.sh': `printf '%s' "$*" > args.txt\n${WRITES_BOTH}\n`,
        })

        const run = await junitRun({ command: 'sh stand-in.sh' })

        expect(run.command).toBe('sh stand-in.sh')
        expect(await Bun.file(join(repo, 'args.txt')).text()).toBe('')
        expect(run.cases).toHaveLength(10)
    })
})
