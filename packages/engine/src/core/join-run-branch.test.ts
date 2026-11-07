import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { decideAfter, stepsUpTo } from './decide-build-helpers'
import { executeBuildAction } from './execute-build'

import type { AgentLauncher } from '../agents/agent-launcher'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal, type Journal } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    intakePassed,
    practiceTicket,
    RUN_BRANCH,
} from '../testing/build-fixtures'
import { git } from '../testing/practice-repo'
import type { Tracker } from '../tracker/tracker'

/**
 * The engine's `join_run_branch` step on a real run branch when the
 * ticket's change is already there (#716): a rebase found nothing left to
 * apply, so the ticket's worktree sits at the run branch's tip with no
 * commits of its own. Nothing to replay is a join that adds nothing, not a
 * failed one, and the ticket goes on to the run branch's gates.
 */

let root = ''
let repo = ''
let worktree = ''
let journal: Journal

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-join-run-branch-'))
    repo = join(root, 'repo')
    worktree = join(root, 'ticket-11')
    await mkdir(repo, { recursive: true })
    await git(repo, 'init', '-q', '-b', 'main')
    await git(repo, 'config', 'user.email', 'luca@example.com')
    await git(repo, 'config', 'user.name', 'Luca')
    await Bun.write(join(repo, 'base.ts'), "export const name = 'base'\n")
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'base')
    journal = createJournal({ file: join(root, 'run-1', 'journal.jsonl') })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const headOf = async (cwd: string): Promise<string> =>
    (await git(cwd, 'rev-parse', 'HEAD')).trim()

describe('join_run_branch with nothing to replay', () => {
    test('joins with no commits, and the ticket goes on to the gates on the run branch', async () => {
        // An earlier join already put the ticket's change on the run branch.
        await Bun.write(join(repo, 'sum.ts'), 'export const sum = 1\n')
        await git(repo, 'add', '-A')
        await git(repo, 'commit', '-q', '-m', 'feat: build #11')
        const tip = await headOf(repo)
        await git(repo, 'worktree', 'add', '-q', '-b', 'ticket-11', worktree)
        const entries: JournalEntry[] = [
            ...intakePassed({
                tickets: [practiceTicket({ number: 11, title: 'Add sum' })],
            }),
            {
                kind: 'run_branch_created',
                ticket: null,
                role: null,
                content: { branch: RUN_BRANCH, path: repo, base_sha: 'b0' },
            },
            {
                kind: 'ticket_worktree_created',
                ticket: 11,
                role: null,
                content: { branch: 'ticket-11', path: worktree, base_sha: tip },
            },
        ]
        for (const entry of entries) journal.append(entry)

        await executeBuildAction({
            action: { type: 'join_run_branch', ticket: 11 },
            journal,
            tracker: {} as Tracker,
            git: createGitAdapter({ repo_root: repo }),
            launcher: {} as AgentLauncher,
        })

        expect(await headOf(repo)).toBe(tip)
        const joined = journal.read().at(-1)
        expect(joined).toMatchObject({
            kind: 'ticket_joined',
            ticket: 11,
            content: { ok: true, shas: [], lines_changed: 0 },
        })
        const state = replayRun({ records: journal.read() })
        expect(state.tickets[11]?.joined).toMatchObject({ ok: true, shas: [] })
        expect(state.tickets[11]?.stuck).toBeNull()

        // The same join at the same point in a whole ticket's journal.
        if (joined?.kind !== 'ticket_joined') throw new Error('not joined')
        expect(
            decideAfter([
                ...stepsUpTo(10),
                {
                    kind: 'ticket_joined',
                    ticket: 11,
                    role: null,
                    content: joined.content,
                },
            ])
        ).toEqual({ type: 'run_gates', ticket: 11, target: 'run_branch' })
    })
})

describe('join_run_branch for a ticket that already joined', () => {
    test('leaves the run branch and the join it has alone (#719)', async () => {
        // The ticket's join put its commit on the run branch; a second join
        // of the same ticket must not replay it again or overwrite the
        // record of which run-branch commit is the ticket's.
        const base = await headOf(repo)
        await git(repo, 'worktree', 'add', '-q', '-b', 'ticket-11', worktree)
        await Bun.write(join(worktree, 'sum.ts'), 'export const sum = 1\n')
        await git(worktree, 'add', '-A')
        await git(worktree, 'commit', '-q', '-m', 'feat: build #11')
        await git(repo, 'cherry-pick', 'ticket-11')
        const tip = await headOf(repo)
        const entries: JournalEntry[] = [
            ...intakePassed({
                tickets: [practiceTicket({ number: 11, title: 'Add sum' })],
            }),
            {
                kind: 'run_branch_created',
                ticket: null,
                role: null,
                content: { branch: RUN_BRANCH, path: repo, base_sha: base },
            },
            {
                kind: 'ticket_worktree_created',
                ticket: 11,
                role: null,
                content: {
                    branch: 'ticket-11',
                    path: worktree,
                    base_sha: base,
                },
            },
            {
                kind: 'join_started',
                ticket: 11,
                role: null,
                content: { run_branch_sha: base },
            },
            {
                kind: 'ticket_joined',
                ticket: 11,
                role: null,
                content: { ok: true, shas: [tip], lines_changed: 1 },
            },
        ]
        for (const entry of entries) journal.append(entry)
        const before = journal.read().length

        await executeBuildAction({
            action: { type: 'join_run_branch', ticket: 11 },
            journal,
            tracker: {} as Tracker,
            git: createGitAdapter({ repo_root: repo }),
            launcher: {} as AgentLauncher,
        })

        expect(await headOf(repo)).toBe(tip)
        expect(journal.read()).toHaveLength(before)
        const state = replayRun({ records: journal.read() })
        expect(state.tickets[11]?.joined).toMatchObject({
            ok: true,
            shas: [tip],
        })
    })
})
