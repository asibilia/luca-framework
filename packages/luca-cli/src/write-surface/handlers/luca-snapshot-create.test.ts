import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    buildWorktreeSnapshotTree,
    lucaSnapshotCreateTool,
    REVIEW_PREFIX_TREE_RELPATH,
} from './luca-snapshot-create.ts'

async function runGit(cwd: string, args: string[]): Promise<string> {
    const proc = Bun.spawn(['git', ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const code = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    if (code !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
    }
    return stdout
}

async function initRepoNoCommit(cwd: string): Promise<void> {
    await runGit(cwd, ['init', '-q', '-b', 'main'])
    await runGit(cwd, ['config', 'user.email', 'test@example.com'])
    await runGit(cwd, ['config', 'user.name', 'Test'])
}

async function initRepoWithCommit(cwd: string): Promise<void> {
    await initRepoNoCommit(cwd)
    await writeFile(join(cwd, 'tracked.txt'), 'v1\n')
    await runGit(cwd, ['add', 'tracked.txt'])
    await runGit(cwd, ['commit', '-q', '-m', 'init'])
}

async function writeActivePhaseState(cwd: string): Promise<void> {
    await mkdir(join(cwd, '.luca'), { recursive: true })
    await writeFile(
        join(cwd, '.luca/state.json'),
        JSON.stringify({
            pipelineStep: 'execute',
            currentPhase: 1,
            roadmap: [{ name: 'auth-rewrite', deps: [], status: 'in-progress' }],
        })
    )
}

async function lsTreePaths(cwd: string, tree: string): Promise<string[]> {
    const out = await runGit(cwd, ['ls-tree', '-r', '--name-only', tree])
    return out.split('\n').filter(Boolean)
}

describe('luca_snapshot_create', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-snapshot-create-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes payload with 40-hex tree + active phase slug', async () => {
        await initRepoWithCommit(cwd)
        await writeActivePhaseState(cwd)

        const r = await lucaSnapshotCreateTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const result = JSON.parse((r.content[0] as { text: string }).text)
        expect(result.ok).toBe(true)
        expect(result.payload).toBe(REVIEW_PREFIX_TREE_RELPATH)

        const payload = JSON.parse(
            await readFile(join(cwd, REVIEW_PREFIX_TREE_RELPATH), 'utf-8')
        )
        expect(payload.tree).toMatch(/^[0-9a-f]{40}$/)
        expect(payload.phase).toBe('01-auth-rewrite')
        expect(payload.tree).toBe(result.tree)
    })

    test('leaves the real index and worktree untouched', async () => {
        await initRepoWithCommit(cwd)
        await writeActivePhaseState(cwd)

        // Mixed dirty state: staged change, unstaged change, untracked file.
        await writeFile(join(cwd, 'staged.txt'), 'staged\n')
        await runGit(cwd, ['add', 'staged.txt'])
        await writeFile(join(cwd, 'tracked.txt'), 'v2-unstaged\n')
        await writeFile(join(cwd, 'untracked.txt'), 'loose\n')

        const before = await runGit(cwd, ['status', '--porcelain'])

        const r = await lucaSnapshotCreateTool.handler({}, { cwd })
        expect(r.isError).toBeFalsy()

        const after = await runGit(cwd, ['status', '--porcelain'])
        // The payload file itself is a new untracked path — exclude it so the
        // assertion targets pre-existing index/worktree state only.
        const afterFiltered = after
            .split('\n')
            .filter((line) => !line.includes('.luca/'))
            .join('\n')
        const beforeFiltered = before
            .split('\n')
            .filter((line) => !line.includes('.luca/'))
            .join('\n')
        expect(afterFiltered).toBe(beforeFiltered)
    })

    test('unborn branch: snapshot tree contains the worktree files', async () => {
        await initRepoNoCommit(cwd)
        await writeActivePhaseState(cwd)
        await writeFile(join(cwd, 'first.txt'), 'hello\n')

        const r = await lucaSnapshotCreateTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const result = JSON.parse((r.content[0] as { text: string }).text)
        const paths = await lsTreePaths(cwd, result.tree)
        expect(paths).toContain('first.txt')
        // Repo still has no commits — HEAD must remain unresolvable.
        const headProc = Bun.spawn(['git', 'rev-parse', '--verify', 'HEAD'], {
            cwd,
            stdout: 'pipe',
            stderr: 'pipe',
        })
        expect(await headProc.exited).not.toBe(0)
    })

    test('untracked file appears in the snapshot tree', async () => {
        await initRepoWithCommit(cwd)
        await writeActivePhaseState(cwd)
        await writeFile(join(cwd, 'brand-new.txt'), 'untracked content\n')

        const r = await lucaSnapshotCreateTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const result = JSON.parse((r.content[0] as { text: string }).text)
        const paths = await lsTreePaths(cwd, result.tree)
        expect(paths).toContain('brand-new.txt')
        expect(paths).toContain('tracked.txt')
    })

    test('errors when no phase is active (currentPhase=0)', async () => {
        await initRepoWithCommit(cwd)
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'execute', currentPhase: 0 })
        )

        const r = await lucaSnapshotCreateTool.handler({}, { cwd })
        expect(r.isError).toBe(true)
    })

    test('buildWorktreeSnapshotTree fails cleanly outside a git repo', async () => {
        const built = await buildWorktreeSnapshotTree(cwd)
        expect(built.ok).toBe(false)
    })

    test('has no allowedPhases (capture is phase-agnostic)', () => {
        expect(lucaSnapshotCreateTool.allowedPhases).toBeUndefined()
    })
})
