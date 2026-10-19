/**
 * The ticket's own test files (#564): the changed test files no fast `bun`
 * run gave results for, run on their own with plain `bun test` as one more
 * `test` check, after the fast runs.
 */
import type { GateCheck, TestCase, TestRun } from './gate-schemas'
import { msSince } from './shell-check'
import {
    fileTestsCommand,
    reportFileFor,
    runTestsInHeldSlot,
} from './test-runner'
import { inTestSlot } from './test-slots'

/**
 * Runs the `own_test_files` that every fast run left without results (a file
 * with no fast `bun` run at all has no run to have left it out, so it is not
 * one) with plain `bun test`, in a test slot (#544), with the test commands'
 * time limit.
 *
 * Returns the run's test cases, and its check: `null` when there was nothing
 * to run, or when the run gave no results at all (its files don't load) after
 * a failed fast run. That is no news (the gate fails anyway, and the slow
 * file's load error shows on the next run, once that is fixed); with every
 * fast run passing, it is a real failure of its own.
 *
 * @example
 * const { check, cases } = await ownFilesCheck({ own_test_files, fast_checks, fast_runs, cwd, report_file, report_index, timeout_ms, test_concurrency, exclusive })
 */
export const ownFilesCheck = async ({
    own_test_files,
    fast_checks,
    fast_runs,
    cwd,
    report_file,
    report_index,
    timeout_ms,
    test_concurrency,
    exclusive,
}: {
    /** The ticket's changed test files. */
    own_test_files: string[]
    /** The fast test checks, already run. */
    fast_checks: GateCheck[]
    /** The fast `bun` runs, already done. */
    fast_runs: TestRun[]
    cwd: string
    report_file: string
    /** The index for this run's own report file. */
    report_index: number
    timeout_ms: number
    /** The config's `test_concurrency`; left out, no cap. */
    test_concurrency: number | undefined
    exclusive: boolean
}): Promise<{ check: GateCheck | null; cases: TestCase[] }> => {
    // A file with no fast bun run at all has no run to have given it results,
    // so it is not one the fast run left out.
    const unrun = own_test_files.filter(
        (file) =>
            fast_runs.length > 0 &&
            fast_runs.every(({ files_without_results }) =>
                files_without_results.includes(file)
            )
    )
    if (unrun.length === 0) return { check: null, cases: [] }
    const { run, ...check } = await inTestSlot({
        test_concurrency,
        exclusive,
        work: async () => {
            const started = performance.now()
            const run = await runTestsInHeldSlot({
                cwd,
                command: fileTestsCommand({ files: unrun }),
                test_files: unrun,
                report_file: reportFileFor({
                    report_file,
                    index: report_index,
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
    // A run with no results at all means its files don't load. After a
    // failed fast run that is no news (the gate fails anyway, and the slow
    // file's load error shows on the next run, once that is fixed);
    // with every fast run passing, it is a real failure of its own.
    const counts = run.cases.length > 0 || fast_checks.every(({ ok }) => ok)
    return { check: counts ? check : null, cases: run.cases }
}
