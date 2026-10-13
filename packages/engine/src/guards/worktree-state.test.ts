import { existsSync } from 'node:fs'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { enforceAfterTurn, snapshotWorktree } from './worktree-state'

import type { EngineConfig } from '../config/engine-config'

/**
 * Seam 3, the after-turn check on a real repo: what git ignores but the
 * check still watches, and how it is put back. The dependency is a local
 * tarball, so the install runs offline.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const LEFT_PAD = 'module.exports = (text) => ` ${text}`\n'

let root = ''
let repo = ''

beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-worktree-state-'))
    repo = join(root, 'repo')
    const pkg = join(root, 'left-pad')
    await Bun.write(
        join(pkg, 'package.json'),
        JSON.stringify({ name: 'left-pad', version: '1.0.0', main: 'index.js' })
    )
    await Bun.write(join(pkg, 'index.js'), LEFT_PAD)
    await $`bun pm pack --quiet --destination ${root}`.cwd(pkg).quiet()
    await Bun.write(
        join(repo, 'package.json'),
        JSON.stringify({
            name: 'practice',
            dependencies: { 'left-pad': `file:${root}/left-pad-1.0.0.tgz` },
        })
    )
    await Bun.write(join(repo, '.gitignore'), 'node_modules\n.env\ndist\n')
    await Bun.write(join(repo, 'src/index.ts'), 'export {}\n')
    await $`git init -q -b main`.cwd(repo).quiet()
    await $`bun install`.cwd(repo).quiet()
    await $`git add -A`.cwd(repo).quiet()
    await $`git -c user.name=t -c user.email=t@t commit -q -m init`
        .cwd(repo)
        .quiet()
})

afterAll(async () => {
    await rm(root, { recursive: true, force: true })
})

const turn = async ({
    role,
    act,
}: {
    role: 'test-writer' | 'implementer'
    act: () => Promise<void>
}) => {
    const before = await snapshotWorktree({
        cwd: repo,
        branch: 'main',
        config: CONFIG,
    })
    await act()
    return enforceAfterTurn({
        cwd: repo,
        branch: 'main',
        role,
        may_edit_tests: role === 'test-writer',
        config: CONFIG,
        before,
    })
}

describe('the after-turn check and what git ignores', () => {
    test('an installed package an agent changes is put back by the engine install', async () => {
        const file = join(repo, 'node_modules/left-pad/index.js')
        expect(await Bun.file(file).text()).toBe(LEFT_PAD)

        const { violations } = await turn({
            role: 'implementer',
            act: async () => {
                await Bun.write(file, 'module.exports = () => "cheat"\n')
            },
        })

        expect(violations).toEqual([
            {
                kind: 'path',
                path: 'node_modules/left-pad/index.js',
                change: 'wrote',
            },
        ])
        expect(await Bun.file(file).text()).toBe(LEFT_PAD)
    }, 60_000)

    test('an installed package an agent deletes is put back too', async () => {
        const { violations } = await turn({
            role: 'implementer',
            act: async () => {
                await rm(join(repo, 'node_modules/left-pad'), {
                    recursive: true,
                })
            },
        })

        expect(violations.map((violation) => violation.kind)).not.toContain(
            'undo_failed'
        )
        expect(violations).toContainEqual({
            kind: 'path',
            path: 'node_modules/left-pad/index.js',
            change: 'deleted',
        })
        expect(
            await Bun.file(join(repo, 'node_modules/left-pad/index.js')).text()
        ).toBe(LEFT_PAD)
    }, 60_000)

    test('an ignored .env a test-writer writes is removed, or put back as it was', async () => {
        const env = join(repo, '.env')
        const made = await turn({
            role: 'test-writer',
            act: async () => {
                await Bun.write(env, 'FAKE=1\n')
            },
        })
        expect(made.violations).toEqual([
            { kind: 'path', path: '.env', change: 'wrote' },
        ])
        expect(existsSync(env)).toBe(false)

        await Bun.write(env, 'REAL=1\n')
        const changed = await turn({
            role: 'test-writer',
            act: async () => {
                await Bun.write(env, 'FAKE=1\n')
            },
        })
        expect(changed.violations).toEqual([
            { kind: 'path', path: '.env', change: 'wrote' },
        ])
        expect(await Bun.file(env).text()).toBe('REAL=1\n')
        await rm(env)
    }, 60_000)

    test('ignored build output is not watched: check commands write it', async () => {
        const { violations } = await turn({
            role: 'test-writer',
            act: async () => {
                await Bun.write(join(repo, 'dist/index.js'), 'export {}\n')
            },
        })

        expect(violations).toEqual([])
        expect(existsSync(join(repo, 'dist/index.js'))).toBe(true)
    }, 60_000)
})

describe('the after-turn check and the shared .git', () => {
    test('an fsmonitor another process plants mid-turn never runs for the check, and stays', async () => {
        const marker = join(root, 'fsmonitor-ran')
        const monitor = join(root, 'fsmonitor.sh')
        await Bun.write(monitor, `#!/bin/sh\ntouch '${marker}'\n`)
        await chmod(monitor, 0o755)

        const { violations, outside } = await turn({
            role: 'implementer',
            act: async () => {
                await $`git config core.fsmonitor ${monitor}`.cwd(repo).quiet()
            },
        })

        expect(violations).toEqual([])
        expect(outside).toEqual(['the shared .git/config changed'])
        expect(existsSync(marker)).toBe(false)
        // Not put back: the engine can't tell who set it.
        expect(
            (await $`git config --get core.fsmonitor`.cwd(repo).text()).trim()
        ).toBe(monitor)
        // It is a real fsmonitor: plain git runs it.
        await $`git status --porcelain`.cwd(repo).quiet()
        expect(existsSync(marker)).toBe(true)
        await $`git config --unset core.fsmonitor`.cwd(repo).quiet()
    }, 60_000)
})

describe('the after-turn check and a worktree that is gone', () => {
    test('a snapshot of a removed folder says why it failed', async () => {
        const gone = await mkdtemp(join(tmpdir(), 'luca-engine-gone-'))
        await rm(gone, { recursive: true, force: true })

        const error = await snapshotWorktree({
            cwd: gone,
            branch: 'main',
            config: CONFIG,
        }).then(
            () => null,
            (caught: unknown) => caught
        )

        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain(`failed in ${gone}:`)
        expect(String(error)).toContain('no longer exists')
    }, 60_000)

    test('a check on a worktree removed mid-turn says why it failed', async () => {
        const copy = join(root, 'removed-copy')
        await $`git clone -q ${repo} ${copy}`.quiet()
        const before = await snapshotWorktree({
            cwd: copy,
            branch: 'main',
            config: CONFIG,
        })
        await rm(copy, { recursive: true, force: true })

        const error = await enforceAfterTurn({
            cwd: copy,
            branch: 'main',
            role: 'implementer',
            may_edit_tests: false,
            config: CONFIG,
            before,
        }).then(
            () => null,
            (caught: unknown) => caught
        )

        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain(`failed in ${copy}:`)
        expect(String(error)).toContain('no longer exists')
    }, 60_000)
})
