import type { GateCheck, GateName, TestCase, TestRun } from './gate-schemas'
import { inTestSlot, PREPARE_SLOTS } from './prepare-slots'
import {
    fileTestsCommand,
    reportFileFor,
    runTests,
    TEST_TIMEOUT_HINT,
} from './test-runner'

import {
    caseLimitOf,
    prepareConcurrencyOf,
    prepareTimeoutOf,
    slowTestCommands,
    testCommands,
    testTimeoutOf,
    type EngineConfig,
    type TestCommand,
} from '../config/engine-config'
import {
    clipOutput,
    DEFAULT_COMMAND_TIMEOUT_MS,
    runShell,
    timedOutLine,
} from '../shell/run-command'

/** Milliseconds since `started` (from `performance.now()`), whole (#518). */
const msSince = (started: number): number =>
    Math.round(performance.now() - started)

/**
 * Runs one shell command as a named check: `ok` on exit 0, with the clipped
 * output only when it failed. One that runs past `timeout_ms` is stopped,
 * with everything it started, and its output starts by saying so, then
 * `timeout_hint`, if any. The check says how long the command ran (#518).
 *
 * @example
 * const install = await shellCheck({ name: 'install', command: 'bun install', cwd })
 */
export const shellCheck = async ({
    name,
    command,
    cwd,
    timeout_ms,
    timeout_hint,
}: {
    name: GateName
    command: string
    cwd: string
    /** Defaults to `DEFAULT_COMMAND_TIMEOUT_MS`. */
    timeout_ms?: number
    /** How to give the command longer, for the timed-out message. */
    timeout_hint?: string
}): Promise<GateCheck> => {
    const limit = timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS
    const started = performance.now()
    const result = await runShell({ command, cwd, timeout_ms: limit })
    const ok = result.exit_code === 0
    const timedOut = result.timed_out
        ? timedOutLine({ timeout_ms: limit, hint: timeout_hint })
        : ''
    return {
        name,
        command,
        ok,
        exit_code: result.exit_code,
        output: ok
            ? ''
            : `${timedOut}${clipOutput({ text: `${result.stdout}\n${result.stderr}` })}`,
        duration_ms: msSince(started),
    }
}

/**
 * Runs the config's prepare command in `cwd`, as the `prepare` check, or
 * `null` when the config has none. The engine runs it before every test run
 * in a checkout, so tests that need build outputs find them up to date.
 * It gets its own time limit (see `prepareTimeoutOf`), since a first build
 * can take far longer than other commands.
 *
 * At most `prepareConcurrencyOf` prepare runs go at once in the engine (see
 * `PREPARE_SLOTS`); the rest wait their turn. The time limit starts when a
 * run starts, so waiting for a turn never counts toward it. The check says
 * how long it waited for its turn, as `wait_ms` (#518).
 *
 * @example
 * const prepare = await prepareCheck({ config, cwd })
 * if (prepare !== null && !prepare.ok) console.log(prepare.output)
 */
export const prepareCheck = async ({
    config,
    cwd,
}: {
    config: EngineConfig
    cwd: string
}): Promise<GateCheck | null> => {
    const { prepare } = config
    if (prepare === undefined) return null
    const asked = performance.now()
    return PREPARE_SLOTS.run({
        limit: prepareConcurrencyOf({ config }),
        work: async () => {
            const wait_ms = msSince(asked)
            const check = await shellCheck({
                name: 'prepare',
                command: prepare,
                cwd,
                timeout_ms: prepareTimeoutOf({ config }),
                timeout_hint:
                    'To give it longer, raise `prepare_timeout_ms` in `.luca/config.json`.',
            })
            return { ...check, wait_ms }
        },
    })
}

/** What to do about a fast test over the speed limit (#580). */
export const FAST_TEST_HINT = ({ limit_ms }: { limit_ms: number }): string =>
    `A fast test may take at most ${limit_ms} ms (\`test_case_timeout_ms\`). Make it faster, or move it to the slow tests.`

