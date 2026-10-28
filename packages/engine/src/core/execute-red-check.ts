/**
 * The `run_red_check` step: the test-writer's tests run in the ticket's
 * worktree, checked against its baseline, its test map, and the feature
 * map, and journaled as `red_check`.
 */
import { join } from 'node:path'

import uniq from 'lodash/uniq'

import {
    need,
    reportFile,
    testFilesIn,
    ticketWorktree,
    type BuildContext,
} from './build-context'
import type { BuildAction } from './decide-build'
import { leaveOutIn, ticketChanges, watchPrepare } from './worktree-changes'

import {
    caseTestCommands,
    featureMapPath,
    hasJunitCommand,
    hasSlowTests,
    ownSlowCommands,
    testTimeoutOf,
} from '../config/engine-config'
import { runCaseTests } from '../gates/case-test-runner'
import { readFeatureMap } from '../gates/feature-map'
import { prepareCheck } from '../gates/gate-runner'
import { endedText } from '../gates/gate-schemas'
import { ownSlowRuns, slowRedRuns } from '../gates/own-slow-check'
import { checkRed, type ChangedTestSource } from '../gates/red-check'
import {
    fileTestsCommand,
    isBunTestFile,
    runTests,
    testFilesAmong,
    withOwnRun,
} from '../gates/test-runner'
import { pathText } from '../git/path-text'

/**
 * The red check's problem when the test-writer changed no file (what
 * prepare made aside): the red commit would have nothing to commit.
 */
export const NO_RED_CHANGES =
    'No file changed, so the red commit would be empty: write the tests for the criteria in the worktree (new or changed test files).'

/**
 * The repo's feature map as the red check needs it (#583), read from the
 * worktree at `cwd`: its configured path (a file or a folder of pages,
 * #597), and the test files it lists. `files` is `null` when the map is
 * missing or can't be read, so the red check can name it rather than crash.
 * `null` when the config names no map.
 */
const featureMapIn = async ({
    context,
    cwd,
}: {
    context: BuildContext
    cwd: string
}): Promise<{ path: string; files: string[] | null } | null> => {
    const path = featureMapPath({ config: context.config })
    if (path === null) return null
    return {
        path,
        files: await readFeatureMap({
            cwd,
            path,
            test_file_patterns: context.config.test_file_patterns,
        }),
    }
}

