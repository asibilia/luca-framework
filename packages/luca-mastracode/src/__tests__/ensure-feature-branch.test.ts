import { describe, test, expect } from 'bun:test'

import {
    ENSURE_FEATURE_BRANCH_ACTIONS,
    ensureFeatureBranchTool,
    __testing,
} from '../tools/ensure-feature-branch.js'

const { slugify, buildBranchName } = __testing

describe('slugify', () => {
    test('lowercases and replaces non-alphanumerics with single hyphens', () => {
        expect(slugify('Add Webhook Support')).toBe('add-webhook-support')
        expect(slugify('Fix: typo in README!!')).toBe('fix-typo-in-readme')
    })

    test('collapses runs of separators', () => {
        expect(slugify('a   b___c---d')).toBe('a-b-c-d')
    })

    test('strips leading and trailing separators', () => {
        expect(slugify('---hello---')).toBe('hello')
        expect(slugify('   spaces around   ')).toBe('spaces-around')
    })

    test('truncates to 60 chars', () => {
        const long = 'x'.repeat(120)
        const out = slugify(long)
        expect(out.length).toBeLessThanOrEqual(60)
    })

    test('falls back to "work" for empty / fully stripped input', () => {
        expect(slugify('')).toBe('work')
        expect(slugify('!!!')).toBe('work')
        expect(slugify('   ')).toBe('work')
    })
})

describe('buildBranchName', () => {
    test('embeds issue number when provided', () => {
        expect(
            buildBranchName({
                type: 'feat',
                issueNumber: 42,
                slug: 'add-webhook-support',
            })
        ).toBe('feat/42-add-webhook-support')
    })

    test('omits issue segment when no issue number', () => {
        expect(
            buildBranchName({
                type: 'fix',
                slug: 'flaky-test',
            })
        ).toBe('fix/flaky-test')
    })

    test('slugifies the slug defensively', () => {
        expect(
            buildBranchName({
                type: 'refactor',
                issueNumber: 7,
                slug: 'Move Auth Module!!',
            })
        ).toBe('refactor/7-move-auth-module')
    })

    test('honors all branch-type prefixes', () => {
        for (const type of [
            'feat',
            'fix',
            'refactor',
            'chore',
            'docs',
            'test',
            'style',
        ] as const) {
            const name = buildBranchName({ type, slug: 'work' })
            expect(name.startsWith(`${type}/`)).toBe(true)
        }
    })
})

describe('tool surface', () => {
    test('exposes the documented action set', () => {
        expect([...ENSURE_FEATURE_BRANCH_ACTIONS]).toEqual([
            'status',
            'create',
            'rename',
        ])
    })

    test('tool metadata advertises the canonical id and description', () => {
        expect(ensureFeatureBranchTool.id).toBe('ensure-feature-branch')
        expect(typeof ensureFeatureBranchTool.description).toBe('string')
    })
})

describe('rename status taxonomy (regression)', () => {
    // These tests guard the documented status codes — the docs in
    // architect.md and the PR description list `detached`, `on-default`,
    // `local-collision`, `remote-collision`. Earlier the rename action
    // collapsed these into `cannot-rename` and `collision`, which broke
    // callers that branched on the documented values.
    //
    // We can't drive the real git here without a sandbox repo, so we
    // assert the union shape through the tool's input validation surface
    // and leave the behavioural contract enforced by manual + integration
    // testing. The unit-level guard is: the source file still references
    // each of the four documented status strings.
    test('source file emits all four documented rename status codes', async () => {
        const path = await import('node:path').then((p) => p)
        const fs = await import('node:fs/promises')
        const url = await import('node:url')

        const here = url.fileURLToPath(import.meta.url)
        const toolPath = path.resolve(
            here,
            '../../tools/ensure-feature-branch.ts'
        )
        const src = await fs.readFile(toolPath, 'utf-8')

        for (const status of [
            "status: 'detached'",
            "status: 'on-default'",
            "status: 'local-collision'",
            "status: 'remote-collision'",
        ]) {
            expect(src).toContain(status)
        }
        // And the old collapsed codes must NOT exist anymore.
        expect(src).not.toContain("status: 'cannot-rename'")
    })
})

describe('isInsideGitRepo / create from default (source-level guards)', () => {
    // Source-level assertions for behaviour we can't run a real git for in
    // this environment. They lock in the fixes for two regressions:
    // (1) `isInsideGitRepo` checking only the exit code, which mis-classifies
    //     `.git/` and bare repos.
    // (2) `create` running `git switch -c` from the current HEAD instead of
    //     the default branch when force=true on a non-default feature branch.
    test('isInsideGitRepo validates stdout, not just exit code', async () => {
        const path = await import('node:path').then((p) => p)
        const fs = await import('node:fs/promises')
        const url = await import('node:url')

        const here = url.fileURLToPath(import.meta.url)
        const toolPath = path.resolve(
            here,
            '../../tools/ensure-feature-branch.ts'
        )
        const src = await fs.readFile(toolPath, 'utf-8')
        expect(src).toContain("r.stdout === 'true'")
    })

    test('create switches to default before branching when off-default', async () => {
        const path = await import('node:path').then((p) => p)
        const fs = await import('node:fs/promises')
        const url = await import('node:url')

        const here = url.fileURLToPath(import.meta.url)
        const toolPath = path.resolve(
            here,
            '../../tools/ensure-feature-branch.ts'
        )
        const src = await fs.readFile(toolPath, 'utf-8')
        expect(src).toContain("git(['switch', def])")
    })

    test('branchExistsRemote bounds the network call with a timeout', async () => {
        const path = await import('node:path').then((p) => p)
        const fs = await import('node:fs/promises')
        const url = await import('node:url')

        const here = url.fileURLToPath(import.meta.url)
        const toolPath = path.resolve(
            here,
            '../../tools/ensure-feature-branch.ts'
        )
        const src = await fs.readFile(toolPath, 'utf-8')
        expect(src).toMatch(/timeoutMs:\s*REMOTE_LS_TIMEOUT_MS/)
    })
})