/** The fast test speed limit (#580), and the files measured against it. */
type SpeedLimit = { limit_ms: number; measured_files: string[] }

/**
 * A `bun` test command's run as a gate check named `name`: it fails on a
 * failed run, or on a passing test over the fast test speed limit (see
 * `testChecks`), and it ran from `started` until now.
 */
const bunCheck = ({
    name,
    run,
    limit,
    started,
}: {
    name: 'test' | 'slow_test'
    run: TestRun
    limit: SpeedLimit | null
    started: number
}): GateCheck => {
    const tooSlow =
        limit === null
            ? []
            : run.cases.filter(
                  ({ file, status, duration_ms }) =>
                      status === 'passed' &&
                      limit.measured_files.includes(file) &&
                      (duration_ms ?? 0) > limit.limit_ms
              )
    const timedOut = /timed out after \d+ms/.test(run.output)
    const hint =
        limit === null || (tooSlow.length === 0 && !timedOut)
            ? ''
            : `${FAST_TEST_HINT({ limit_ms: limit.limit_ms })}\n`
    const slowLines = tooSlow
        .map(
            ({ file, full_name, duration_ms }) =>
                `- ${file} > ${full_name}: ${duration_ms} ms`
        )
        .join('\n')
    const ok = run.ok && tooSlow.length === 0
    return {
        name,
        command: run.command,
        ok,
        exit_code: run.exit_code,
        output: ok
            ? ''
            : `${hint}${slowLines === '' ? '' : `Too slow for a fast test:\n${slowLines}\n`}${run.output}`,
        duration_ms: msSince(started),
    }
}

/**
 * Runs test commands as gate checks named `name`, in order (see `runGates`).
 * With a `limit` (#580, the fast call only), each `bun` command gets
 * `--timeout=<limit_ms>`, and a passing test in one of `measured_files` that
 * took longer than that fails the check: a test's own timeout option
 * overrides `--timeout`, so only its measured time tells.
 *
 * With `test_concurrency` (#544), each command first waits for a test slot
 * (see `inTestSlot`); its check records the wait as `wait_ms`, and its time
 * limit and `duration_ms` start after it.
 */
const testChecks = async ({
    commands,
    name,
    cwd,
    test_files,
    report_file,
    first_index,
    timeout_ms,
    limit,
    test_concurrency,
}: {
    commands: TestCommand[]
    name: 'test' | 'slow_test'
    cwd: string
    test_files: string[]
    report_file: string
    /** The first command's index, so each command gets its own report file. */
    first_index: number
    timeout_ms: number
    /**
     * The fast test speed limit (#580), or `null` for none. Only the fast
     * call has one; slow tests never do.
     */
    limit: SpeedLimit | null
    /** The config's `test_concurrency`; left out, no slot is taken. */
    test_concurrency: number | undefined
}): Promise<{ checks: GateCheck[]; runs: TestRun[] }> => {
    const checks: GateCheck[] = []
    const runs: TestRun[] = []
    for (const [offset, { run: command, results }] of commands.entries()) {
        if (results === 'pass_fail') {
            checks.push(
                await inTestSlot({
                    test_concurrency,
                    work: () =>
                        shellCheck({
                            name,
                            command,
                            cwd,
                            timeout_ms,
                            timeout_hint: TEST_TIMEOUT_HINT,
                        }),
                })
            )
            continue
        }
        checks.push(
            await inTestSlot({
                test_concurrency,
                work: async () => {
                    const started = performance.now()
                    const run = await runTests({
                        cwd,
                        command:
                            limit === null
                                ? command
                                : `${command} --timeout=${limit.limit_ms}`,
                        test_files,
                        report_file: reportFileFor({
                            report_file,
                            index: first_index + offset,
                        }),
                        timeout_ms,
                    })
                    runs.push(run)
                    return bunCheck({ name, run, limit, started })
                },
            })
        )
    }
    return { checks, runs }
}

