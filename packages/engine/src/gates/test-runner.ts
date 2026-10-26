import { existsSync } from 'node:fs'

import type { TestCase, TestRun } from './gate-schemas'
import { inTestSlot } from './test-slots'

import { clipOutput, runShell, timedOutLine } from '../shell/run-command'

const decode = (text: string): string =>
    text
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')

const attribute = ({
    attrs,
    name,
}: {
    attrs: string
    name: string
}): string | undefined => {
    const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)
    return match ? decode(match[1] ?? '') : undefined
}

/**
 * Reads a JUnit file. In bun's report there is one `<testsuite file=..>` per
 * file, a nested `<testsuite>` per describe, and a `<testcase>` per test.
 * Each case keeps its `time`, in whole milliseconds, and its `assertions`
 * count when the report has them (#518, #581).
 *
 * A `<testcase>` with no `file` but a `classname` (SwiftPM's shape, #668) is
 * read by `read_swift_case`, when given (see `swiftTestIndex`).
 */
export const parseJunit = ({
    xml,
    read_swift_case,
}: {
    xml: string
    read_swift_case?: (testcase: {
        classname: string
        name: string
    }) => Pick<TestCase, 'file' | 'full_name' | 'assertions'>
}): TestCase[] => {
    const cases: TestCase[] = []
    const suites: string[] = []
    /** The index in `cases` of the `<testcase>` still open, if any. */
    let open = -1
    const tags =
        /<(\/?)(testsuite|testcase|failure|error|skipped)\b([^>]*?)(\/?)>/g
    for (let match = tags.exec(xml); match; match = tags.exec(xml)) {
        const [, closing, tag, attrs = '', selfClosing] = match
        if (tag === 'testsuite') {
            if (closing) suites.pop()
            else if (!selfClosing)
                suites.push(attribute({ attrs, name: 'name' }) ?? '')
        } else if (tag === 'testcase') {
            if (closing) {
                open = -1
                continue
            }
            const name = attribute({ attrs, name: 'name' }) ?? ''
            const seconds = Number(attribute({ attrs, name: 'time' }))
            const assertions = Number(attribute({ attrs, name: 'assertions' }))
            const file = attribute({ attrs, name: 'file' })
            const classname = attribute({ attrs, name: 'classname' })
            const named =
                file === undefined &&
                classname !== undefined &&
                read_swift_case !== undefined
                    ? read_swift_case({ classname, name })
                    : {
                          file: file ?? suites[0] ?? '',
                          full_name: [...suites.slice(1), name].join(' > '),
                          ...(Number.isInteger(assertions) && assertions >= 0
                              ? { assertions }
                              : {}),
                      }
            cases.push({
                ...named,
                status: 'passed',
                ...(Number.isFinite(seconds)
                    ? { duration_ms: Math.round(seconds * 1000) }
                    : {}),
            })
            open = selfClosing ? -1 : cases.length - 1
        } else if (open >= 0 && !closing) {
            const testCase = cases[open]
            if (testCase !== undefined) {
                cases[open] = {
                    ...testCase,
                    status: tag === 'skipped' ? 'skipped' : 'failed',
                }
            }
        }
    }
    return cases
}

/** Keeps the files that match any of the engine config's test patterns. */
export const testFilesAmong = ({
    files,
    test_file_patterns,
}: {
    files: string[]
    test_file_patterns: string[]
}): string[] => {
    const globs = test_file_patterns.map((pattern) => new Bun.Glob(pattern))
    return files.filter(
        (file) =>
            !file.includes('node_modules/') &&
            globs.some((glob) => glob.match(file))
    )
}

/**
 * Whether bun can run a test file (#668): its name ends in `.test`, `_test`,
 * `.spec` or `_spec`, then `.js`, `.jsx`, `.ts` or `.tsx`.
 *
 * @example
 * isBunTestFile('src/sum.test.ts') // true
 * isBunTestFile('Tests/CalcTests/AddingTests.swift') // false
 */
export const isBunTestFile = (file: string): boolean =>
    /[._](?:test|spec)\.(?:js|jsx|ts|tsx)$/.test(file)

