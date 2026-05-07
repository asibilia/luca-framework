import { describe, test, expect } from 'bun:test'

import { ENG_PT_PREFERENCES } from './fixtures/preferences-eng-pt.js'
import { LUCA_FRAMEWORK_PREFERENCES } from './fixtures/preferences-luca-framework.js'

import { ProjectPreferencesSchema } from '../state/project-preferences.js'
import {
    ENSURE_FEATURE_BRANCH_ACTIONS,
    ensureFeatureBranchTool,
    resolveBranching,
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
            'assert-not-default',
            'consult',
            'resolve',
            'apply',
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

// ---------------------------------------------------------------------------
// Phase B Wave 4 — fixture parse + pure resolveBranching coverage
// ---------------------------------------------------------------------------

describe('fixtures parse via ProjectPreferencesSchema', () => {
    test('LUCA_FRAMEWORK_PREFERENCES is schema-valid', () => {
        const r = ProjectPreferencesSchema.safeParse(LUCA_FRAMEWORK_PREFERENCES)
        expect(r.success).toBe(true)
    })

    test('ENG_PT_PREFERENCES is schema-valid', () => {
        const r = ProjectPreferencesSchema.safeParse(ENG_PT_PREFERENCES)
        expect(r.success).toBe(true)
    })
})

describe('resolveBranching (pure)', () => {
    test('ENG-* match → role=release, base/prBase=main, branchName=ENG-1428--release', () => {
        const result = resolveBranching({
            ticketId: 'ENG-1428',
            currentBranch: 'main',
            defaultBranch: 'main',
            preferences: ENG_PT_PREFERENCES,
        })
        expect(result.role).toBe('release')
        expect(result.base).toBe('main')
        expect(result.prBase).toBe('main')
        expect(result.branchName).toBe('ENG-1428--release')
        expect(result.matchedRule).toBe('branchType')
        expect(result.matchedIndex).toBe(0)
    })

    test('PT-* on ENG-1428--release → base=ENG-1428--release, needsConfirmation=false', () => {
        const result = resolveBranching({
            ticketId: 'PT-12458',
            intent: 'fix order book loading flash',
            currentBranch: 'ENG-1428--release',
            defaultBranch: 'main',
            preferences: ENG_PT_PREFERENCES,
        })
        expect(result.role).toBe('feature')
        expect(result.base).toBe('ENG-1428--release')
        expect(result.prBase).toBe('ENG-1428--release')
        expect(result.needsConfirmation).toBe(false)
        expect(result.matchedRule).toBe('branchType')
        expect(result.matchedIndex).toBe(1)
    })

    test('PT-* on main (no current-branch match) → fallback="ask" forces needsConfirmation=true', () => {
        const result = resolveBranching({
            ticketId: 'PT-12458',
            intent: 'fix order book loading flash',
            currentBranch: 'main',
            defaultBranch: 'main',
            preferences: ENG_PT_PREFERENCES,
        })
        expect(result.needsConfirmation).toBe(true)
        // fallback='ask' → resolver returns undefined value (no silent default).
        expect(result.base).toBeUndefined()
        expect(result.prBase).toBeUndefined()
        expect(result.role).toBe('feature')
    })

    test('fallback rule applied for unmatched ticket prefix', () => {
        const result = resolveBranching({
            ticketId: 'JIRA-1',
            intent: 'misc work',
            currentBranch: 'feat/other',
            defaultBranch: 'main',
            preferences: ENG_PT_PREFERENCES,
        })
        expect(result.matchedRule).toBe('fallback')
        expect(result.base).toBe('main')
        expect(result.prBase).toBe('main')
        // Fallback template '{type}/{slug}' has no {issue}.
        expect(result.branchName).toMatch(/^feat\/[a-z0-9-]+$/)
        expect(result.branchName).not.toContain('JIRA-1')
    })

    test('preferences null → built-in tool defaults (matchedRule="tool-default")', () => {
        const result = resolveBranching({
            ticketId: 'PT-1',
            intent: 'add widget',
            currentBranch: 'feat/x',
            defaultBranch: 'main',
            preferences: null,
        })
        expect(result.matchedRule).toBe('tool-default')
        expect(result.base).toBe('main')
        expect(result.prBase).toBe('main')
        expect(result.role).toBe('feature')
        expect(result.needsConfirmation).toBe(false)
        expect(result.branchName).toMatch(/^feat\/PT-1-/)
    })

    test('confirmBaseBeforeCreate=true forces needsConfirmation even on static base', () => {
        const prefs = {
            ...ENG_PT_PREFERENCES,
            branching: {
                ...ENG_PT_PREFERENCES.branching,
                confirmBaseBeforeCreate: true,
            },
        }
        const result = resolveBranching({
            ticketId: 'ENG-1428',
            currentBranch: 'main',
            defaultBranch: 'main',
            preferences: prefs,
        })
        // base is still resolved (static 'main'), but the flag forces confirmation.
        expect(result.base).toBe('main')
        expect(result.needsConfirmation).toBe(true)
    })

    test('multi-rule order: catch-all "^.*$" placed first hijacks specific rules (first-match-wins)', () => {
        const prefs = {
            ...ENG_PT_PREFERENCES,
            branching: {
                ...ENG_PT_PREFERENCES.branching,
                branchTypes: [
                    {
                        match: '^.*$',
                        template: '{type}/catchall-{slug}',
                        base: { kind: 'static' as const, value: 'main' },
                        prBase: { kind: 'static' as const, value: 'main' },
                        role: 'feature' as const,
                    },
                    // The specific ENG rule below is now unreachable.
                    {
                        match: '^ENG-\\d+$',
                        template: '{issue}--release',
                        base: { kind: 'static' as const, value: 'main' },
                        prBase: { kind: 'static' as const, value: 'main' },
                        role: 'release' as const,
                    },
                ],
            },
        }
        const result = resolveBranching({
            ticketId: 'ENG-1428',
            intent: 'cut release',
            currentBranch: 'main',
            defaultBranch: 'main',
            preferences: prefs,
        })
        expect(result.matchedRule).toBe('branchType')
        expect(result.matchedIndex).toBe(0)
        expect(result.role).toBe('feature')
        expect(result.branchName).toMatch(/^feat\/catchall-/)
    })

    test('renderTemplate + slugifySegment integration: PT branch uses fixture template + intent-derived slug', () => {
        const result = resolveBranching({
            ticketId: 'PT-12458',
            intent: 'Fix Order Book LOADING flash!',
            currentBranch: 'ENG-1428--release',
            defaultBranch: 'main',
            preferences: ENG_PT_PREFERENCES,
        })
        // template '{type}/{issue}-{slug}' + slugifySegment lowercases & dasherizes.
        expect(result.branchName).toBe(
            'feat/PT-12458-fix-order-book-loading-flash'
        )
    })
})

describe('PT-12458 regression — release-branch base resolution (resolve path)', () => {
    // The original PT-12458 incident: commits landed on ENG-1428--release because
    // the original status() returned 'on-feature' for any non-default branch — the
    // resolver now correctly identifies ENG-1428--release as the intended base for
    // a PT-* feature branch instead of skipping branch creation.
    test('PT-12458 from ENG-1428--release resolves base/prBase to the release branch', () => {
        const result = resolveBranching({
            ticketId: 'PT-12458',
            intent: 'fix order book loading flash',
            currentBranch: 'ENG-1428--release',
            defaultBranch: 'main',
            preferences: ENG_PT_PREFERENCES,
        })
        expect(result.branchName).toMatch(/^feat\/PT-12458-/)
        expect(result.base).toBe('ENG-1428--release')
        expect(result.prBase).toBe('ENG-1428--release')
        expect(result.role).toBe('feature')
        expect(result.needsConfirmation).toBe(false)
    })
})