/**
 * Runs every gate the engine config names, in order: each test command,
 * then (the final review's gates only) each slow test command, types, lint.
 * All must pass. Unset gates are left out; intake refuses a
 * config with no test command. A `bun` test command runs with bun's JUnit
 * reporter; a `pass_fail` one runs as written and is judged by its exit code.
 * Each test command gets the config's time limit (see `testTimeoutOf`);
 * types and lint get the engine's default. With `test_concurrency` (#544),
 * each test command (the own-files run too) waits for a test slot first,
 * and its check records the wait as `wait_ms`.
 *
 * With a fast test speed limit (`test_case_timeout_ms`, #580), every `bun`
 * command of `checks.test` gets `--timeout=<limit>`, and the tests in
 * `measured_files` are also held to it by measured time. Slow commands, the
 * own-files run, and `pass_fail` commands never get it.
 *
 * With `own_test_files` (a ticket's gates, with a slow command, #564), the
 * ones the fast runs gave no results for run next on their own with plain
 * `bun test`, as one more `test` check, with the same time limit. A run that
 * gives no results (its files don't load) adds no check after a failed fast
 * run, which already fails the gate.
 *
 * Also returns `cases`, the test cases of the fast `bun` runs and the
 * own-files run, each with its `expect()` count, so the engine can find a
 * mapped test that checks nothing (#581). A `pass_fail` command has none.
 *
 * With an `install` command (see `installCommand`), the engine runs it first,
 * as the `install` check. A failed install stops there: the other gates
 * would only fail on the missing packages. The config's prepare command
 * runs next, as the `prepare` check, and a failed one stops there too.
 * `around_prepare`, if given, runs the prepare check (so the engine can see
 * what it made).
 *
 * @example
 * const { ok, checks, cases } = await runGates({ cwd, config, test_files, report_file, install: null })
 */
