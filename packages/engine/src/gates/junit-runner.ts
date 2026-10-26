/**
 * A `junit` test command (#668): the engine runs it as written and reads the
 * JUnit files it names in `junit_path` into test cases.
 */
import { copyFile, lstat, mkdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import once from 'lodash/once'

import type { TestCase, TestRun } from './gate-schemas'
import { swiftTestIndex } from './swift-test-index'
import { isBunTestFile, parseJunit, TEST_TIMEOUT_HINT } from './test-runner'
import { inTestSlot } from './test-slots'

import { clipOutput, runShell, timedOutLine } from '../shell/run-command'

/**
 * The first line of a passing `junit` command's output when it wrote none of
 * its JUnit files.
 */
const noJunitLine = ({
    command,
    junit_path,
}: {
    command: string
    junit_path: string[]
}): string =>
    `\`${command}\` passed but wrote none of its JUnit files (${junit_path.join(', ')}). Check junit_path in .luca/config.json.`

/**
 * Runs a `junit` command (see `runJunitTestsInHeldSlot`) in a test slot
 * (#544), like `runTests`: with `test_concurrency`, the run records its wait
 * as `wait_ms`; an `exclusive` run holds every slot.
 *
 * @example
 * const run = await runJunitTests({ cwd, command: 'bun run ios:test:core', junit_path, test_files, report_file, timeout_ms })
 */
export const runJunitTests = ({
    test_concurrency,
    exclusive,
    ...run
}: {
    cwd: string
    command: string
    /** The JUnit files the command writes, relative to `cwd`. */
    junit_path: string[]
    /** The worktree's test files: the `.swift` ones tie cases to files. */
    test_files: string[]
    /** The run's report file: the JUnit files are kept beside it. */
    report_file: string
    timeout_ms: number
    /** The config's `test_concurrency`; left out, no cap. */
    test_concurrency?: number
    /** Run alone, holding every test slot (#544). Left out, it doesn't. */
    exclusive?: boolean
}): Promise<TestRun> =>
    inTestSlot({
        test_concurrency,
        exclusive,
        work: () => runJunitTestsInHeldSlot(run),
    })

/**
 * Runs a `junit` command for a caller that already holds a test slot.
 *
 * - Before: each `junit_path` file is deleted and its parent folder made. A
 *   folder at the path itself is left alone.
 * - The command runs as written, with `timeout_ms` and no flags added.
 * - After: each file it wrote is read, in `junit_path` order (a SwiftPM case
 *   tied to its file by `swiftTestIndex`, built at the first file read),
 *   copied beside `report_file`, and deleted from the worktree. Anything
 *   there that isn't a file, such as a folder or a broken link, counts as
 *   not written.
 *
 * With files read, the run has their cases and no `files_without_results`.
 * With none, a failed command's run has no cases, `junit_missing`, and every
 * test file bun can't run without results; a passing one fails, saying so.
 */
export const runJunitTestsInHeldSlot = async ({
    cwd,
    command,
    junit_path,
    test_files,
    report_file,
    timeout_ms,
}: {
    cwd: string
    command: string
    junit_path: string[]
    test_files: string[]
    report_file: string
    timeout_ms: number
}): Promise<TestRun> => {
    for (const path of junit_path) {
        const full = join(cwd, path)
        const found = await lstat(full).catch(() => null)
        if (found?.isDirectory() !== true) await rm(full, { force: true })
        await mkdir(dirname(full), { recursive: true })
    }
    const shell = await runShell({ command, cwd, timeout_ms })
    const output = `${shell.timed_out ? timedOutLine({ timeout_ms, hint: TEST_TIMEOUT_HINT, survivors: shell.survivors }) : ''}${clipOutput({ text: `${shell.stdout}\n${shell.stderr}` })}`
    const swiftIndex = once(() => swiftTestIndex({ cwd, test_files }))
    const kept = report_file.replace(/\.xml$/, '')
    const cases: TestCase[] = []
    let read = 0
    for (const [index, path] of junit_path.entries()) {
        const file = join(cwd, path)
        const found = await stat(file).catch(() => null)
        if (found?.isFile() !== true) continue
        read += 1
        cases.push(
            ...parseJunit({
                xml: await Bun.file(file).text(),
                read_swift_case: await swiftIndex(),
            })
        )
        await copyFile(file, `${kept}-junit-${index + 1}-${basename(path)}`)
        await rm(file, { force: true })
    }
    const passed = !shell.timed_out && shell.exit_code === 0
    const run = {
        command,
        exit_code: shell.exit_code,
        no_test_files: false,
    }
    if (read > 0) {
        return {
            ...run,
            ok: passed,
            cases,
            files_without_results: [],
            output,
        }
    }
    const unread = test_files.filter((file) => !isBunTestFile(file))
    return passed
        ? {
              ...run,
              ok: false,
              cases: [],
              files_without_results: unread,
              output: `${noJunitLine({ command, junit_path })}\n${output}`,
          }
        : {
              ...run,
              ok: false,
              cases: [],
              files_without_results: unread,
              output,
              junit_missing: true,
          }
}
