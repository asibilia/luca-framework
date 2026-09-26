import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { AgentLauncher } from '../agents/agent-launcher'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import { runSpec } from '../cli/run-modes'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    git,
    happyTurns,
    HAPPY_TURNS,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'
import { NEEDS_INFO_LABEL, READY_LABEL } from '../tracker/tracker'

/**
 * Seam 2 for #429: a new run fetches its base branch and starts the run
 * branch from `origin/<base>`, never from a stale local branch. A resumed
 * run keeps its run branch and doesn't fetch. A failed fetch stops the run
 * at intake with a plain message.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-run-from-origin-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/**
 * Commits a new file on `branch` in a second clone of `origin` and pushes
 * it, as someone else merging a PR would, so the practice repo's own copy of
 * `branch` (and its `origin/<branch>`) falls behind. Returns the new commit.
 */
const pushFromElsewhere = async ({
    origin,
    branch,
    file,
}: {
    origin: string
    branch: string
    file: string
}): Promise<string> => {
    const other = join(root, `elsewhere-${file}`)
    await git(root, 'clone', '-q', origin, other)
    await git(other, 'config', 'user.name', 'Elsewhere')
    await git(other, 'config', 'user.email', 'elsewhere@example.com')
    await git(other, 'config', 'commit.gpgsign', 'false')
    await git(other, 'config', 'core.hooksPath', join(root, 'no-hooks'))
    await git(other, 'checkout', '-q', '-B', branch)
    await Bun.write(join(other, file), `# ${file}\n`)
    await git(other, 'add', '-A')
    await git(other, 'commit', '-q', '-m', `add ${file}`)
    await git(other, 'push', '-q', 'origin', `${branch}:refs/heads/${branch}`)
    return (await git(other, 'rev-parse', 'HEAD')).trim()
}

/** Every commit on `branch` in the repo at `cwd`. */
const commitsOn = async ({ cwd, branch }: { cwd: string; branch: string }) =>
    (await git(cwd, 'log', '--format=%H', branch)).split('\n')

/** Where the repo at `repo` last saw origin's main. */
const originMainIn = async ({ repo }: { repo: string }) =>
    (await git(repo, 'rev-parse', 'refs/remotes/origin/main')).trim()

const runBranchesIn = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'run_branch_created' ? [record.content] : []
    )

/** A launcher whose every call throws, as if the engine died mid-turn. */
const crashingLauncher = (): AgentLauncher => {
    const scripted = createScriptedLauncher({ turns: [] })
    return {
        launch: () => Promise.reject(new Error('The engine crashed.')),
        followUp: () => Promise.reject(new Error('The engine crashed.')),
        closeSession: (args) => scripted.closeSession(args),
    }
}

describe('a new run starts from origin/<base>', () => {
    test('in the practice run, when local main is behind origin/main, the run branch starts from origin/main’s commit', async () => {
        const practice = await createPracticeRepo({ root })
        const local = (await git(practice.repo, 'rev-parse', 'main')).trim()
        const ahead = await pushFromElsewhere({
            origin: practice.origin,
            branch: 'main',
            file: 'NOTES.md',
        })
        expect(ahead).not.toBe(local)

        const { action, records } = await practice.run({ turns: HAPPY_TURNS })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [created] = runBranchesIn(records)
        expect(created?.base_sha).toBe(ahead)
        // The run branch on origin is built on origin/main's commit.
        expect(
            await commitsOn({
                cwd: practice.origin,
                branch: created?.branch ?? '',
            })
        ).toContain(ahead)
    }, 60_000)

    test('fetches the base branch and creates the run branch from origin/<base>, not from the local branch', async () => {
        const practice = await createPracticeRepo({ root })
        // Local main has a commit origin never got, and origin has one
        // local main never fetched.
        await Bun.write(join(practice.repo, 'LOCAL.md'), '# Local only\n')
        await git(practice.repo, 'add', '-A')
        await git(practice.repo, 'commit', '-q', '-m', 'local only')
        const local = (await git(practice.repo, 'rev-parse', 'main')).trim()
        const ahead = await pushFromElsewhere({
            origin: practice.origin,
            branch: 'main',
            file: 'NOTES.md',
        })

        const { action, records } = await practice.run({ turns: HAPPY_TURNS })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [created] = runBranchesIn(records)
        expect(created?.base_sha).toBe(ahead)
        // The base branch was fetched: the repo's origin/main is origin's.
        expect(await originMainIn({ repo: practice.repo })).toBe(ahead)
        expect(
            await commitsOn({
                cwd: practice.origin,
                branch: created?.branch ?? '',
            })
        ).not.toContain(local)
    }, 60_000)

    test('--base still picks the base branch: the run branch starts from origin/<base>', async () => {
        const { repo, origin } = await makePracticeRepo({ root })
        // Only origin has `develop`; the practice repo never fetched it.
        const develop = await pushFromElsewhere({
            origin,
            branch: 'develop',
            file: 'DEVELOP.md',
        })
        const runs_dir = join(root, 'runs')
        const scripted = createScriptedLauncher({ turns: HAPPY_TURNS })

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: 'develop',
            runs_dir,
            tracker: practiceTracker(),
            launcher: scripted,
            board: null,
            log: () => undefined,
        })

        expect(result).toEqual({
            ok: true,
            message: expect.stringContaining('PR opened'),
        })
        const records = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        }).read()
        const [created] = runBranchesIn(records)
        expect(created?.base_sha).toBe(develop)
    }, 60_000)
})

