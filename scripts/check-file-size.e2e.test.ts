import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

const SCRIPT = join(import.meta.dir, 'check-file-size.ts')
const GIT_ENV = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
}

const dirs: string[] = []
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true })
})

/** Runs a command in `cwd` and returns its exit code and output. */
const run = async ({ cwd, args }: { cwd: string; args: string[] }) => {
    const child = Bun.spawn(args, {
        cwd,
        env: GIT_ENV,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    return { code, stdout, stderr }
}

const git = (cwd: string, ...args: string[]) =>
    run({ cwd, args: ['git', ...args] })

/** Makes a temp repo on `branch` with one small committed file. */
const makeRepo = async ({ branch }: { branch: string }) => {
    const dir = mkdtempSync(join(tmpdir(), 'file-size-'))
    dirs.push(dir)
    await git(dir, 'init', '-q', '-b', branch)
    writeFileSync(join(dir, 'small.ts'), 'export const a = 1\n')
    await git(dir, 'add', '.')
    await git(dir, 'commit', '-q', '-m', 'init')
    return dir
}

const check = ({ dir, staged }: { dir: string; staged: boolean }) =>
    run({
        cwd: dir,
        args: ['bun', SCRIPT, ...(staged ? ['--staged'] : [])],
    })

describe('check-file-size --staged', () => {
    test('fails on a big staged file only, not on a big lockfile', async () => {
        const dir = await makeRepo({ branch: 'main' })
        writeFileSync(join(dir, 'big.ts'), 'a'.repeat(21000))
        writeFileSync(join(dir, 'bun.lock'), 'a'.repeat(90000))
        await git(dir, 'add', 'big.ts', 'bun.lock')
        const { code, stderr } = await check({ dir, staged: true })
        expect(code).toBe(1)
        expect(stderr).toContain('big.ts')
        expect(stderr).toContain('5,250 tokens')
        expect(stderr).not.toContain('bun.lock')
    })

    test('sizes the staged content, not the working copy', async () => {
        const dir = await makeRepo({ branch: 'main' })
        writeFileSync(join(dir, 'big.ts'), 'a'.repeat(21000))
        await git(dir, 'add', 'big.ts')
        writeFileSync(join(dir, 'big.ts'), 'tiny\n')
        expect((await check({ dir, staged: true })).code).toBe(1)

        writeFileSync(join(dir, 'big.ts'), 'tiny\n')
        await git(dir, 'add', 'big.ts')
        writeFileSync(join(dir, 'big.ts'), 'a'.repeat(21000))
        const passing = await check({ dir, staged: true })
        expect(passing.code).toBe(0)
        expect(passing.stderr + passing.stdout).toBe('')
    })

    test('skips a big binary file', async () => {
        const dir = await makeRepo({ branch: 'main' })
        writeFileSync(join(dir, 'image.png'), new Uint8Array(30000))
        await git(dir, 'add', 'image.png')
        const { code } = await check({ dir, staged: true })
        expect(code).toBe(0)
    })
})

describe('check-file-size (branch mode)', () => {
    test('checks files changed since main, committed or untracked', async () => {
        const dir = await makeRepo({ branch: 'main' })
        await git(dir, 'checkout', '-q', '-b', 'feature')
        writeFileSync(join(dir, 'committed.ts'), 'a'.repeat(21000))
        await git(dir, 'add', '.')
        await git(dir, 'commit', '-q', '-m', 'big')
        writeFileSync(join(dir, 'untracked.md'), 'a'.repeat(21000))
        const { code, stderr } = await check({ dir, staged: false })
        expect(code).toBe(1)
        expect(stderr).toContain('committed.ts')
        expect(stderr).toContain('untracked.md')
        expect(stderr).not.toContain('small.ts')
    })

    test('skips deleted files and passes when nothing is big', async () => {
        const dir = await makeRepo({ branch: 'main' })
        await git(dir, 'checkout', '-q', '-b', 'feature')
        await git(dir, 'rm', '-q', 'small.ts')
        const { code, stdout, stderr } = await check({ dir, staged: false })
        expect(code).toBe(0)
        expect(stdout + stderr).toBe('')
    })

    test('on main, checks only uncommitted changes', async () => {
        const dir = await makeRepo({ branch: 'main' })
        writeFileSync(join(dir, 'old-big.ts'), 'a'.repeat(21000))
        await git(dir, 'add', '.')
        await git(dir, 'commit', '-q', '-m', 'big')
        expect((await check({ dir, staged: false })).code).toBe(0)
        writeFileSync(join(dir, 'old-big.ts'), 'b'.repeat(21000))
        expect((await check({ dir, staged: false })).code).toBe(1)
    })

    test('prefers origin/main over main', async () => {
        const dir = await makeRepo({ branch: 'main' })
        writeFileSync(join(dir, 'big.ts'), 'a'.repeat(21000))
        await git(dir, 'add', '.')
        await git(dir, 'commit', '-q', '-m', 'big')
        // origin/main points at the first commit, so the big file is "new".
        await git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD~1')
        const { code, stderr } = await check({ dir, staged: false })
        expect(code).toBe(1)
        expect(stderr).toContain('big.ts')
    })

    test('with neither origin/main nor main, prints a note and passes', async () => {
        const dir = await makeRepo({ branch: 'trunk' })
        writeFileSync(join(dir, 'big.ts'), 'a'.repeat(21000))
        const { code, stdout } = await check({ dir, staged: false })
        expect(code).toBe(0)
        expect(stdout.trim().split('\n')).toHaveLength(1)
        expect(stdout).toContain('main')
    })
})