export const runRedCheck = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'run_red_check' }>
}) => {
    const { path, base_sha } = ticketWorktree({
        state: context.state,
        ticket: action.ticket,
    })
    const baseline = need({
        value: context.state.tickets[action.ticket]?.baseline,
        what: `baseline test run for #${action.ticket}`,
    })
    const test_files = await testFilesIn({ context, cwd: path })
    // Before prepare runs, so what it makes now can't count as a change.
    const leave_out = await leaveOutIn({
        context,
        cwd: path,
        ticket: action.ticket,
    })
    const changed = await ticketChanges({ context, cwd: path, leave_out })
    // Every test file that differs from the ticket's base, not only from
    // HEAD: after a bad-test bounce, HEAD may still hold an old red commit,
    // whose test files the fresh test-writer may not touch (#581).
    const base_changed = testFilesAmong({
        files: (
            await context.git.changedSince({ cwd: path, from: base_sha })
        ).filter((file) => !leave_out.includes(file)),
        test_file_patterns: context.config.test_file_patterns,
    })
    const prepare = await watchPrepare({
        context,
        cwd: path,
        ticket: action.ticket,
        run: () => prepareCheck({ config: context.config, cwd: path }),
    })
    const files = uniq(
        action.mapping.flatMap(({ tests }) => tests.map(({ file }) => file))
    )
    // A lone rerun (#544) runs each test command alone.
    const exclusive = action.exclusive === true
    // With a junit command (#668), only files bun can run lack bun results.
    const bun_files_only = hasJunitCommand({ config: context.config })
    const fast = await runCaseTests({
        cwd: path,
        commands: caseTestCommands(context),
        test_files,
        timeout_ms: testTimeoutOf({ config: context.config }),
        test_concurrency: context.config.test_concurrency,
        exclusive,
        bun_files_only,
        report_file: await reportFile({
            context,
            ticket: action.ticket,
            label: 'red',
        }),
    })
    // The ticket's changed test files a slow command with `run_files` owns
    // (#683) run through it, once per command, if they hold a mapped test;
    // its exit code judges them (see `checkRed`).
    const slow_runs = ownSlowRuns({
        commands: ownSlowCommands({ config: context.config }),
        own_test_files: base_changed.filter((file) =>
            test_files.includes(file)
        ),
    })
    const slow_files = new Set(slow_runs.flatMap((run) => run.files))
    // With a slow command, the fast tests leave out every slow test file
    // (#564): the files the test map names or the ticket changed, that the
    // fast run gave no results for, run on their own, with plain `bun test`.
    // A run that gives no results at all leaves the fast run as it is (see
    // `withOwnRun`): its files don't load, as the fast run said already.
    const own = hasSlowTests({ config: context.config })
        ? uniq([
              ...files,
              ...testFilesAmong({
                  files: changed.map((change) => change.path),
                  test_file_patterns: context.config.test_file_patterns,
              }),
          ]).filter(
              (file) =>
                  !slow_files.has(file) &&
                  fast.files_without_results.includes(file) &&
                  (!bun_files_only || isBunTestFile(file))
          )
        : []
    const current =
        own.length === 0
            ? fast
            : withOwnRun({
                  fast,
                  own: await runTests({
                      cwd: path,
                      command: fileTestsCommand({ files: own }),
                      test_files: own,
                      report_file: await reportFile({
                          context,
                          ticket: action.ticket,
                          label: 'red-own',
                      }),
                      timeout_ms: testTimeoutOf({ config: context.config }),
                      test_concurrency: context.config.test_concurrency,
                      exclusive,
                      bun_files_only,
                  }),
                  test_files,
              })
    // A `.swift` file with an old test is read too: when its tests don't
    // build yet, its text says which old tests are still there (#668).
    const sources: Record<string, string | null> = {}
    const old_swift = current.junit_missing
        ? baseline.cases
              .map(({ file }) => file)
              .filter((file) => file.endsWith('.swift'))
        : []
    for (const file of uniq([...files, ...old_swift])) {
        sources[file] = await pathText({ path: join(path, file) })
    }
    // Each of those test files as it was at the ticket's base and as it is
    // now, so the red check can find each new test (#581).
    const changed_test_sources: ChangedTestSource[] = []
    for (const file of base_changed) {
        changed_test_sources.push({
            file,
            base: await context.git.fileAt({
                cwd: path,
                sha: base_sha,
                path: file,
            }),
            current: await pathText({ path: join(path, file) }),
        })
    }
    const checked = checkRed({
        criteria_ids: action.criteria_ids,
        mapping: action.mapping,
        baseline,
        current,
        test_files,
        sources,
        changed_test_sources,
        feature_map: await featureMapIn({ context, cwd: path }),
        slow_runs: await slowRedRuns({
            runs: slow_runs,
            mapped_files: files,
            cwd: path,
            timeout_ms: testTimeoutOf({ config: context.config }),
            test_concurrency: context.config.test_concurrency,
            exclusive,
        }),
    })
    // A failed prepare after the test-writer's turn is one more problem,
    // for the test-writer's fix loop; so is a turn that changed no file,
    // which would leave the red commit nothing to commit (#494).
    const problems = [
        ...(prepare === null || prepare.ok
            ? []
            : [
                  `The prepare command \`${prepare.command}\` failed (${endedText(prepare)}):\n${prepare.output}`,
              ]),
        ...(changed.length > 0 ? [] : [NO_RED_CHANGES]),
    ]
    const result =
        problems.length === 0
            ? checked
            : {
                  ...checked,
                  ok: false,
                  problems: [...problems, ...checked.problems],
              }
    context.journal.append({
        kind: 'red_check',
        ticket: action.ticket,
        role: null,
        content: {
            ...result,
            tests: current,
            ...(exclusive ? { exclusive } : {}),
        },
    })
}
