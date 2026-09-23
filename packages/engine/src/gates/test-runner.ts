import { existsSync } from 'node:fs'

import type { TestCase, TestRun } from './gate-schemas'

import { clipOutput, runShell } from '../shell/run-command'

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
 * `<testsuite>` per describe, and a `<testcase>` per test.
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
            cases.push({
                file: attribute({ attrs, name: 'file' }) ?? suites[0] ?? '',
                full_name: [...suites.slice(1), name].join(' > '),
                status: 'passed',
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
 * Runs the engine config's test command with bun's JUnit reporter, so each
 * test case's outcome is known. The command must be a `bun test` command; the
 * reporter flags are added at its end. The report goes outside the worktree.
 *
 * A repo with no test files counts as a pass: `bun test` exits 1 there, but a
 * baseline with nothing to break is fine.
 */
export const runTests = async ({
    cwd,
    command,
    test_files,
    report_file,
}: {
    cwd: string
    command: string
    /** The worktree's test files, to spot files that produced no results. */
    test_files: string[]
    report_file: string
}): Promise<TestRun> => {
    const shell = await runShell({
        command: `${command} --reporter=junit --reporter-outfile='${report_file}'`,
        cwd,
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
        output: clipOutput({ text: output }),
    }
}