describe('a resumed run', () => {
    test('doesn’t fetch, and keeps its run branch', async () => {
        const practice = await createPracticeRepo({ root })
        const base = await pushFromElsewhere({
            origin: practice.origin,
            branch: 'main',
            file: 'NOTES.md',
        })

        // The first engine fetches, makes the run branch from origin/main,
        // then dies at the first agent's launch.
        await expect(
            practice.run({ launcher: crashingLauncher() })
        ).rejects.toThrow('The engine crashed.')
        const before = runBranchesIn(practice.journal.read())
        expect(before).toHaveLength(1)
        expect(before[0]?.base_sha).toBe(base)

        // Meanwhile someone else moves origin/main on again.
        const ahead = await pushFromElsewhere({
            origin: practice.origin,
            branch: 'main',
            file: 'MORE-NOTES.md',
        })

        const { action } = await practice.run({
            resume: true,
            turns: Object.values(happyTurns()),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const after = runBranchesIn(practice.journal.read())
        expect(after).toEqual(before)
        // No fetch: the repo's origin/main is still the one the run began on.
        expect(await originMainIn({ repo: practice.repo })).toBe(base)
        // The pushed run branch is built on the old base, not origin's new tip.
        const onRunBranch = await commitsOn({
            cwd: practice.origin,
            branch: before[0]?.branch ?? '',
        })
        expect(onRunBranch).toContain(base)
        expect(onRunBranch).not.toContain(ahead)
    }, 60_000)
})

describe('a failed fetch', () => {
    test('stops the run at intake, with a plain message that names the fetch (not a spec problem)', async () => {
        const { repo } = await makePracticeRepo({ root })
        // origin is gone, so the fetch fails.
        await git(repo, 'remote', 'set-url', 'origin', join(root, 'gone.git'))
        const runs_dir = join(root, 'runs')
        const tracker = practiceTracker()
        const scripted = createScriptedLauncher({ turns: HAPPY_TURNS })

        const result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir,
            tracker,
            launcher: scripted,
            board: null,
            log: () => undefined,
        })

        expect(result.ok).toBe(false)
        expect(result.message).toMatch(/fetch/i)
        expect(result.message).not.toContain('Intake refused')
        expect(result.message).not.toContain('The engine crashed')
        // Nothing was built.
        expect(scripted.launches()).toEqual([])
        const records = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-1' }),
        }).read()
        expect(runBranchesIn(records)).toEqual([])
        expect(records.map(({ kind }) => kind)).not.toContain('intake_refused')
        // The spec and its ticket are not blamed.
        expect(
            [
                ...tracker.commentsOn({ number: 10 }),
                ...tracker.commentsOn({ number: 11 }),
            ].filter((body) => body.includes('intake refused'))
        ).toEqual([])
        expect(tracker.labelsOf({ number: 11 })).toContain(READY_LABEL)
        expect(tracker.labelsOf({ number: 11 })).not.toContain(NEEDS_INFO_LABEL)
    }, 60_000)
})

describe('the engine README', () => {
    test('says runs start from origin/<base>', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(readme).toContain('origin/<base>')
    })
})
