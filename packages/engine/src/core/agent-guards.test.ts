import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { AgentSessionSchema } from '../agents/agent-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { ticketIssue } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    git,
    happyTurns,
    latestStuck,
    SUM,
    SUM_TEST,
} from '../testing/practice-repo'

/**
 * Seam 2, the guards: one practice ticket, end to end, with scripted agents
 * that break their role's rules. The after-turn check, the failed tries, the
 * engine retries, and the stop are all the engine's own, so they hold for
 * every launcher.
 */

let root = ''
let practice: Awaited<ReturnType<typeof createPracticeRepo>>

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-guards-'))
    practice = await createPracticeRepo({ root })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

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
const branchFiles = async (records: JournalRecord[]): Promise<string[]> =>
    (
        await git(
            practice.repo,
            'ls-tree',
            '-r',
            '--name-only',
            ticketBranch(records)
        )
    )
        .split('\n')
        .filter(Boolean)

const CLEAN_COMMITS: { stage: 'red' | 'green'; files: string[] }[] = [
    { stage: 'red', files: ['src/sum.test.ts'] },
    { stage: 'green', files: ['src/index.ts', 'src/sum.ts'] },
]

/** The ticket's launches, without the final review's lenses (spec #10's). */
const ticketLaunches = <Call extends { ticket: number }>(calls: Call[]) =>
    calls.filter(({ ticket }) => ticket === 11)

describe('the after-turn check', () => {
    test('a test-writer that writes a non-test file fails a try, the file is removed, and its follow-up carries on', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records, launches } = await practice.run({
            turns: [
                {
                    ...testWriter,
                    files: { ...testWriter.files, 'src/sum.ts': SUM },
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
                failure: 'guard',
                error: expect.stringContaining('wrote src/sum.ts'),
                session_id: 'scripted-test-writer-11-1',
            },
        ])
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
    }, 60_000)

    test('an implementer that edits a test file fails a try, the file is restored, and its follow-up carries on', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records, launches } = await practice.run({
            turns: [
                testWriter,
                {
                    ...implementer,
                    files: {
                        ...implementer.files,
                        'src/sum.test.ts': 'export {}\n',
                    },
                },
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([
            {
                role: 'implementer',
                failure: 'guard',
                error: expect.stringContaining('wrote src/sum.test.ts'),
                session_id: 'scripted-implementer-11-2',
            },
        ])
        expect(
            ticketLaunches(launches).map(({ kind, role }) => `${kind}:${role}`)
        ).toEqual([
            'launch:test-writer',
            'launch:implementer',
            'follow_up:implementer',
            'launch:ticket-reviewer',
        ])
        expect(
            await git(
                practice.repo,
                'show',
                `${ticketBranch(records)}:src/sum.test.ts`
            )
        ).toBe(SUM_TEST)
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    }, 60_000)

    test('a reviewer that writes any file fails a try and a fresh reviewer is launched', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records, launches } = await practice.run({
            turns: [
                testWriter,
                implementer,
                { ...reviewer, files: { 'NOTES.md': '# Looks fine\n' } },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([
            {
                role: 'ticket-reviewer',
                failure: 'guard',
                error: expect.stringContaining('wrote NOTES.md'),
                session_id: 'scripted-ticket-reviewer-11-3',
            },
        ])
        expect(
            ticketLaunches(launches).map(({ kind, role }) => `${kind}:${role}`)
        ).toEqual([
            'launch:test-writer',
            'launch:implementer',
            'launch:ticket-reviewer',
            'launch:ticket-reviewer',
        ])
        expect(await branchFiles(records)).not.toContain('NOTES.md')
    }, 60_000)

    test('an agent that commits fails a try and its commit is undone', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                {
                    ...testWriter,
                    act: async (cwd) => {
                        await git(cwd, 'add', '-A')
                        await git(cwd, 'commit', '-q', '-m', 'sneaky')
                    },
                },
                testWriter,
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [failed] = failures(records)
        expect(failed).toMatchObject({ role: 'test-writer', failure: 'guard' })
        expect(failed?.error).toContain('HEAD moved')
        expect(
            (
                await git(
                    practice.repo,
                    'log',
                    '--format=%s',
                    ticketBranch(records)
                )
            ).trim()
        ).not.toContain('sneaky')
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    }, 60_000)

    test('an agent that makes a branch at HEAD fails a try', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                {
                    ...testWriter,
                    act: async (cwd) => {
                        await git(cwd, 'branch', 'sneaky')
                    },
                },
                testWriter,
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [failed] = failures(records)
        expect(failed).toMatchObject({ role: 'test-writer', failure: 'guard' })
        expect(failed?.error).toContain('new refs at HEAD: refs/heads/sneaky')
    }, 60_000)

    test("another ticket's branch landing on HEAD during a turn is the engine's, not the agent's", async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                {
                    ...testWriter,
                    // What the engine does when #12 starts from the run
                    // branch while #11's test-writer works on the same commit.
                    act: async (cwd) => {
                        const branch = (
                            await git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
                        ).trim()
                        const runBranch = branch.replace(/--ticket-11$/, '')
                        await git(cwd, 'branch', `${runBranch}--ticket-12`)
                    },
                },
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([])
    }, 60_000)

    test('an agent that stages a file fails a try and the index is emptied', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                {
                    ...testWriter,
                    act: async (cwd) => {
                        await git(cwd, 'add', 'src/sum.test.ts')
                    },
                },
                testWriter,
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [failed] = failures(records)
        expect(failed).toMatchObject({ role: 'test-writer', failure: 'guard' })
        expect(failed?.error).toContain('staged files: src/sum.test.ts')
    }, 60_000)

    test('a test-writer that breaks its rules on every try is stuck after the last one', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const sneaky = {
            ...testWriter,
            files: { ...testWriter.files, 'src/sum.ts': SUM },
        }
        const { action, records } = await practice.run({
            turns: [sneaky, sneaky, sneaky, implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(latestStuck(records)).toMatchObject({
            ticket: 11,
            reason: 'agent_failed',
            detail: expect.stringContaining('The test-writer failed 3 tries'),
        })
        expect(
            failures(records).map(({ role, failure }) => `${role}:${failure}`)
        ).toEqual([
            'test-writer:guard',
            'test-writer:guard',
            'test-writer:guard',
        ])
        expect(existsSync(join(worktree(records), 'src/sum.ts'))).toBe(false)
    }, 60_000)

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
})