const NO_TEST_FILES = /0 test files matching|No tests found!/

/**
 * How to give a test command longer, for the timed-out message. Every test
 * command says the same, whatever its kind (#542).
 */
export const TEST_TIMEOUT_HINT =
    'To give it longer, raise `test_timeout_ms` in `.luca/config.json`.'

/**
 * Runs the engine config's test command with bun's JUnit reporter, so each
 * test case's outcome is known. The command must be a `bun test` command; the
 * reporter flags are added at its end. The report goes outside the worktree.
 *
 * A repo with no test files counts as a pass: `bun test` exits 1 there, but a
 * baseline with nothing to break is fine.
 *
 * One that runs past `timeout_ms` (see `testTimeoutOf`) is stopped, with
 * everything it started, and fails; its output starts by saying so, and how
 * to give it longer (#542).
 *
 * With `test_concurrency` (#544), it first waits for a test slot (see
 * `inTestSlot`): the run records that wait as `wait_ms`, and its time limit
 * starts after it. An `exclusive` run (a lone rerun, #544) waits until no
 * other test run is going, and holds every slot while it runs.
 *
 * With `bun_files_only` (a config with a `junit` command, #668), its
 * `files_without_results` lists only files bun can run (see `isBunTestFile`).
 */
export const runTests = async ({
    cwd,
    command,
    test_files,
    report_file,
    timeout_ms,
    test_concurrency,
    exclusive,
    bun_files_only,
}: {
    cwd: string
    command: string
    /** The worktree's test files, to spot files that produced no results. */
    test_files: string[]
    report_file: string
    timeout_ms: number
    /** The config's `test_concurrency`; left out, no cap. */
    test_concurrency?: number
    /** Run alone, holding every test slot (#544). Left out, it doesn't. */
    exclusive?: boolean
    /** Only bun's files can lack results (#668). Left out, every file can. */
    bun_files_only?: boolean
}): Promise<TestRun> =>
    inTestSlot({
        test_concurrency,
        exclusive,
        work: () =>
            runTestsInHeldSlot({
                cwd,
                command,
                test_files,
                report_file,
                timeout_ms,
                bun_files_only,
            }),
    })

/**
 * `runTests` for a caller that already holds a test slot (see `inTestSlot`):
 * it runs at once, taking no slot of its own.
 */
export const runTestsInHeldSlot = async ({
    cwd,
    command,
    test_files,
    report_file,
    timeout_ms,
    bun_files_only = false,
}: {
    cwd: string
    command: string
    test_files: string[]
    report_file: string
    timeout_ms: number
    bun_files_only?: boolean
}): Promise<TestRun> => {
    const shell = await runShell({
        command: `${command} --reporter=junit --reporter-outfile='${report_file}'`,
        cwd,
        timeout_ms,
    })
    const output = `${shell.stdout}\n${shell.stderr}`
    const noTestFiles = NO_TEST_FILES.test(output)
    const cases = existsSync(report_file)
        ? parseJunit({ xml: await Bun.file(report_file).text() })
        : []
    const withResults = new Set(cases.map(({ file }) => file))
    return {
        command,
        ok:
            !shell.timed_out &&
            (shell.exit_code === 0 || (noTestFiles && test_files.length === 0)),
        exit_code: shell.exit_code,
        no_test_files: noTestFiles,
        cases,
        files_without_results: test_files.filter(
            (file) =>
                !withResults.has(file) &&
                (!bun_files_only || isBunTestFile(file))
        ),
        output: `${shell.timed_out ? timedOutLine({ timeout_ms, hint: TEST_TIMEOUT_HINT, survivors: shell.survivors }) : ''}${clipOutput({ text: output })}`,
    }
}

