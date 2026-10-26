/**
 * The test commands that give per-test results (#668), run and joined into
 * one run: for the baseline, the red check and the already-done check.
 */
import type { TestRun } from './gate-schemas'
import { runJunitTests } from './junit-runner'
import { joinRuns, reportFileFor, runTests } from './test-runner'

import type { TestCommand } from '../config/engine-config'

/**
 * Runs each command in order, a `bun` one with bun's JUnit reporter (see
 * `runTests`) and a `junit` one as written (see `runJunitTests`), and joins
 * them into one run (see `joinRuns`). Each command gets its own report file.
 *
 * @example
 * const run = await runCaseTests({ cwd, commands: caseTestCommands({ config }), test_files, report_file, timeout_ms, bun_files_only: hasJunitCommand({ config }) })
 */
export const runCaseTests = async ({
    cwd,
    commands,
    test_files,
    report_file,
    timeout_ms,
    test_concurrency,
    exclusive,
    bun_files_only,
}: {
    cwd: string
    commands: TestCommand[]
    test_files: string[]
    report_file: string
    /** Each command's time limit (see `runTests`). */
    timeout_ms: number
    /** The config's `test_concurrency`: each command takes a test slot. */
    test_concurrency?: number
    /** Each command runs alone, holding every test slot (#544). */
    exclusive?: boolean
    /** See `runTests`. */
    bun_files_only?: boolean
}): Promise<TestRun> => {
    const runs: TestRun[] = []
    for (const [index, { run, results, junit_path }] of commands.entries()) {
        const run_report = reportFileFor({ report_file, index })
        runs.push(
            results === 'junit'
                ? await runJunitTests({
                      cwd,
                      command: run,
                      junit_path,
                      test_files,
                      report_file: run_report,
                      timeout_ms,
                      test_concurrency,
                      exclusive,
                  })
                : await runTests({
                      cwd,
                      command: run,
                      test_files,
                      report_file: run_report,
                      timeout_ms,
                      test_concurrency,
                      exclusive,
                      bun_files_only,
                  })
        )
    }
    return joinRuns({ runs, test_files })
}
