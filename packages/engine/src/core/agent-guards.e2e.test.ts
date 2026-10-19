import { describe, expect, test } from 'bun:test'

import {
    failures,
    commits,
    ticketBranch,
    CLEAN_COMMITS,
    shareRun,
} from './agent-guards-helpers'

import type { JournalRecord } from '../journal/journal-record'
import { git, happyTurns, SUM, SUM_TEST } from '../testing/practice-repo'

/**
 * Seam 2, the guards: one practice ticket, end to end, with scripted agents
 * that break their role's rules. The after-turn check, the failed tries, the
 * engine retries, and the stop are all the engine's own, so they hold for
 * every launcher.
 *
 * Each role has three tries, so one run can hold two broken turns per role
 * and still open its PR. The rule breaks share three runs (#566), built once
 * each; their tests only read what the run left. The caps themselves (a
 * third failed try, a third engine failure in a row) are decisions, checked
 * in `decide-build.test.ts`.
 *
 * This file holds the run where every role breaks a rule, then carries on.
 * The helpers are in `agent-guards-helpers.ts`; the other topics are in the
 * `agent-guards-*.e2e.test.ts` files beside this one.
 */

/** The paths on the ticket's branch. */
const branchFiles = async ({
    repo,
    records,
}: {
    repo: string
    records: JournalRecord[]
}): Promise<string[]> =>
    (await git(repo, 'ls-tree', '-r', '--name-only', ticketBranch(records)))
        .split('\n')
        .filter(Boolean)

/** The ticket's launches, without the final review's lenses (spec #10's). */
const ticketLaunches = <Call extends { ticket: number }>(calls: Call[]) =>
    calls.filter(({ ticket }) => ticket === 11)

describe('the after-turn check: every role breaks a rule, then carries on, on one run', () => {
    // The test-writer writes a non-test file, then stashes its work, then
    // works while the engine starts #12's branch on its commit. The
    // implementer edits a test file, then changes its own branch's settings
    // in the shared config (while another process pushes). The reviewer
    // writes a file; a fresh one approves.
    const run = shareRun(() => {
        const { testWriter, implementer, reviewer } = happyTurns()
        return [
            {
                ...testWriter,
                files: { ...testWriter.files, 'src/sum.ts': SUM },
            },
            {
                ...testWriter,
                act: async (cwd) => {
                    await git(cwd, 'stash', 'push', '-u', '-q')
                },
            },
            {
                ...testWriter,
                // What the engine does when #12 starts from the run branch
                // while #11's test-writer works on the same commit.
                act: async (cwd) => {
                    const branch = (
                        await git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
                    ).trim()
                    const runBranch = branch.replace(/--ticket-11$/, '')
                    await git(cwd, 'branch', `${runBranch}--ticket-12`)
                },
            },
            {
                ...implementer,
                files: {
                    ...implementer.files,
                    'src/sum.test.ts': 'export {}\n',
                },
            },
            {
                ...implementer,
                act: async (cwd) => {
                    const branch = (
                        await git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
                    ).trim()
                    await git(cwd, 'config', `branch.${branch}.sneaky`, 'yes')
                    // And, at the same time, another process's push -u.
                    await git(
                        cwd,
                        'config',
                        'branch.someone-else.remote',
                        'origin'
                    )
                },
            },
            implementer,
            { ...reviewer, files: { 'NOTES.md': '# Looks fine\n' } },
            reviewer,
        ]
    })

    test('a test-writer that writes a non-test file fails a try, the file is removed, and its follow-up carries on', () => {
        const { action, records, launches } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)[0]).toEqual({
            role: 'test-writer',
            failure: 'guard',
            error: expect.stringContaining('wrote src/sum.ts'),
            session_id: 'scripted-test-writer-11-1',
        })
        // The retry went to the same session, with what failed.
        const [, retry] = launches
        expect(retry).toMatchObject({
            kind: 'follow_up',
            role: 'test-writer',
            session_id: 'scripted-test-writer-11-1',
        })
        expect(retry?.prompt).toContain(
            'Your last turn changed things your role may not change.'
        )
        expect(retry?.prompt).toContain('wrote src/sum.ts')
        // The red commit holds only the test: the stray file was removed.
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    })

    test('an agent that stashes its work fails a try, and the stash entry is dropped', async () => {
        const { action, records, repo } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const failed = failures(records)[1]
        expect(failed).toMatchObject({
            role: 'test-writer',
            failure: 'guard',
            session_id: 'scripted-test-writer-11-1',
        })
        expect(failed?.error).toContain('new stash entries')
        expect((await git(repo, 'stash', 'list')).trim()).toBe('')
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    })

    test("another ticket's branch landing on HEAD during a turn is the engine's, not the agent's", () => {
        const { action, records } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        // Only the five turns that broke a rule failed: the test-writer's
        // last try, with #12's branch landing on its HEAD, did not.
        expect(
            failures(records).map(({ role, failure }) => `${role}:${failure}`)
        ).toEqual([
            'test-writer:guard',
            'test-writer:guard',
            'implementer:guard',
            'implementer:guard',
            'ticket-reviewer:guard',
        ])
    })

    test('an implementer that edits a test file fails a try, the file is restored, and its follow-up carries on', async () => {
        const { action, records, launches, repo } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)[2]).toEqual({
            role: 'implementer',
            failure: 'guard',
            error: expect.stringContaining('wrote src/sum.test.ts'),
            session_id: 'scripted-implementer-11-4',
        })
        expect(
            ticketLaunches(launches).map(({ kind, role }) => `${kind}:${role}`)
        ).toEqual([
            'launch:test-writer',
            'follow_up:test-writer',
            'follow_up:test-writer',
            'launch:implementer',
            'follow_up:implementer',
            'follow_up:implementer',
            'launch:ticket-reviewer',
            'launch:ticket-reviewer',
        ])
        expect(
            await git(repo, 'show', `${ticketBranch(records)}:src/sum.test.ts`)
        ).toBe(SUM_TEST)
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    })

    test("an agent that changes its own branch's settings in the shared config fails a try, and only that is undone", async () => {
        const { action, records, repo } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const branch = ticketBranch(records)
        expect(failures(records)[3]).toEqual({
            role: 'implementer',
            failure: 'guard',
            error: expect.stringContaining(
                `the shared .git/config changed this ticket's branch settings: branch.${branch}.sneaky`
            ),
            session_id: 'scripted-implementer-11-4',
        })
        const sneaky = await Bun.$`git config --get branch.${branch}.sneaky`
            .cwd(repo)
            .nothrow()
            .quiet()
        expect(sneaky.exitCode).not.toBe(0)
        expect(
            (
                await git(repo, 'config', '--get', 'branch.someone-else.remote')
            ).trim()
        ).toBe('origin')
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    })

    test('a reviewer that writes any file fails a try and a fresh reviewer is launched', async () => {
        const { action, records, launches, repo } = run()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)[4]).toEqual({
            role: 'ticket-reviewer',
            failure: 'guard',
            error: expect.stringContaining('wrote NOTES.md'),
            session_id: 'scripted-ticket-reviewer-11-7',
        })
        expect(
            ticketLaunches(launches)
                .slice(-2)
                .map(({ kind, role }) => `${kind}:${role}`)
        ).toEqual(['launch:ticket-reviewer', 'launch:ticket-reviewer'])
        expect(await branchFiles({ repo, records })).not.toContain('NOTES.md')
    })
})