/** A word quoted for `sh`, whatever it holds. */
const shellWord = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`

/**
 * A bun test command that runs just these test files: the config's command
 * with each file after it, as a `./` path so bun takes it as a path, not a
 * name to match. A command that already names a folder runs that too.
 *
 * @example
 * onlyTestFiles({ command: 'bun test', files: ['src/sum.test.ts'] })
 * // "bun test './src/sum.test.ts'"
 */
export const onlyTestFiles = ({
    command,
    files,
}: {
    command: string
    files: string[]
}): string =>
    [command, ...files.map((file) => shellWord(`./${file}`))].join(' ')

/**
 * The report file for the `index`th of several commands: the first keeps
 * `report_file`, the others get a numbered one beside it.
 *
 * @example
 * reportFileFor({ report_file: '/r/3-11-red.xml', index: 1 }) // '/r/3-11-red-2.xml'
 */
export const reportFileFor = ({
    report_file,
    index,
}: {
    report_file: string
    index: number
}): string =>
    index === 0
        ? report_file
        : report_file.replace(/(\.xml)?$/, `-${index + 1}$1`)

/**
 * A command that runs just these test files with plain `bun test` (#564):
 * never the config's command plus the files, because Bun's
 * `--path-ignore-patterns` leaves out even files named on the command line.
 *
 * @example
 * fileTestsCommand({ files: ['src/a.e2e.test.ts'] }) // "bun test './src/a.e2e.test.ts'"
 */
export const fileTestsCommand = ({ files }: { files: string[] }): string =>
    onlyTestFiles({ command: 'bun test', files })

/**
 * A fast run with a ticket's own-files run (#564) joined on (see
 * `joinRuns`). An own run that gave no results at all means every file in it
 * still doesn't load, which the fast run already said: it changes nothing,
 * so the fast run, its command, and its output stay exactly as they are.
 * (A fast test file that can't load yet, the usual red state, is such a
 * file: it is not run twice in the journal.)
 *
 * @example
 * const current = withOwnRun({ fast, own: await runTests({ ... }), test_files })
 */
export const withOwnRun = ({
    fast,
    own,
    test_files,
}: {
    fast: TestRun
    own: TestRun
    test_files: string[]
}): TestRun =>
    own.cases.length === 0 ? fast : joinRuns({ runs: [fast, own], test_files })

/**
 * Several test runs as one: every case, `ok` only when all passed, and a test
 * file without results when some run listed it and no run gave it any (so a
 * file only a `junit` command covers, #668, can be left out of every list),
 * with `junit_missing` when any run has it. One run is itself. No
 * run (a run of refactor tickets only, which the red check skips) gives an
 * empty passing run. Used for the baseline, the red check and the
 * already-done check (`runCaseTests`), for the gates' own-files run, and
 * for a ticket's own slow test files (#564). Their waits for a test slot
 * add up to the joined run's `wait_ms` (#544).
 *
 * @example
 * const run = joinRuns({ runs: [fast, own], test_files })
 */
export const joinRuns = ({
    runs,
    test_files,
}: {
    runs: TestRun[]
    test_files: string[]
}): TestRun => {
    const [first] = runs
    if (first === undefined) {
        return {
            command: '',
            ok: true,
            exit_code: 0,
            no_test_files: false,
            cases: [],
            files_without_results: [],
            output: 'No test command with bun results to run.',
        }
    }
    if (runs.length === 1) return first
    const cases = runs.flatMap((run) => run.cases)
    const withResults = new Set(cases.map(({ file }) => file))
    const listed = new Set(
        runs.flatMap(({ files_without_results }) => files_without_results)
    )
    const waits = runs.flatMap(({ wait_ms }) =>
        wait_ms === undefined ? [] : [wait_ms]
    )
    return {
        command: runs.map(({ command }) => command).join(' && '),
        ok: runs.every(({ ok }) => ok),
        exit_code: runs.find(({ ok }) => !ok)?.exit_code ?? first.exit_code,
        no_test_files: runs.every(({ no_test_files }) => no_test_files),
        cases,
        files_without_results: test_files.filter(
            (file) => listed.has(file) && !withResults.has(file)
        ),
        ...(runs.some(({ junit_missing }) => junit_missing === true)
            ? { junit_missing: true }
            : {}),
        output: clipOutput({
            text: runs
                .map(({ command, output }) => `$ ${command}\n${output}`)
                .join('\n\n'),
        }),
        ...(waits.length === 0
            ? {}
            : { wait_ms: waits.reduce((total, wait) => total + wait, 0) }),
    }
}
