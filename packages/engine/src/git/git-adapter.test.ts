import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createGitAdapter } from './git-adapter'

import { git } from '../testing/practice-repo'

/**
 * `undoReplay` on a real git repo: it undoes a join on top of the branch,
 * is safe to run twice, and never rewinds the branch over other work
 * (#519).
 */

let repo = ''

beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'luca-engine-git-adapter-'))
    await git(repo, 'init', '-q', '-b', 'main')
    await git(repo, 'config', 'user.email', 'luca@example.com')
    await git(repo, 'config', 'user.name', 'Luca')
    await commitFile({ name: 'base.ts' })
})

afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
})

/** Commits one new file and returns the commit's sha. */
const commitFile = async ({ name }: { name: string }): Promise<string> => {
    await Bun.write(join(repo, name), `export const name = '${name}'\n`)
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', name)
    return headOf()
}

const headOf = async (): Promise<string> =>
    (await git(repo, 'rev-parse', 'HEAD')).trim()

const undoReplay = (args: { first_sha: string; only: string[] }) =>
    createGitAdapter({ repo_root: repo }).undoReplay({ cwd: repo, ...args })

describe('undoReplay', () => {
    test('undoes the join on top of the branch and names its commits', async () => {
        const base = await headOf()
        const first = await commitFile({ name: 'a.ts' })
        const second = await commitFile({ name: 'b.ts' })

        expect(
            await undoReplay({ first_sha: first, only: [first, second] })
        ).toEqual({ ok: true, undone: [first, second] })
        expect(await headOf()).toBe(base)
    })

    test('run twice, the second undoes nothing', async () => {
        const base = await headOf()
        const first = await commitFile({ name: 'a.ts' })

        await undoReplay({ first_sha: first, only: [first] })
        expect(await undoReplay({ first_sha: first, only: [first] })).toEqual({
            ok: true,
            undone: [],
        })
        expect(await headOf()).toBe(base)
    })

    test('a commit no longer on the branch is refused, and the branch is left alone', async () => {
        // A joined, was undone, then B joined: A's parent is now behind B.
        const first = await commitFile({ name: 'a.ts' })
        const later = await commitFile({ name: 'later.ts' })
        await git(repo, 'reset', '-q', '--hard', `${first}^`)
        const other = await commitFile({ name: 'other.ts' })

        const result = await undoReplay({ first_sha: later, only: [later] })

        expect(result.ok).toBe(false)
        expect(result.ok ? '' : result.error).toContain('not on the branch')
        expect(await headOf()).toBe(other)
    })

    test('a missing commit is refused, and the branch is left alone', async () => {
        const tip = await commitFile({ name: 'a.ts' })
        const missing = 'f'.repeat(40)

        const result = await undoReplay({ first_sha: missing, only: [missing] })

        expect(result.ok).toBe(false)
        expect(result.ok ? '' : result.error).toContain('not in the repo')
        expect(await headOf()).toBe(tip)
    })

    test('other work on top of the join is refused, and the branch is left alone', async () => {
        const first = await commitFile({ name: 'a.ts' })
        const other = await commitFile({ name: 'other.ts' })

        const result = await undoReplay({ first_sha: first, only: [first] })

        expect(result.ok).toBe(false)
        expect(result.ok ? '' : result.error).toContain(other.slice(0, 7))
        expect(await headOf()).toBe(other)
    })
})
