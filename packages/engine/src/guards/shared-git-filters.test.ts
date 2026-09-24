import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { enforceAfterTurn, snapshotWorktree } from './worktree-state'

import type { EngineConfig } from '../config/engine-config'

/**
 * Seam 3, the after-turn check on a real repo: git content filters (clean
 * and smudge drivers) planted in the shared `.git` by another process never
 * run while the check runs.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const SOURCE = 'export {}\n'

let root = ''
let repo = ''

beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-git-filters-'))
    repo = join(root, 'repo')
    await Bun.write(join(repo, '.gitignore'), 'node_modules\n')
    await Bun.write(join(repo, 'src/index.ts'), SOURCE)
    await $`git init -q -b main`.cwd(repo).quiet()
    await $`git add -A`.cwd(repo).quiet()
    await $`git -c user.name=t -c user.email=t@t commit -q -m init`
        .cwd(repo)
        .quiet()
})

afterAll(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('the after-turn check and git content filters', () => {
    test('a clean and smudge filter another process plants mid-turn never runs for the check, and stays', async () => {
        const cleaned = join(root, 'clean-ran')
        const smudged = join(root, 'smudge-ran')
        const clean = `touch '${cleaned}'; cat`
        const smudge = `touch '${smudged}'; cat`
        const before = await snapshotWorktree({
            cwd: repo,
            branch: 'main',
            config: CONFIG,
        })

        // Another process plants a filter on every path in the shared .git.
        await $`git config filter.planted.clean ${clean}`.cwd(repo).quiet()
        await $`git config filter.planted.smudge ${smudge}`.cwd(repo).quiet()
        await Bun.write(
            join(repo, '.git/info/attributes'),
            '* filter=planted\n'
        )
        // The test-writer writes source it may not, so the check puts it back.
        await Bun.write(join(repo, 'src/index.ts'), 'export const x = 1\n')
        const { violations, outside } = await enforceAfterTurn({
            cwd: repo,
            branch: 'main',
            role: 'test-writer',
            may_edit_tests: true,
            config: CONFIG,
            before,
        })

        expect(violations).toEqual([
            { kind: 'path', path: 'src/index.ts', change: 'wrote' },
        ])
        expect(outside).toContain('the shared .git/config changed')
        expect(await Bun.file(join(repo, 'src/index.ts')).text()).toBe(SOURCE)
        expect(existsSync(cleaned)).toBe(false)
        expect(existsSync(smudged)).toBe(false)
        // Not put back: the engine can't tell who set them.
        expect(
            (
                await $`git config --get filter.planted.clean`.cwd(repo).text()
            ).trim()
        ).toBe(clean)
        expect(
            (
                await $`git config --get filter.planted.smudge`.cwd(repo).text()
            ).trim()
        ).toBe(smudge)
        // They are real filters: plain git runs them.
        await $`git hash-object src/index.ts`.cwd(repo).quiet()
        expect(existsSync(cleaned)).toBe(true)
        await $`git cat-file --filters HEAD:src/index.ts`.cwd(repo).quiet()
        expect(existsSync(smudged)).toBe(true)
    }, 60_000)

    test('a clean filter planted mid-turn never runs while the check reads an allowed change', async () => {
        const copy = join(root, 'copy')
        await $`git clone -q ${repo} ${copy}`.quiet()
        const cleaned = join(root, 'copy-clean-ran')
        const clean = `touch '${cleaned}'; cat`
        const before = await snapshotWorktree({
            cwd: copy,
            branch: 'main',
            config: CONFIG,
        })

        await $`git config filter.planted.clean ${clean}`.cwd(copy).quiet()
        await Bun.write(
            join(copy, '.git/info/attributes'),
            '* filter=planted\n'
        )
        // Same size as before, so git must read the file to see the change.
        await Bun.write(join(copy, 'src/index.ts'), 'export []\n')
        const { violations } = await enforceAfterTurn({
            cwd: copy,
            branch: 'main',
            role: 'implementer',
            may_edit_tests: false,
            config: CONFIG,
            before,
        })

        expect(violations).toEqual([])
        expect(await Bun.file(join(copy, 'src/index.ts')).text()).toBe(
            'export []\n'
        )
        expect(existsSync(cleaned)).toBe(false)
        await $`git hash-object src/index.ts`.cwd(copy).quiet()
        expect(existsSync(cleaned)).toBe(true)
    }, 60_000)
})
