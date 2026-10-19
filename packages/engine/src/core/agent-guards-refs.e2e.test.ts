import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    failures,
    commits,
    CLEAN_COMMITS,
    shareRun,
} from './agent-guards-helpers'

import { git, happyTurns, SUM } from '../testing/practice-repo'

/**
 * Seam 2, the guards: one practice ticket, end to end, with scripted agents
 * that break their role's rules. The after-turn check, the failed tries, the
 * engine retries, and the stop are all the engine's own, so they hold for
 * every launcher.
 *
 * This file holds the run with refs, excludes, and results to judge. The
 * helpers are in `agent-guards-helpers.ts`; the other topics are in the
 * `agent-guards-*.e2e.test.ts` files beside this one.
 */

/** The git dir every worktree of the practice repo shares. */
const commonDir = async (cwd: string) =>
    (
        await git(
            cwd,
            'rev-parse',
            '--path-format=absolute',
            '--git-common-dir'
        )
    ).trim()

describe('refs, excludes, and judging a result, on one run', () => {
    // The test-writer makes a branch and a tag at HEAD, then writes a
    // non-test file that another process hides with an excludes entry; on
    // its third try the other process takes the entry out again. The
    // implementer finishes with no structured output, then with a result
    // that misfits its schema, then cleanly.
    const shared = { leftInPlace: '' }
    const run = shareRun(() => {
        const { testWriter, implementer, reviewer } = happyTurns()
        return [
            {
                ...testWriter,
                act: async (cwd) => {
                    await git(cwd, 'branch', 'sneaky')
                    await git(cwd, 'tag', '-a', 'v9', '-m', 'sneaky')
                },
            },
            {
                ...testWriter,
                files: { ...testWriter.files, 'src/sum.ts': SUM },
                // Another process hides the file mid-turn.
                act: async (cwd) => {
                    const exclude = join(await commonDir(cwd), 'info/exclude')
                    await Bun.write(
                        exclude,
                        `${await Bun.file(exclude).text()}src/sum.ts\n`
                    )
                },
            },
            {
                ...testWriter,
                // The engine left the outside entry; the other process takes
                // it out again, or the implementer's src/sum.ts would be
                // hidden from its commit.
                act: async (cwd) => {
                    const exclude = join(await commonDir(cwd), 'info/exclude')
                    shared.leftInPlace = await Bun.file(exclude).text()
                    await Bun.write(
                        exclude,
                        shared.leftInPlace.replace('src/sum.ts\n', '')
                    )
                },
            },
            { role: 'implementer', ticket: 11, files: implementer.files },
            { ...implementer, result: { outcome: 'finished' } },
            implementer,
            reviewer,
        ]
    })

    test('an agent that makes a branch and a tag at HEAD fails a try, and both are taken off', async () => {
        const { action, records, repo } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const failed = failures(records)[0]
        expect(failed).toMatchObject({ role: 'test-writer', failure: 'guard' })
        expect(failed?.error).toContain('new refs at HEAD: refs/heads/sneaky')
        expect(failed?.error).toContain('refs/tags/v9')
        const refs = await git(repo, 'for-each-ref', '--format=%(refname)')
        expect(refs).not.toContain('refs/heads/sneaky')
        expect(refs).not.toContain('refs/tags/v9')
        // Kept aside, never lost: the engine can't tell who made a ref.
        expect(refs).toContain('refs/luca-undone/heads/sneaky')
    })

    test('an excludes entry cannot hide a file its role may not write', () => {
        const { action, records } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(shared.leftInPlace).toContain('src/sum.ts\n')
        expect(failures(records)[1]).toEqual({
            role: 'test-writer',
            failure: 'guard',
            error: expect.stringContaining('wrote src/sum.ts'),
            session_id: 'scripted-test-writer-11-1',
        })
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    })

    test('a success with no structured output fails one try, and the follow-up carries on', () => {
        const { action, records, launches } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)[2]).toEqual({
            role: 'implementer',
            failure: 'result',
            error: 'The implementer finished with no structured output.',
            session_id: 'scripted-implementer-11-4',
        })
        expect(launches[4]).toMatchObject({
            kind: 'follow_up',
            role: 'implementer',
            session_id: 'scripted-implementer-11-4',
        })
        expect(launches[4]?.prompt).toContain(
            "Your last turn ended without a result that fits your role's schema."
        )
    })

    test('a result that misfits its schema fails the try as a bad result', () => {
        const { action, records } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records).slice(3)).toEqual([
            {
                role: 'implementer',
                failure: 'result',
                error: expect.stringContaining('does not fit its schema'),
                session_id: 'scripted-implementer-11-4',
            },
        ])
    })
})
