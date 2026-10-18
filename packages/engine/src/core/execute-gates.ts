/**
 * The gates in a worktree (`gatesIn`), the final review's slow tests
 * (`slowTestsIn`), and the frozen install in a new or moved worktree
 * (`installIn`), each journaled.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import difference from 'lodash/difference'

import { reportFile, testFilesIn, type BuildContext } from './build-context'
import { watchPrepare } from './worktree-changes'

import { hasSlowTests } from '../config/engine-config'
import { runGates, runSlowTests, shellCheck } from '../gates/gate-runner'
import {
    installCommand,
    MANIFEST,
    newWorktreeInstall,
} from '../gates/lockfile-install'
import { testFilesAmong } from '../gates/test-runner'
import type { Journal } from '../journal/journal'
import type { GateTarget } from '../journal/journal-record'
import type { ReplayedWorktree } from '../journal/replay'

/**
 * The config's gates in a worktree (with the install first when a manifest
 * changed since its base), journaled as `gates_run`.
 */
export const gatesIn = async ({
    context,
    worktree,
    target,
    ticket,
}: {
    context: BuildContext
    worktree: ReplayedWorktree
    target: GateTarget
    /** `null` for the final review. */
    ticket: number | null
}) => {
    const { path: cwd, base_sha } = worktree
    const changed = difference(
        await context.git.changedSince({ cwd, from: base_sha }),
        context.state.prepare_made
    )
    const test_files = await testFilesIn({ context, cwd })
    // The test files a ticket changed: its own gates hold their tests to the
    // fast test speed limit by measured time (#580), and, with a slow
    // command, also run the ones the fast tests leave out (#564). A join's
    // and the final review's gates do neither.
    const changed_test_files =
        target === 'ticket'
            ? testFilesAmong({
                  files: changed,
                  test_file_patterns: context.config.test_file_patterns,
              }).filter((file) => test_files.includes(file))
            : []
    const own_test_files = hasSlowTests({ config: context.config })
        ? changed_test_files
        : []
    const result = await runGates({
        cwd,
        config: context.config,
        install: installCommand({ changed_files: changed, target }),
        around_prepare: (run) => watchPrepare({ context, cwd, ticket, run }),
        test_files,
        report_file: await reportFile({
            context,
            ticket,
            label: `gates-${target}`,
        }),
        // The final review's gates also run the slow tests (#563); a ticket's
        // and a join's never do.
        with_slow_tests: ticket === null,
        own_test_files,
        measured_files: changed_test_files,
    })
    // A ticket's gates journal the cases of its red test files, with their
    // expect() counts, so a mapped test that checks nothing is found (#581).
    // Join and final gates leave them out, which keeps journals small.
    const red_files =
        target === 'ticket' && ticket !== null
            ? (context.state.tickets[ticket]?.red_tests ?? []).map(
                  ({ file }) => file
              )
            : []
    const cases = result.cases.filter(({ file }) => red_files.includes(file))
    context.journal.append({
        kind: 'gates_run',
        ticket,
        role: null,
        content: {
            target,
            ok: result.ok,
            checks: result.checks,
            ...(cases.length === 0 ? {} : { cases }),
        },
    })
}

/**
 * The final review's slow tests (#563) in the run branch's worktree, once
 * round 1's lenses are in: prepare (noting what it made), then each slow test
 * command, journaled as `gates_run` with `target: 'final_slow'` and no
 * ticket. They are not the fix round's gates.
 */
export const slowTestsIn = async ({
    context,
    worktree,
}: {
    context: BuildContext
    worktree: ReplayedWorktree
}) => {
    const { path: cwd } = worktree
    const result = await runSlowTests({
        cwd,
        config: context.config,
        around_prepare: (run) =>
            watchPrepare({ context, cwd, ticket: null, run }),
        test_files: await testFilesIn({ context, cwd }),
        report_file: await reportFile({
            context,
            ticket: null,
            label: 'final-slow',
        }),
    })
    context.journal.append({
        kind: 'gates_run',
        ticket: null,
        role: null,
        content: { target: 'final_slow', ...result },
    })
}

/**
 * The frozen install in a new (or moved) worktree, journaled as
 * `dependencies_installed`. A worktree with no `package.json` has nothing
 * to install (`check` is `null`).
 */
export const installIn = async ({
    journal,
    cwd,
    target,
    ticket,
}: {
    journal: Journal
    cwd: string
    target: GateTarget
    ticket: number | null
}) => {
    const command = newWorktreeInstall({
        has_manifest: existsSync(join(cwd, MANIFEST)),
    })
    journal.append({
        kind: 'dependencies_installed',
        ticket,
        role: null,
        content: {
            target,
            check:
                command === null
                    ? null
                    : await shellCheck({ name: 'install', command, cwd }),
        },
    })
}
