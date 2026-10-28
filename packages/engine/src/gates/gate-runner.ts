import type { GateCheck, GateName, TestCase } from './gate-schemas'
import { ownFilesCheck } from './own-files-check'
import { ownSlowChecks, ownSlowRuns } from './own-slow-check'
import { prepareCheck } from './prepare-check'
import { shellCheck } from './shell-check'
import { testChecks } from './test-checks'
import { isBunTestFile } from './test-runner'

import {
    caseLimitOf,
    hasJunitCommand,
    ownSlowCommands,
    slowTestCommands,
    testCommands,
    testTimeoutOf,
    type EngineConfig,
} from '../config/engine-config'

export { prepareCheck } from './prepare-check'
export { runSlowTests } from './slow-test-runner'
export { shellCheck } from './shell-check'
export { FAST_TEST_HINT } from './test-checks'

/**
 * Runs every gate the engine config names, in order: each test command,
 * then (the final review's gates only) each slow test command, types, lint.
 * All must pass. Unset gates are left out; intake refuses a
 * config with no test command. A `bun` test command runs with bun's JUnit
 * reporter; a `junit` one (#668) runs as written and is read from its JUnit
 * files; a `pass_fail` one runs as written and is judged by its exit code.
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
 * run, which already fails the gate. The ones a slow command with
 * `run_files` owns (#683) leave that run: they run next, once through each
 * such command, in config order, as `pass_fail` `own_slow_test` checks with
 * the same time limit.
 *
 * Also returns `cases`, the test cases of the fast `bun` and `junit` runs and the
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
 * With `exclusive` (a lone rerun, #544), each test command waits until no
 * other test run is going, and holds every test slot while it runs.
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
    exclusive = false,
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
     * A ticket's changed test files (#564): those a slow command's
     * `run_files` owns run through it (#683), and of the rest, those no fast
     * run gave results for are run on their own, as one more `test` check.
     * Left out, none.
     */
    own_test_files?: string[]
    /**
     * A ticket's changed test files: their tests are held to
     * `test_case_timeout_ms` by measured time (#580); left out, none.
     */
    measured_files?: string[]
    /** Run each test command alone (#544). Left out, they don't. */
    exclusive?: boolean
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
    // With a junit command (#668), only files bun can run lack bun results,
    // and only they go to the own-files run.
    const bun_files_only = hasJunitCommand({ config })
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
        exclusive,
        bun_files_only,
    })
    checks.push(...fastChecks.checks)
    // The test cases the gates saw, for the empty-test check (#581).
    const cases = fastChecks.runs.flatMap((run) => run.cases)
    // The own files a slow command's run_files owns (#683) run through it,
    // not through the own-files bun run.
    const own_slow_runs = ownSlowRuns({
        commands: ownSlowCommands({ config }),
        own_test_files: own_test_files ?? [],
    })
    const own_slow_files = new Set(own_slow_runs.flatMap(({ files }) => files))
    const own = await ownFilesCheck({
        own_test_files: (own_test_files ?? []).filter(
            (file) =>
                !own_slow_files.has(file) &&
                (!bun_files_only || isBunTestFile(file))
        ),
        fast_checks: fastChecks.checks,
        fast_runs: fastChecks.runs,
        cwd,
        report_file,
        report_index: fast.length + slowTestCommands({ config }).length,
        timeout_ms,
        test_concurrency,
        exclusive,
    })
    cases.push(...own.cases)
    if (own.check !== null) checks.push(own.check)
    checks.push(
        ...(await ownSlowChecks({
            runs: own_slow_runs,
            cwd,
            timeout_ms,
            test_concurrency,
            exclusive,
        }))
    )
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
            exclusive,
            bun_files_only,
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
