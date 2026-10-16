import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
} from 'bun:test'

import { AgentSessionSchema } from '../agents/agent-launcher'
import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { ticketIssue } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    git,
    happyTurns,
    SUM,
    SUM_TEST,
} from '../testing/practice-repo'

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
 */

type Practice = Awaited<ReturnType<typeof createPracticeRepo>>
type Ran = Awaited<ReturnType<Practice['run']>>

const kinds = (records: JournalRecord[]) => records.map(({ kind }) => kind)

const failures = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'agent_failed' ? [record.content] : []
    )

const commits = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'commit_made'
            ? [{ stage: record.content.stage, files: record.content.files }]
            : []
    )

const created = (records: JournalRecord[]) => {
    const found = records.find(
        (record) => record.kind === 'ticket_worktree_created'
    )
    if (found?.kind !== 'ticket_worktree_created') throw new Error('none')
    return found.content
}

/** The ticket's worktree, where the scripted agents worked. */
const worktree = (records: JournalRecord[]): string => created(records).path

/**
 * The ticket's branch. A run that opens its PR removes the worktree, so its
 * files are read from the branch, which stays.
 */
const ticketBranch = (records: JournalRecord[]): string =>
    created(records).branch

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

const CLEAN_COMMITS: { stage: 'red' | 'green'; files: string[] }[] = [
    { stage: 'red', files: ['src/sum.test.ts'] },
    { stage: 'green', files: ['src/index.ts', 'src/sum.ts'] },
]

/** The ticket's launches, without the final review's lenses (spec #10's). */
const ticketLaunches = <Call extends { ticket: number }>(calls: Call[]) =>
    calls.filter(({ ticket }) => ticket === 11)

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

/**
 * Builds one practice run with these turns before the describe's tests, and
 * removes its folder after them. The tests only read what it left.
 */
const shareRun = (turns: (repo: string) => ScriptedTurn[]) => {
    const shared: { root: string; practice?: Practice; ran?: Ran } = {
        root: '',
    }
    beforeAll(async () => {
        shared.root = await mkdtemp(join(tmpdir(), 'luca-engine-guards-'))
        shared.practice = await createPracticeRepo({ root: shared.root })
        shared.ran = await shared.practice.run({
            turns: turns(shared.practice.repo),
        })
    }, 120_000)
    afterAll(async () => {
        await rm(shared.root, { recursive: true, force: true })
    })
    return (): Ran & { repo: string } => {
        if (shared.practice === undefined || shared.ran === undefined) {
            throw new Error('The shared run was not built.')
        }
        return { ...shared.ran, repo: shared.practice.repo }
    }
}

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

describe('runs of their own', () => {
    let root = ''
    let practice: Practice

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-guards-'))
        practice = await createPracticeRepo({ root })
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test("a refactor ticket's implementer may follow a rename into a test file", async () => {
        await Bun.write(
            join(practice.repo, 'src/sum.ts'),
            'export const total = ({ numbers }: { numbers: number[] }): number =>\n    numbers.reduce((sum, each) => sum + each, 0)\n'
        )
        await Bun.write(
            join(practice.repo, 'src/sum.test.ts'),
            SUM_TEST.replaceAll('sum(', 'total(').replace(
                "import { sum } from './sum'",
                "import { total } from './sum'"
            )
        )
        await Bun.write(
            join(practice.repo, 'src/index.ts'),
            "export { total } from './sum'\n"
        )
        await git(practice.repo, 'add', '-A')
        await git(practice.repo, 'commit', '-q', '-m', 'total')
        await git(practice.repo, 'push', '-q', 'origin', 'main')
        const { implementer, reviewer } = happyTurns()

        const { action, records, launches } = await practice.run({
            ticket: ticketIssue({
                number: 11,
                title: 'Rename total to sum',
                labels: ['ready-for-agent', 'refactor'],
                criteria: ['total is called sum'],
            }),
            turns: [
                {
                    ...implementer,
                    files: {
                        ...implementer.files,
                        'src/sum.test.ts': SUM_TEST,
                    },
                },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(launches[0]).toMatchObject({
            role: 'implementer',
            may_edit_tests: true,
        })
        expect(failures(records)).toEqual([])
        expect(commits(records)).toEqual([
            {
                stage: 'green',
                files: ['src/index.ts', 'src/sum.test.ts', 'src/sum.ts'],
            },
        ])
    }, 60_000)

    test('an engine failure starts a fresh agent without using up a try, and the ticket still completes', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const session = AgentSessionSchema.parse({
            session_id: 'session-1',
            model: 'claude-opus-5-5',
            api_key_source: 'none',
        })
        const { action, records, launches } = await practice.run({
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    failure: 'engine',
                    error: 'The Claude Code process exited with code 1.',
                    session,
                },
                testWriter,
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([
            {
                role: 'test-writer',
                failure: 'engine',
                error: 'The Claude Code process exited with code 1.',
                session_id: 'scripted-test-writer-11-1',
            },
        ])
        expect(
            launches.map(({ kind, role }) => `${kind}:${role}`).slice(0, 2)
        ).toEqual(['launch:test-writer', 'launch:test-writer'])
        expect(kinds(records).slice(9, 14)).toEqual([
            'agent_started',
            'agent_session',
            'agent_failed',
            'agent_started',
            'agent_finished',
        ])
        const sessions = records.flatMap((record) =>
            record.kind === 'agent_session' ? [record.content] : []
        )
        expect(sessions).toEqual([{ role: 'test-writer', session }])
    }, 60_000)

    test('a stop journals run_stopped and ends the run with an error', async () => {
        const { implementer, reviewer } = happyTurns()
        const reason = 'rate_limit_event status=rejected (five_hour)'

        await expect(
            practice.run({
                turns: [
                    {
                        role: 'test-writer',
                        ticket: 11,
                        failure: 'stop',
                        error: reason,
                    },
                    implementer,
                    reviewer,
                ],
            })
        ).rejects.toThrow(`Run stopped: ${reason}`)

        const records = practice.journal.read()
        expect(records.at(-1)).toMatchObject({
            kind: 'run_stopped',
            ticket: 11,
            content: { reason, role: 'test-writer' },
        })
        expect(failures(records)).toEqual([])
    }, 60_000)
})
