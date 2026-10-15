import type { GateCheck, GateName, TestRun } from './gate-schemas'
import { PREPARE_SLOTS } from './prepare-slots'
import { reportFileFor, runTests, TEST_TIMEOUT_HINT } from './test-runner'

import {
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

/** Runs test commands as gate checks named `name`, in order (see `runGates`). */
const testChecks = async ({
    commands,
    name,
    cwd,
    test_files,
    report_file,
    first_index,
    timeout_ms,
}: {
    commands: TestCommand[]
    name: 'test' | 'slow_test'
    cwd: string
    test_files: string[]
    report_file: string
    /** The first command's index, so each command gets its own report file. */
    first_index: number
    timeout_ms: number
}): Promise<{ checks: GateCheck[]; runs: TestRun[] }> => {
    const checks: GateCheck[] = []
    const runs: TestRun[] = []
    for (const [offset, { run: command, results }] of commands.entries()) {
        if (results === 'pass_fail') {
            checks.push(
                await shellCheck({
                    name,
                    command,
                    cwd,
                    timeout_ms,
                    timeout_hint: TEST_TIMEOUT_HINT,
                })
            )
            continue
        }
        const started = performance.now()
        const run = await runTests({
            cwd,
            command,
            test_files,
            report_file: reportFileFor({
                report_file,
                index: first_index + offset,
            }),
            timeout_ms,
        })
        runs.push(run)
        checks.push({
            name,
            command,
            ok: run.ok,
            exit_code: run.exit_code,
            output: run.ok ? '' : run.output,
            duration_ms: msSince(started),
        })
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
 * types and lint get the engine's default.
 *
 * With an `install` command (see `installCommand`), the engine runs it first,
 * as the `install` check. A failed install stops there: the other gates
 * would only fail on the missing packages. The config's prepare command
 * runs next, as the `prepare` check, and a failed one stops there too.
 * `around_prepare`, if given, runs the prepare check (so the engine can see
 * what it made).
 *
 * @example
 * const { ok, checks } = await runGates({ cwd, config, test_files, report_file, install: null })
 */
export const runGates = async ({
    cwd,
    config,
    test_files,
    report_file,
    install,
    around_prepare,
    with_slow_tests,
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
}): Promise<{ ok: boolean; checks: GateCheck[] }> => {
    const checks: GateCheck[] = []
    if (install !== null) {
        const installed = await shellCheck({
            name: 'install',
            command: install,
            cwd,
        })
        checks.push(installed)
        if (!installed.ok) return { ok: false, checks }
    }
    const prepare = () => prepareCheck({ config, cwd })
    const prepared = await (around_prepare?.(prepare) ?? prepare())
    if (prepared !== null) {
        checks.push(prepared)
        if (!prepared.ok) return { ok: false, checks }
    }
    const { types, lint } = config.checks
    const timeout_ms = testTimeoutOf({ config })
    const fast = testCommands({ config })
    const fastChecks = await testChecks({
        commands: fast,
        name: 'test',
        cwd,
        test_files,
        report_file,
        first_index: 0,
        timeout_ms,
    })
    checks.push(...fastChecks.checks)
    if (with_slow_tests === true) {
        const slow = await testChecks({
            commands: slowTestCommands({ config }),
            name: 'slow_test',
            cwd,
            test_files,
            report_file,
            first_index: fast.length,
            timeout_ms,
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
    return { ok: checks.every(({ ok }) => ok), checks }
}
