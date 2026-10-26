/**
 * The `check_already_done` step: a test-writer's `already_done` evidence
 * checked in the ticket's worktree, journaled as `already_done_checked`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import uniq from 'lodash/uniq'
import uniqBy from 'lodash/uniqBy'

import {
    reportFile,
    testFilesIn,
    ticketWorktree,
    type BuildContext,
} from './build-context'
import type { BuildAction } from './decide-build'
import { leaveOutIn, ticketChanges, watchPrepare } from './worktree-changes'

import {
    caseTestCommands,
    hasJunitCommand,
    hasSlowTests,
    testTimeoutOf,
    type TestCommand,
} from '../config/engine-config'
import { checkAlreadyDone } from '../gates/already-done-check'
import { runCaseTests } from '../gates/case-test-runner'
import { prepareCheck } from '../gates/gate-runner'
import {
    fileTestsCommand,
    isBunTestFile,
    onlyTestFiles,
} from '../gates/test-runner'

/**
 * The commands that run the named test files: each `bun` command with the
 * files after it, or, with a slow command, plain `bun test` with them (the
 * fast command would leave out the slow files named, #564). With a `junit`
 * command (#668), only files bun can run go to bun, and each `junit`
 * command runs whole when a named file is one bun can't run.
 */
const namedFileCommands = ({
    context,
    runnable,
}: {
    context: BuildContext
    runnable: string[]
}): TestCommand[] => {
    const junit = hasJunitCommand({ config: context.config })
    const bun_files = junit ? runnable.filter(isBunTestFile) : runnable
    const run_junit = bun_files.length < runnable.length
    if (hasSlowTests({ config: context.config })) {
        const plain: TestCommand = {
            run: fileTestsCommand({ files: bun_files }),
            results: 'bun',
            junit_path: [],
        }
        return [
            ...(bun_files.length === 0 ? [] : [plain]),
            ...caseTestCommands(context).filter(
                ({ results }) => run_junit && results === 'junit'
            ),
        ]
    }
    return caseTestCommands(context).flatMap((command) => {
        if (command.results === 'junit') return run_junit ? [command] : []
        return bun_files.length === 0
            ? []
            : [
                  {
                      ...command,
                      run: onlyTestFiles({
                          command: command.run,
                          files: bun_files,
                      }),
                  },
              ]
    })
}

/**
 * Checks a test-writer's `already_done` evidence (#495) in the ticket's
 * worktree, then journals the check (`already_done_checked`): where git
 * finds each named commit, next to the commit the worktree started from,
 * and a run of just the named test files that exist, are test files, and
 * are as they are on the base, after the prepare command if the config has
 * one (see `namedFileCommands`). What the check means is `checkAlreadyDone`'s; replay
 * makes a failed one a failed try for the test-writer.
 */
export const checkAlreadyDoneIn = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'check_already_done' }>
}) => {
    const { path } = ticketWorktree({
        state: context.state,
        ticket: action.ticket,
    })
    const commits = []
    for (const { sha } of uniqBy(action.done_by, 'sha')) {
        const place = await context.git.commitOnBase({
            cwd: path,
            sha,
            base: action.base_sha,
        })
        commits.push({ sha, place })
    }
    const files = uniq(
        action.criteria.flatMap(({ tests }) => tests.map(({ file }) => file))
    )
    const missing = files.filter((file) => !existsSync(join(path, file)))
    const test_files = await testFilesIn({ context, cwd: path })
    const changed = (
        await ticketChanges({
            context,
            cwd: path,
            leave_out: await leaveOutIn({
                context,
                cwd: path,
                ticket: action.ticket,
            }),
        })
    ).map((change) => change.path)
    const runnable = files.filter(
        (file) =>
            !missing.includes(file) &&
            test_files.includes(file) &&
            !changed.includes(file)
    )
    const prepare =
        runnable.length === 0
            ? null
            : await watchPrepare({
                  context,
                  cwd: path,
                  ticket: action.ticket,
                  run: () =>
                      prepareCheck({ config: context.config, cwd: path }),
              })
    const run =
        runnable.length === 0 || (prepare !== null && !prepare.ok)
            ? null
            : await runCaseTests({
                  cwd: path,
                  commands: namedFileCommands({ context, runnable }),
                  test_files: runnable,
                  timeout_ms: testTimeoutOf({ config: context.config }),
                  test_concurrency: context.config.test_concurrency,
                  bun_files_only: hasJunitCommand({ config: context.config }),
                  report_file: await reportFile({
                      context,
                      ticket: action.ticket,
                      label: 'already-done',
                  }),
              })
    const { ok, problems } = checkAlreadyDone({
        base_sha: action.base_sha,
        criteria_ids: action.criteria_ids,
        criteria: action.criteria,
        commits,
        missing,
        test_files,
        changed,
        prepare,
        run,
    })
    context.journal.append({
        kind: 'already_done_checked',
        ticket: action.ticket,
        role: null,
        content: { ok, problems, base_sha: action.base_sha, tests: run },
    })
}
