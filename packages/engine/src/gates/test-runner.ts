import { existsSync } from 'node:fs'

import type { TestCase, TestRun } from './gate-schemas'
import { inTestSlot } from './prepare-slots'

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
 * Reads bun's JUnit report: one `<testsuite file=..>` per file, a nested
 * `<testsuite>` per describe, and a `<testcase>` per test. Each case keeps
 * its `time`, in whole milliseconds, and its `assertions` count when the
 * report has them (#518, #581).
 */
export const parseJunit = ({ xml }: { xml: string }): TestCase[] => {
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
            cases.push({
                file: attribute({ attrs, name: 'file' }) ?? suites[0] ?? '',
                full_name: [...suites.slice(1), name].join(' > '),
                status: 'passed',
                ...(Number.isFinite(seconds)
                    ? { duration_ms: Math.round(seconds * 1000) }
                    : {}),
                ...(Number.isInteger(assertions) && assertions >= 0
                    ? { assertions }
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
 * starts after it.
 */
export const runTests = async ({
    cwd,
    command,
    test_files,
    report_file,
    timeout_ms,
    test_concurrency,
}: {
    cwd: string
    command: string
    /** The worktree's test files, to spot files that produced no results. */
    test_files: string[]
    report_file: string
    timeout_ms: number
    /** The config's `test_concurrency`; left out, no slot is taken. */
    test_concurrency?: number
}): Promise<TestRun> =>
    inTestSlot({
        test_concurrency,
        work: () =>
            runTestsNow({ cwd, command, test_files, report_file, timeout_ms }),
    })

const runTestsNow = async ({
    cwd,
    command,
    test_files,
    report_file,
    timeout_ms,
}: {
    cwd: string
    command: string
    test_files: string[]
    report_file: string
    timeout_ms: number
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
            (file) => !withResults.has(file)
        ),
        output: `${shell.timed_out ? timedOutLine({ timeout_ms, hint: TEST_TIMEOUT_HINT }) : ''}${clipOutput({ text: output })}`,
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
 * Runs each of the engine config's bun test commands (see `runTests`) and
 * joins them into one run, for the baseline and the red check: every case,
 * `ok` only when all pass, and a test file without results only when no
 * command gave it any. One command gives exactly its own run. No command
 * (a run of refactor tickets only, which the red check skips) gives an
 * empty passing run.
 *
 * @example
 * const run = await runBunTests({ cwd, commands: ['bun test'], test_files, report_file, timeout_ms: testTimeoutOf({ config }) })
 */
export const runBunTests = async ({
    cwd,
    commands,
    test_files,
    report_file,
    timeout_ms,
    test_concurrency,
}: {
    cwd: string
    commands: string[]
    test_files: string[]
    report_file: string
    /** Each command's time limit (see `runTests`). */
    timeout_ms: number
    /** The config's `test_concurrency`: each command takes a test slot. */
    test_concurrency?: number
}): Promise<TestRun> => {
    const runs: TestRun[] = []
    for (const [index, command] of commands.entries()) {
        runs.push(
            await runTests({
                cwd,
                command,
                test_files,
                report_file: reportFileFor({ report_file, index }),
                timeout_ms,
                test_concurrency,
            })
        )
    }
    return joinRuns({ runs, test_files })
}

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
 * file without results only when no run gave it any. One run is itself. No
 * run (a run of refactor tickets only, which the red check skips) gives an
 * empty passing run. Used for the baseline and the red check
 * (`runBunTests`) and for a ticket's own slow test files (#564). Their
 * waits for a test slot add up to the joined run's `wait_ms` (#544).
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
            (file) => !withResults.has(file)
        ),
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