describe('the after-turn check: what git ignores and git state', () => {
    test('an implementer that installs under node_modules fails a try, and the new files are removed', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
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
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([
            {
                role: 'implementer',
                failure: 'guard',
                error: expect.stringContaining(
                    'wrote node_modules/left-pad/index.js'
                ),
                session_id: 'scripted-implementer-11-2',
            },
        ])
        expect(
            existsSync(join(worktree(records), 'node_modules/left-pad'))
        ).toBe(false)
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    }, 60_000)

    test('an agent that makes a branch and a tag at HEAD fails a try, and both are taken off', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                {
                    ...testWriter,
                    act: async (cwd) => {
                        await git(cwd, 'branch', 'sneaky')
                        await git(cwd, 'tag', '-a', 'v9', '-m', 'sneaky')
                    },
                },
                testWriter,
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [failed] = failures(records)
        expect(failed).toMatchObject({ role: 'test-writer', failure: 'guard' })
        expect(failed?.error).toContain('refs/heads/sneaky')
        expect(failed?.error).toContain('refs/tags/v9')
        const refs = await git(
            practice.repo,
            'for-each-ref',
            '--format=%(refname)'
        )
        expect(refs).not.toContain('refs/heads/sneaky')
        expect(refs).not.toContain('refs/tags/v9')
        // Kept aside, never lost: the engine can't tell who made a ref.
        expect(refs).toContain('refs/luca-undone/heads/sneaky')
    }, 60_000)

    test('an agent that stashes its work fails a try, and the stash entry is dropped', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                {
                    ...testWriter,
                    act: async (cwd) => {
                        await git(cwd, 'stash', 'push', '-u', '-q')
                    },
                },
                testWriter,
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [failed] = failures(records)
        expect(failed).toMatchObject({ role: 'test-writer', failure: 'guard' })
        expect(failed?.error).toContain('new stash entries')
        expect((await git(practice.repo, 'stash', 'list')).trim()).toBe('')
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    }, 60_000)

    test("another process's change to the shared .git during a turn is not the agent's, and stays", async () => {
        const hook = join(practice.repo, '.git/hooks/pre-push')
        const exclude = join(practice.repo, '.git/info/exclude')
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                testWriter,
                {
                    ...implementer,
                    // Other agents in the same repo: a `git push -u` writes
                    // its branch's config, and tools add hooks and excludes.
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
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([])
        expect(commits(records)).toEqual(CLEAN_COMMITS)
        // Nothing was rolled back.
        expect(
            (
                await git(
                    practice.repo,
                    'config',
                    '--get',
                    'branch.someone-else.remote'
                )
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
    }, 60_000)

    test("an agent that changes its own branch's settings in the shared config fails a try, and only that is undone", async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                testWriter,
                {
                    ...implementer,
                    act: async (cwd) => {
                        const branch = (
                            await git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
                        ).trim()
                        await git(
                            cwd,
                            'config',
                            `branch.${branch}.sneaky`,
                            'yes'
                        )
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
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const branch = ticketBranch(records)
        expect(failures(records)).toEqual([
            {
                role: 'implementer',
                failure: 'guard',
                error: expect.stringContaining(
                    `the shared .git/config changed this ticket's branch settings: branch.${branch}.sneaky`
                ),
                session_id: 'scripted-implementer-11-2',
            },
        ])
        const sneaky = await Bun.$`git config --get branch.${branch}.sneaky`
            .cwd(practice.repo)
            .nothrow()
            .quiet()
        expect(sneaky.exitCode).not.toBe(0)
        expect(
            (
                await git(
                    practice.repo,
                    'config',
                    '--get',
                    'branch.someone-else.remote'
                )
            ).trim()
        ).toBe('origin')
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    }, 60_000)

    test('an excludes entry cannot hide a file its role may not write', async () => {
        const commonDir = async (cwd: string) =>
            (
                await git(
                    cwd,
                    'rev-parse',
                    '--path-format=absolute',
                    '--git-common-dir'
                )
            ).trim()
        let leftInPlace = ''
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                {
                    ...testWriter,
                    files: { ...testWriter.files, 'src/sum.ts': SUM },
                    // Another process hides the file mid-turn.
                    act: async (cwd) => {
                        const exclude = join(
                            await commonDir(cwd),
                            'info/exclude'
                        )
                        await Bun.write(
                            exclude,
                            `${await Bun.file(exclude).text()}src/sum.ts\n`
                        )
                    },
                },
                {
                    ...testWriter,
                    // The engine left the outside entry; the other process
                    // takes it out again, or the implementer's src/sum.ts
                    // would be hidden from its commit.
                    act: async (cwd) => {
                        const exclude = join(
                            await commonDir(cwd),
                            'info/exclude'
                        )
                        leftInPlace = await Bun.file(exclude).text()
                        await Bun.write(
                            exclude,
                            leftInPlace.replace('src/sum.ts\n', '')
                        )
                    },
                },
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(leftInPlace).toContain('src/sum.ts\n')
        expect(failures(records)).toEqual([
            {
                role: 'test-writer',
                failure: 'guard',
                error: expect.stringContaining('wrote src/sum.ts'),
                session_id: 'scripted-test-writer-11-1',
            },
        ])
        expect(commits(records)).toEqual(CLEAN_COMMITS)
    }, 60_000)
})

describe('judging a result', () => {
    test('a success with no structured output fails one try, and the follow-up carries on', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records, launches } = await practice.run({
            turns: [
                testWriter,
                { role: 'implementer', ticket: 11, files: implementer.files },
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([
            {
                role: 'implementer',
                failure: 'result',
                error: 'The implementer finished with no structured output.',
                session_id: 'scripted-implementer-11-2',
            },
        ])
        expect(launches[2]?.prompt).toContain(
            "Your last turn ended without a result that fits your role's schema."
        )
    }, 60_000)

    test('a result that misfits its schema fails the try as a bad result', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [
                testWriter,
                { ...implementer, result: { outcome: 'finished' } },
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([
            {
                role: 'implementer',
                failure: 'result',
                error: expect.stringContaining('does not fit its schema'),
                session_id: 'scripted-implementer-11-2',
            },
        ])
    }, 60_000)
})

describe('engine failures and stops', () => {
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

    test('three engine failures in a row make the ticket stuck', async () => {
        const { implementer, reviewer } = happyTurns()
        const crash = {
            role: 'test-writer' as const,
            ticket: 11,
            failure: 'engine' as const,
            error: 'The stream ended with no result.',
        }
        const { action, records } = await practice.run({
            turns: [crash, crash, crash, implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(latestStuck(records)).toMatchObject({
            reason: 'agent_failed',
            detail: 'The engine failed to run the test-writer 3 times in a row: The stream ended with no result.',
        })
        expect(failures(records).map(({ failure }) => failure)).toEqual([
            'engine',
            'engine',
            'engine',
        ])
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
