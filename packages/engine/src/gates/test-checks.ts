/**
 * The test commands as gate checks (`testChecks`): `pass_fail` commands judged
 * by their exit code, `bun` commands run with bun's JUnit reporter, `junit`
 * commands (#668) run as written and read from their JUnit files, each
 * waiting for a test slot first. Also the fast test speed limit (#580).
 */
import type { GateCheck, TestRun } from './gate-schemas'
import { runJunitTestsInHeldSlot } from './junit-runner'
import { msSince, shellCheck } from './shell-check'
import {
    reportFileFor,
    runTestsInHeldSlot,
    TEST_TIMEOUT_HINT,
} from './test-runner'
import { inTestSlot } from './test-slots'

import type { TestCommand } from '../config/engine-config'

/** What to do about a fast test over the speed limit (#580). */
export const FAST_TEST_HINT = ({ limit_ms }: { limit_ms: number }): string =>
    `A fast test may take at most ${limit_ms} ms (\`test_case_timeout_ms\`). Make it faster, or move it to the slow tests.`

/** The fast test speed limit (#580), and the files measured against it. */
export type SpeedLimit = { limit_ms: number; measured_files: string[] }

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
 * overrides `--timeout`, so only its measured time tells. A `junit` command
 * (#668) never gets `--timeout`: its measured times are all that hold it.
 *
 * With `test_concurrency` (#544), each command first waits for a test slot
 * (see `inTestSlot`); its check records the wait as `wait_ms`, and its time
 * limit and `duration_ms` start after it. With `exclusive` (a lone rerun,
 * #544), each command waits until no other test run is going, and holds
 * every slot while it runs.
 */
export const testChecks = async ({
    commands,
    name,
    cwd,
    test_files,
    report_file,
    first_index,
    timeout_ms,
    limit,
    test_concurrency,
    exclusive,
    bun_files_only,
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
    /** The config's `test_concurrency`; left out, no cap. */
    test_concurrency: number | undefined
    exclusive: boolean
    /** A config with a `junit` command (#668): see `runTests`. */
    bun_files_only: boolean
}): Promise<{ checks: GateCheck[]; runs: TestRun[] }> => {
    const checks: GateCheck[] = []
    const runs: TestRun[] = []
    for (const [
        offset,
        { run: command, results, junit_path },
    ] of commands.entries()) {
        if (results === 'pass_fail') {
            checks.push(
                await inTestSlot({
                    test_concurrency,
                    exclusive,
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
                exclusive,
                work: async () => {
                    const started = performance.now()
                    const run_report = reportFileFor({
                        report_file,
                        index: first_index + offset,
                    })
                    const run =
                        results === 'junit'
                            ? await runJunitTestsInHeldSlot({
                                  cwd,
                                  command,
                                  junit_path,
                                  test_files,
                                  report_file: run_report,
                                  timeout_ms,
                              })
                            : await runTestsInHeldSlot({
                                  cwd,
                                  command:
                                      limit === null
                                          ? command
                                          : `${command} --timeout=${limit.limit_ms}`,
                                  test_files,
                                  report_file: run_report,
                                  timeout_ms,
                                  bun_files_only,
                              })
                    runs.push(run)
                    return bunCheck({ name, run, limit, started })
                },
            })
        )
    }
    return { checks, runs }
}
