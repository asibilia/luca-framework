/**
 * The ticket's own slow test files through a slow command's `run_files`
 * (#683): each command with `run_files` runs the ticket's changed test
 * files it owns, as one `pass_fail` check named `own_slow_test`. The red
 * check runs those of them that hold a mapped test the same way.
 */
import type { GateCheck } from './gate-schemas'
import type { SlowRedRun } from './red-check'
import { shellCheck } from './shell-check'
import { testFilesAmong, TEST_TIMEOUT_HINT } from './test-runner'
import { inTestSlot } from './test-slots'

import {
    RUN_FILES_PLACEHOLDER,
    type OwnSlowCommand,
} from '../config/engine-config'
import { runShell } from '../shell/run-command'

/** One slow command's `run_files` and the ticket's files it owns. */
export type OwnSlowRun = { run_files: string; files: string[] }

/**
 * Each command with `run_files`, in config order, with the files it owns
 * among `own_test_files` (those matching its `file_patterns`); a command
 * that owns none is left out. A file two commands own is in both.
 *
 * @example
 * ownSlowRuns({ commands: [{ file_patterns: ['ui/**'], run_files: 'bun run ui-files {files}' }], own_test_files: ['src/sum.test.ts', 'ui/menu.test.ts'] })
 * // [{ run_files: 'bun run ui-files {files}', files: ['ui/menu.test.ts'] }]
 */
export const ownSlowRuns = ({
    commands,
    own_test_files,
}: {
    commands: OwnSlowCommand[]
    own_test_files: string[]
}): OwnSlowRun[] =>
    commands.flatMap(({ file_patterns, run_files }) => {
        const files = testFilesAmong({
            files: own_test_files,
            test_file_patterns: file_patterns,
        })
        return files.length === 0 ? [] : [{ run_files, files }]
    })

/** A path in single quotes for the shell, with any quote in it escaped. */
const quoted = (file: string): string => `'${file.replaceAll("'", "'\\''")}'`

/**
 * A `run_files` command with every `{files}` replaced by the files: each in
 * single quotes, separated by one space.
 *
 * @example
 * filledRunFiles({ run_files: 'bun run ui-files {files}', files: ['ui/a.test.ts', 'ui/b.test.ts'] })
 * // "bun run ui-files 'ui/a.test.ts' 'ui/b.test.ts'"
 */
export const filledRunFiles = ({ run_files, files }: OwnSlowRun): string =>
    run_files.replaceAll(RUN_FILES_PLACEHOLDER, files.map(quoted).join(' '))

/**
 * The red check's own slow runs (#683): each run, in order, with only its
 * files that hold a mapped test (`mapped_files`), each in a test slot (#544)
 * with the test commands' time limit. A run left with no file is not run.
 *
 * @example
 * const slow_runs = await slowRedRuns({ runs, mapped_files: ['ui/menu.test.ts'], cwd, timeout_ms, test_concurrency, exclusive })
 */
export const slowRedRuns = async ({
    runs,
    mapped_files,
    cwd,
    timeout_ms,
    test_concurrency,
    exclusive,
}: {
    runs: OwnSlowRun[]
    mapped_files: string[]
    cwd: string
    timeout_ms: number
    /** The config's `test_concurrency`; left out, no cap. */
    test_concurrency: number | undefined
    exclusive: boolean
}): Promise<SlowRedRun[]> => {
    const ended: SlowRedRun[] = []
    for (const { run_files, files: owned } of runs) {
        const files = owned.filter((file) => mapped_files.includes(file))
        if (files.length === 0) continue
        const result = await inTestSlot({
            test_concurrency,
            exclusive,
            work: () =>
                runShell({
                    command: filledRunFiles({ run_files, files }),
                    cwd,
                    timeout_ms,
                }),
        })
        ended.push({
            files,
            ended: result.timed_out
                ? 'timed_out'
                : result.exit_code === 0
                  ? 'passed'
                  : 'failed',
        })
    }
    return ended
}

/**
 * Runs each own slow run as an `own_slow_test` check, in order, judged by
 * its exit code, each in a test slot (#544) with the test commands' time
 * limit.
 */
export const ownSlowChecks = async ({
    runs,
    cwd,
    timeout_ms,
    test_concurrency,
    exclusive,
}: {
    runs: OwnSlowRun[]
    cwd: string
    timeout_ms: number
    /** The config's `test_concurrency`; left out, no cap. */
    test_concurrency: number | undefined
    exclusive: boolean
}): Promise<GateCheck[]> => {
    const checks: GateCheck[] = []
    for (const run of runs) {
        checks.push(
            await inTestSlot({
                test_concurrency,
                exclusive,
                work: () =>
                    shellCheck({
                        name: 'own_slow_test',
                        command: filledRunFiles(run),
                        cwd,
                        timeout_ms,
                        timeout_hint: TEST_TIMEOUT_HINT,
                    }),
            })
        )
    }
    return checks
}
