import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    failures,
    commits,
    created,
    ticketBranch,
    CLEAN_COMMITS,
    shareRun,
} from './agent-guards-helpers'

import type { JournalRecord } from '../journal/journal-record'
import { git, happyTurns } from '../testing/practice-repo'

/**
 * Seam 2, the guards: one practice ticket, end to end, with scripted agents
 * that break their role's rules. The after-turn check, the failed tries, the
 * engine retries, and the stop are all the engine's own, so they hold for
 * every launcher.
 *
 * This file holds the run that changes the git state under the agents. The
 * helpers are in `agent-guards-helpers.ts`; the other topics are in the
 * `agent-guards-*.e2e.test.ts` files beside this one.
 */

/** The ticket's worktree, where the scripted agents worked. */
const worktree = (records: JournalRecord[]): string => created(records).path

describe('the after-turn check: git state, on one run', () => {
    // The test-writer stages a file, then commits; its third try is clean.
    // The implementer installs under node_modules, then works while other
    // processes change the shared .git.
    const run = shareRun((repo) => {
        const hook = join(repo, '.git/hooks/pre-push')
        const exclude = join(repo, '.git/info/exclude')
        const { testWriter, implementer, reviewer } = happyTurns()
        return [
            {
                ...testWriter,
                act: async (cwd) => {
                    await git(cwd, 'add', 'src/sum.test.ts')
                },
            },
            {
                ...testWriter,
                act: async (cwd) => {
                    await git(cwd, 'add', '-A')
                    await git(cwd, 'commit', '-q', '-m', 'sneaky')
                },
            },
            testWriter,
            {
                ...implementer,
                act: async (cwd) => {
                    await Bun.write(
                        join(cwd, 'node_modules/left-pad/index.js'),
                        'module.exports = () => 0\n'
                    )
                },
            },
            {
                ...implementer,
                // Other agents in the same repo: a `git push -u` writes its
                // branch's config, and tools add hooks and excludes.
                act: async (cwd) => {
                    await git(
                        cwd,
                        'config',
                        'branch.someone-else.remote',
                        'origin'
                    )
                    await Bun.write(hook, '#!/bin/sh\nexit 0\n')
                    await Bun.write(
                        exclude,
                        `${await Bun.file(exclude).text()}*.outside\n`
                    )
                },
            },
            reviewer,
        ]
    })

    test('an agent that stages a file fails a try and the index is emptied', () => {
        const { action, records } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const failed = failures(records)[0]
        expect(failed).toMatchObject({ role: 'test-writer', failure: 'guard' })
        expect(failed?.error).toContain('staged files: src/sum.test.ts')
    })

    test('an agent that commits fails a try and its commit is undone', async () => {
        const { action, records, repo } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const failed = failures(records)[1]
        expect(failed).toMatchObject({ role: 'test-writer', failure: 'guard' })
        expect(failed?.error).toContain('HEAD moved')
        expect(
            (
                await git(repo, 'log', '--format=%s', ticketBranch(records))
            ).trim()
        ).not.toContain('sneaky')
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    })

    test('an implementer that installs under node_modules fails a try, and the new files are removed', () => {
        const { action, records } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records).slice(2)).toEqual([
            {
                role: 'implementer',
                failure: 'guard',
                error: expect.stringContaining(
                    'wrote node_modules/left-pad/index.js'
                ),
                session_id: 'scripted-implementer-11-4',
            },
        ])
        expect(
            existsSync(join(worktree(records), 'node_modules/left-pad'))
        ).toBe(false)
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    })

    test("another process's change to the shared .git during a turn is not the agent's, and stays", async () => {
        const { action, records, repo } = run()
        const hook = join(repo, '.git/hooks/pre-push')
        const exclude = join(repo, '.git/info/exclude')

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        // The implementer's second try, with the outside changes, did not
        // fail: its one failure is the node_modules install.
        expect(
            failures(records).map(({ role, failure }) => `${role}:${failure}`)
        ).toEqual([
            'test-writer:guard',
            'test-writer:guard',
            'implementer:guard',
        ])
        expect(commits(records)).toEqual(CLEAN_COMMITS)
        // Nothing was rolled back.
        expect(
            (
                await git(repo, 'config', '--get', 'branch.someone-else.remote')
            ).trim()
        ).toBe('origin')
        expect(await Bun.file(hook).text()).toBe('#!/bin/sh\nexit 0\n')
        expect(await Bun.file(exclude).text()).toContain('*.outside\n')
        const changed = records.flatMap((record) =>
            record.kind === 'shared_git_changed' ? [record] : []
        )
        expect(changed).toMatchObject([
            {
                ticket: 11,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    changes: [
                        'the shared .git/config changed',
                        'the shared .git/info/exclude changed',
                        'the shared .git/hooks changed',
                    ],
                },
            },
        ])
    })
})
