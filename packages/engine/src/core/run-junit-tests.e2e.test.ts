import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { ticketIssue } from '../testing/intake-fixtures'
import {
    APPROVE,
    createPracticeRepo,
    git,
    IMPLEMENTER_RESULT,
    PRACTICE_ENGINE_CONFIG,
} from '../testing/practice-repo'

/**
 * A `junit` test command (#668) end to end on the practice repo: the
 * baseline, the red check, the already-done check and the gates read its
 * Swift cases. The command is a stand-in shell script for `swift test`, so
 * no test needs a Swift toolchain.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-junit-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const JUNIT_COMMAND = 'sh scripts/swift-test.sh'
const SWIFT_FILE = 'Tests/CoreTests/RankingTests.swift'
const SOURCE_FILE = 'Sources/Core/Ranking.swift'
const ADDS_MOVIE = 'RankingTests > addsMovie()'

const JUNIT_ENTRY = {
    run: JUNIT_COMMAND,
    results: 'junit',
    junit_path: ['out/core-swift-testing.xml'],
}

const config = ({ with_bun }: { with_bun: boolean }) => ({
    ...PRACTICE_ENGINE_CONFIG,
    checks: {
        ...PRACTICE_ENGINE_CONFIG.checks,
        test: with_bun ? ['bun test', JUNIT_ENTRY] : [JUNIT_ENTRY],
    },
    test_file_patterns: ['src/**/*.test.ts', 'Tests/**/*.swift'],
})

/** An old Swift test, and maybe `addsMovie()` with this body. */
const rankingTests = (adds_movie?: string) => `import Testing
@testable import Core

struct RankingTests {
    @Test func sortsByScore() {
        #expect(sortByScore([2, 1]) == [1, 2])
    }
${adds_movie === undefined ? '' : `\n    @Test func addsMovie() {\n        ${adds_movie}\n    }\n`}}
`

const RED_TESTS = rankingTests('#expect(addMovie(["Up"]) == ["Up"])')
const EMPTY_RED_TESTS = rankingTests('_ = addMovie(["Up"])')

const RANKING_SOURCE =
    'func addMovie(_ movies: [String]) -> [String] { movies }\n'

const caseLine = (name: string, inner = '') =>
    `echo '<testcase classname="CoreTests.RankingTests" name="${name}" time="0.001">${inner}</testcase>' >> "$f"`

/**
 * A stand-in for `swift test`. `addsMovie()` needs `Sources/Core/Ranking.swift`:
 * without it, the tests don't build (`builds: false`: exit 1, no file) or
 * the test fails (`builds: true`).
 */
const standIn = ({
    builds,
}: {
    builds: boolean
}) => `f=out/core-swift-testing.xml
needs=0
grep -q 'func addsMovie' ${SWIFT_FILE} && needs=1
if [ "$needs" = 1 ] && [ ! -f ${SOURCE_FILE} ] && [ ${builds ? 1 : 0} = 0 ]; then
    echo 'error: Build failed'
    exit 1
fi
echo '<testsuites><testsuite name="TestResults">' > "$f"
${caseLine('sortsByScore()')}
code=0
if [ "$needs" = 1 ]; then
    if [ -f ${SOURCE_FILE} ]; then
        ${caseLine('addsMovie()')}
    else
        ${caseLine('addsMovie()', '<failure message="addMovie is missing" />')}
        code=1
    fi
fi
echo '</testsuite></testsuites>' >> "$f"
exit $code
`

const HELLO_TEST = `import { expect, test } from 'bun:test'

test('hello', () => {
    expect(1 + 1).toBe(2)
})
`

const RANKING_TICKET = ticketIssue({
    number: 11,
    title: 'Add a movie to the ranking',
    criteria: ['addMovie adds a movie'],
})

const CRITERIA = [
    {
        criterion_id: 'AC1',
        tests: [{ file: SWIFT_FILE, name: ADDS_MOVIE }],
    },
]

const testWriter = (tests: string): ScriptedTurn => ({
    role: 'test-writer',
    ticket: 11,
    files: { [SWIFT_FILE]: tests },
    result: {
        outcome: 'tests_written',
        criteria: CRITERIA,
        summary: 'One Swift test.',
        assumptions: [],
        run_notes: [],
    },
})

const IMPLEMENTER: ScriptedTurn = {
    role: 'implementer',
    ticket: 11,
    files: { [SOURCE_FILE]: RANKING_SOURCE },
    result: IMPLEMENTER_RESULT,
}

const REVIEWER: ScriptedTurn = {
    role: 'ticket-reviewer',
    ticket: 11,
    result: APPROVE,
}

const practiceWith = ({
    builds,
    with_bun = true,
    files,
}: {
    builds: boolean
    with_bun?: boolean
    files?: Record<string, string>
}) =>
    createPracticeRepo({
        root,
        config: config({ with_bun }),
        files: {
            '.gitignore': 'node_modules\nout/\n',
            'scripts/swift-test.sh': standIn({ builds }),
            'src/hello.test.ts': HELLO_TEST,
            [SWIFT_FILE]: rankingTests(),
            ...files,
        },
    })

const byKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

const ticketGates = (records: JournalRecord[]) =>
    byKind(records, 'gates_run')
        .map(({ content }) => content)
        .filter(({ target }) => target === 'ticket')

describe('a junit test command, end to end (#668)', () => {
    test("the baseline and the red check run the junit command after bun's, and journal its Swift cases", async () => {
        const practice = await practiceWith({ builds: true })

        const { action, records } = await practice.run({
            ticket: RANKING_TICKET,
            turns: [testWriter(RED_TESTS), IMPLEMENTER, REVIEWER],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [baseline] = byKind(records, 'baseline_tests')
        expect(baseline?.content.command).toBe(`bun test && ${JUNIT_COMMAND}`)
        expect(baseline?.content.cases).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    file: 'src/hello.test.ts',
                    full_name: 'hello',
                    status: 'passed',
                }),
                expect.objectContaining({
                    file: SWIFT_FILE,
                    full_name: 'RankingTests > sortsByScore()',
                    status: 'passed',
                }),
            ])
        )
        const [red] = byKind(records, 'red_check')
        expect(red?.content).toMatchObject({ ok: true, problems: [] })
        expect(red?.content.tests.command).toBe(`bun test && ${JUNIT_COMMAND}`)
        expect(red?.content.tests.cases).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    file: SWIFT_FILE,
                    full_name: ADDS_MOVIE,
                    status: 'failed',
                }),
                expect.objectContaining({
                    file: SWIFT_FILE,
                    full_name: 'RankingTests > sortsByScore()',
                    status: 'passed',
                }),
            ])
        )
    }, 120_000)

    test('a Swift test that builds red, passes after the implementer, and is journaled in gates_run with its file and assertions', async () => {
        const practice = await practiceWith({ builds: false })

        const { action, records } = await practice.run({
            ticket: RANKING_TICKET,
            turns: [testWriter(RED_TESTS), IMPLEMENTER, REVIEWER],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [red] = byKind(records, 'red_check')
        expect(red?.content).toMatchObject({ ok: true, problems: [] })
        expect(red?.content.tests.junit_missing).toBe(true)
        expect(red?.content.notes).toContain(
            `"${ADDS_MOVIE}" in ${SWIFT_FILE}: fails (the tests do not build yet)`
        )
        const [gates] = ticketGates(records)
        expect(gates?.ok).toBe(true)
        expect(gates?.cases).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    file: SWIFT_FILE,
                    full_name: ADDS_MOVIE,
                    status: 'passed',
                    assertions: 1,
                }),
            ])
        )
    }, 120_000)

    test('a mapped Swift test whose body calls no #expect sends the ticket back as an empty test', async () => {
        const practice = await practiceWith({ builds: true })

        const { action, records, launches } = await practice.run({
            ticket: RANKING_TICKET,
            turns: [
                testWriter(EMPTY_RED_TESTS),
                IMPLEMENTER,
                testWriter(RED_TESTS),
                IMPLEMENTER,
                REVIEWER,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [reset] = byKind(records, 'worktree_reset')
        expect(reset?.content).toMatchObject({
            bad_test: { file: SWIFT_FILE, name: ADDS_MOVIE },
        })
        expect(
            ticketGates(records).map(
                ({ cases }) =>
                    cases?.find(({ full_name }) => full_name === ADDS_MOVIE)
                        ?.assertions
            )
        ).toEqual([0, 1])
        const writers = launches.filter(
            ({ ticket, role }) => ticket === 11 && role === 'test-writer'
        )
        expect(writers[1]?.prompt).toContain(
            'The engine found this test checks nothing'
        )
    }, 180_000)

    test('the already-done check runs the junit command whole and accepts a named Swift test that passes', async () => {
        const practice = await practiceWith({
            builds: true,
            with_bun: false,
            files: { [SWIFT_FILE]: RED_TESTS, [SOURCE_FILE]: RANKING_SOURCE },
        })
        const sha = (await git(practice.repo, 'rev-parse', 'HEAD')).trim()

        const { action, records } = await practice.run({
            ticket: RANKING_TICKET,
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    result: {
                        outcome: 'already_done',
                        done_by: [{ sha, title: 'feat: add addMovie' }],
                        criteria: CRITERIA,
                        summary: 'addMovie and its test are on main.',
                    },
                },
            ],
        })

        expect(action).toEqual({ type: 'done', outcome: 'nothing_to_do' })
        const [checked] = byKind(records, 'already_done_checked')
        expect(checked?.content).toMatchObject({ ok: true, problems: [] })
        expect(checked?.content.tests?.command).toBe(JUNIT_COMMAND)
        expect(checked?.content.tests?.cases).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    file: SWIFT_FILE,
                    full_name: ADDS_MOVIE,
                    status: 'passed',
                }),
            ])
        )
    }, 120_000)
})
