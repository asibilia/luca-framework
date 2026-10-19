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
    bunTestCommands,
    hasSlowTests,
    testTimeoutOf,
} from '../config/engine-config'
import { checkAlreadyDone } from '../gates/already-done-check'
import { prepareCheck } from '../gates/gate-runner'
import {
    fileTestsCommand,
    onlyTestFiles,
    runBunTests,
} from '../gates/test-runner'

/**
 * Checks a test-writer's `already_done` evidence (#495) in the ticket's
 * worktree, then journals the check (`already_done_checked`): where git
 * finds each named commit, next to the commit the worktree started from,
 * and a run of just the named test files that exist, are test files, and
 * are as they are on the base, after the prepare command if the config has
 * one. With a slow command (#564), the named files, slow ones included, run
 * with plain `bun test`. What the check means is `checkAlreadyDone`'s; replay
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
            : await runBunTests({
                  cwd: path,
                  // With a slow command, the fast command would leave out
                  // the slow files named (#564): plain `bun test` runs all.
                  commands: hasSlowTests({ config: context.config })
                      ? [fileTestsCommand({ files: runnable })]
                      : bunTestCommands(context).map((command) =>
                            onlyTestFiles({ command, files: runnable })
                        ),
                  test_files: runnable,
                  timeout_ms: testTimeoutOf({ config: context.config }),
                  test_concurrency: context.config.test_concurrency,
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