export const runGates = async ({
    cwd,
    config,
    test_files,
    report_file,
    install,
    around_prepare,
    with_slow_tests,
    own_test_files,
    measured_files,
}: {
    cwd: string
    config: EngineConfig
    test_files: string[]
    report_file: string
    install: string | null
    /** Wraps the prepare run. Left out, it runs as is. */
    around_prepare?: (
        prepare: () => Promise<GateCheck | null>
    ) => Promise<GateCheck | null>
    /**
     * The final review's gates also run the config's slow tests (#563), after
     * the test commands, as `slow_test` checks. Left out, they don't.
     */
    with_slow_tests?: boolean
    /**
     * A ticket's changed test files (#564): those no fast run gave results
     * for are run on their own, as one more `test` check. Left out, none.
     */
    own_test_files?: string[]
    /**
     * A ticket's changed test files: their tests are held to
     * `test_case_timeout_ms` by measured time (#580); left out, none.
     */
    measured_files?: string[]
}): Promise<{ ok: boolean; checks: GateCheck[]; cases: TestCase[] }> => {
    const checks: GateCheck[] = []
    if (install !== null) {
        const installed = await shellCheck({
            name: 'install',
            command: install,
            cwd,
        })
        checks.push(installed)
        if (!installed.ok) return { ok: false, checks, cases: [] }
    }
    const prepare = () => prepareCheck({ config, cwd })
    const prepared = await (around_prepare?.(prepare) ?? prepare())
    if (prepared !== null) {
        checks.push(prepared)
        if (!prepared.ok) return { ok: false, checks, cases: [] }
    }
    const { types, lint } = config.checks
    const timeout_ms = testTimeoutOf({ config })
    const { test_concurrency } = config
    const limit_ms = caseLimitOf({ config })
    const fast = testCommands({ config })
    const fastChecks = await testChecks({
        commands: fast,
        name: 'test',
        cwd,
        test_files,
        report_file,
        first_index: 0,
        timeout_ms,
        limit:
            limit_ms === null
                ? null
                : { limit_ms, measured_files: measured_files ?? [] },
        test_concurrency,
    })
    checks.push(...fastChecks.checks)
    // The test cases the gates saw, for the empty-test check (#581).
    const cases = fastChecks.runs.flatMap((run) => run.cases)
    // A file with no fast bun run at all has no run to have given it results,
    // so it is not one the fast run left out.
    const unrun = (own_test_files ?? []).filter(
        (file) =>
            fastChecks.runs.length > 0 &&
            fastChecks.runs.every(({ files_without_results }) =>
                files_without_results.includes(file)
            )
    )
    if (unrun.length > 0) {
        const { run, ...check } = await inTestSlot({
            test_concurrency,
            work: async () => {
                const started = performance.now()
                const run = await runTests({
                    cwd,
                    command: fileTestsCommand({ files: unrun }),
                    test_files: unrun,
                    report_file: reportFileFor({
                        report_file,
                        index:
                            fast.length + slowTestCommands({ config }).length,
                    }),
                    timeout_ms,
                })
                const check: GateCheck = {
                    name: 'test',
                    command: run.command,
                    ok: run.ok,
                    exit_code: run.exit_code,
                    output: run.ok ? '' : run.output,
                    duration_ms: msSince(started),
                }
                return { ...check, run }
            },
        })
        cases.push(...run.cases)
        // A run with no results at all means its files don't load. After a
        // failed fast run that is no news (the gate fails anyway, and the
        // slow file's load error shows on the next run, once that is fixed);
        // with every fast run passing, it is a real failure of its own.
        if (run.cases.length > 0 || fastChecks.checks.every(({ ok }) => ok)) {
            checks.push(check)
        }
    }
    if (with_slow_tests === true) {
        const slow = await testChecks({
            commands: slowTestCommands({ config }),
            name: 'slow_test',
            cwd,
            test_files,
            report_file,
            first_index: fast.length,
            timeout_ms,
            limit: null,
            test_concurrency,
        })
        checks.push(...slow.checks)
    }
    const others: { name: GateName; command: string | undefined }[] = [
        { name: 'types', command: types },
        { name: 'lint', command: lint },
    ]
    for (const { name, command } of others) {
        if (command === undefined) continue
        checks.push(await shellCheck({ name, command, cwd }))
    }
    return { ok: checks.every(({ ok }) => ok), checks, cases }
}

/**
 * The final review's slow tests (#563), once round 1's lenses are in: the
 * prepare command, if any (a failed one stops there), then each slow
 * test command, in order, as `slow_test` checks with `test_timeout_ms`.
 * `around_prepare`, if given, runs the prepare check, as in `runGates`.
 *
 * @example
 * const { ok, checks } = await runSlowTests({ cwd, config, test_files, report_file })
 */
export const runSlowTests = async ({
    cwd,
    config,
    test_files,
    report_file,
    around_prepare,
}: {
    cwd: string
    config: EngineConfig
    test_files: string[]
    report_file: string
    /** Wraps the prepare run. Left out, it runs as is. */
    around_prepare?: (
        prepare: () => Promise<GateCheck | null>
    ) => Promise<GateCheck | null>
}): Promise<{ ok: boolean; checks: GateCheck[] }> => {
    const prepare = () => prepareCheck({ config, cwd })
    const prepared = await (around_prepare?.(prepare) ?? prepare())
    if (prepared !== null && !prepared.ok) {
        return { ok: false, checks: [prepared] }
    }
    const { checks } = await testChecks({
        commands: slowTestCommands({ config }),
        name: 'slow_test',
        cwd,
        test_files,
        report_file,
        first_index: 0,
        timeout_ms: testTimeoutOf({ config }),
        limit: null,
        test_concurrency: config.test_concurrency,
    })
    const all = prepared === null ? checks : [prepared, ...checks]
    return { ok: all.every(({ ok }) => ok), checks: all }
}
