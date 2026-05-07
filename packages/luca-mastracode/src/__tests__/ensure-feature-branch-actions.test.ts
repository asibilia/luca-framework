/**
 * Phase B Wave 4 — git-mocked action coverage for ensureFeatureBranch.
 *
 * Mocks `node:child_process.execFileSync` via `mock.module` so the tool's
 * private git helpers (currentBranch / defaultBranch / branchExistsLocal /
 * branchExistsRemote / git switch) can be driven without a sandbox repo.
 * Mocks `loadProjectPreferences` and `writeLucaState` via `spyOn` to drive
 * preference-dependent branches and verify state writes.
 *
 * NOTE: `mock.module(...)` MUST run before the tool is imported. The tool is
 * imported dynamically (top-level await) AFTER the module mock is installed.
 */
import { describe, test, expect, mock, spyOn, beforeEach } from 'bun:test'

import * as prefsState from '../state/project-preferences.js'
import * as lucaStore from '../state/luca-store.js'

import { ENG_PT_PREFERENCES } from './fixtures/preferences-eng-pt.js'

// ---------------------------------------------------------------------------
// Mutable git mock router. Tests configure `gitState` per-test and the mock
// dispatches based on the args git receives.
// ---------------------------------------------------------------------------

interface GitState {
    insideRepo: boolean
    currentBranch: string
    defaultBranch: string
    /** branches that "exist" locally — branchExistsLocal returns true for these. */
    localBranches: Set<string>
    /** branches that "exist" on origin — branchExistsRemote returns true for these. */
    remoteBranches: Set<string>
    /** when true, `git switch X` and `git switch -c X` succeed. */
    switchOk: boolean
}

const gitState: GitState = {
    insideRepo: true,
    currentBranch: 'main',
    defaultBranch: 'main',
    localBranches: new Set<string>(),
    remoteBranches: new Set<string>(),
    switchOk: true,
}

function resetGitState(): void {
    gitState.insideRepo = true
    gitState.currentBranch = 'main'
    gitState.defaultBranch = 'main'
    gitState.localBranches = new Set<string>()
    gitState.remoteBranches = new Set<string>()
    gitState.switchOk = true
}

mock.module('node:child_process', () => ({
    execFileSync: (_cmd: string, args: readonly string[]): string => {
        // rev-parse --is-inside-work-tree
        if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
            if (!gitState.insideRepo) {
                const err: any = new Error('not a git repo')
                err.stdout = Buffer.from('false\n')
                err.stderr = Buffer.from('')
                throw err
            }
            return 'true\n'
        }
        // branch --show-current
        if (args[0] === 'branch' && args[1] === '--show-current') {
            return `${gitState.currentBranch}\n`
        }
        // symbolic-ref refs/remotes/origin/HEAD
        if (
            args[0] === 'symbolic-ref' &&
            args[1] === 'refs/remotes/origin/HEAD'
        ) {
            return `refs/remotes/origin/${gitState.defaultBranch}\n`
        }
        // show-ref --verify refs/heads/<name>
        if (args[0] === 'show-ref' && args[1] === '--verify') {
            const ref = args[2] ?? ''
            const name = ref.replace(/^refs\/heads\//, '')
            if (gitState.localBranches.has(name) || name === gitState.defaultBranch) {
                return ''
            }
            const err: any = new Error('not found')
            err.stdout = Buffer.from('')
            err.stderr = Buffer.from('')
            throw err
        }
        // ls-remote --heads origin <name>
        if (args[0] === 'ls-remote' && args[1] === '--heads') {
            const name = args[3] ?? ''
            return gitState.remoteBranches.has(name)
                ? `abcdef1234\trefs/heads/${name}\n`
                : ''
        }
        // git switch <branch>  OR  git switch -c <branch>
        if (args[0] === 'switch') {
            if (!gitState.switchOk) {
                const err: any = new Error('switch failed')
                err.stdout = Buffer.from('')
                err.stderr = Buffer.from('switch failed')
                throw err
            }
            const isCreate = args[1] === '-c'
            const target = isCreate ? args[2]! : args[1]!
            gitState.currentBranch = target
            if (isCreate) gitState.localBranches.add(target)
            return ''
        }
        return ''
    },
}))

// Dynamic import — must run AFTER mock.module install.
const {
    ensureFeatureBranchTool,
} = await import('../tools/ensure-feature-branch.js')

// ---------------------------------------------------------------------------
// Spies for preferences + state.
// ---------------------------------------------------------------------------

const mockLoadPrefs = spyOn(prefsState, 'loadProjectPreferences')
const mockWriteState = spyOn(lucaStore, 'writeLucaState')
const mockReadState = spyOn(lucaStore, 'readLucaState')

beforeEach(() => {
    resetGitState()
    mockLoadPrefs.mockReset().mockReturnValue(null)
    mockWriteState.mockReset().mockImplementation((updates: any) => updates)
    mockReadState.mockReset().mockReturnValue({} as any)
})

async function call(input: Record<string, unknown>): Promise<any> {
    return ensureFeatureBranchTool.execute!(input as any, {} as any)
}

// ---------------------------------------------------------------------------
// assert-not-default
// ---------------------------------------------------------------------------

describe('assert-not-default', () => {
    test('on default branch → ok:false status:on-default', async () => {
        gitState.currentBranch = 'main'
        gitState.defaultBranch = 'main'
        const r = await call({ action: 'assert-not-default' })
        expect(r.ok).toBe(false)
        expect(r.status).toBe('on-default')
    })

    test('on guarded branch (in guardedBranches[]) → ok:false status:on-guarded', async () => {
        gitState.currentBranch = 'ENG-1428--release'
        gitState.defaultBranch = 'main'
        mockLoadPrefs.mockReturnValue(ENG_PT_PREFERENCES)
        const r = await call({ action: 'assert-not-default' })
        expect(r.ok).toBe(false)
        expect(r.status).toBe('on-guarded')
        expect(r.guardedBranches).toContain('ENG-1428--release')
    })

    test('on feature branch → ok:true status:safe', async () => {
        gitState.currentBranch = 'feat/PT-1-add-thing'
        gitState.defaultBranch = 'main'
        mockLoadPrefs.mockReturnValue(ENG_PT_PREFERENCES)
        const r = await call({ action: 'assert-not-default' })
        expect(r.ok).toBe(true)
        expect(r.status).toBe('safe')
    })

    test('preferences null → runtime fallback ["main"] still blocks main', async () => {
        gitState.currentBranch = 'main'
        gitState.defaultBranch = 'main'
        mockLoadPrefs.mockReturnValue(null)
        const r = await call({ action: 'assert-not-default' })
        expect(r.ok).toBe(false)
        expect(r.status).toBe('on-default')
    })
})

// ---------------------------------------------------------------------------
// consult
// ---------------------------------------------------------------------------

describe('consult', () => {
    test('preferences present → returns merged BranchingSection from prefs', async () => {
        mockLoadPrefs.mockReturnValue(ENG_PT_PREFERENCES)
        const r = await call({ action: 'consult' })
        expect(r.ok).toBe(true)
        expect(r.status).toBe('consulted')
        expect(r.source).toBe('preferences')
        expect(r.branching).toEqual(ENG_PT_PREFERENCES.branching)
    })

    test('preferences null → returns tool defaults', async () => {
        mockLoadPrefs.mockReturnValue(null)
        const r = await call({ action: 'consult' })
        expect(r.ok).toBe(true)
        expect(r.status).toBe('consulted')
        expect(r.source).toBe('tool-defaults')
        expect(r.branching.defaultBranch).toBe('main')
        expect(r.branching.guardedBranches).toEqual(['main'])
    })
})

// ---------------------------------------------------------------------------
// status enrichment (legacy status string + new role field)
// ---------------------------------------------------------------------------

describe('status enrichment', () => {
    test('on default → status:on-default AND role:default', async () => {
        gitState.currentBranch = 'main'
        gitState.defaultBranch = 'main'
        const r = await call({ action: 'status' })
        expect(r.status).toBe('on-default')
        expect(r.role).toBe('default')
    })

    test('on guarded ENG-1428--release with fixture b → status:on-feature (legacy) + role:guarded', async () => {
        gitState.currentBranch = 'ENG-1428--release'
        gitState.defaultBranch = 'main'
        mockLoadPrefs.mockReturnValue(ENG_PT_PREFERENCES)
        const r = await call({ action: 'status' })
        // Legacy status is preserved for back-compat callers.
        expect(r.status).toBe('on-feature')
        // New `role` field correctly classifies the branch as guarded.
        expect(r.role).toBe('guarded')
    })
})

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

describe('apply', () => {
    test('needsConfirmation && !confirmedBase → ok:false status:needs-confirmation; state NOT written', async () => {
        gitState.currentBranch = 'main'
        gitState.defaultBranch = 'main'
        const r = await call({
            action: 'apply',
            resolution: {
                branchName: 'feat/PT-1-foo',
                base: undefined,
                prBase: undefined,
                needsConfirmation: true,
            },
        })
        expect(r.ok).toBe(false)
        expect(r.status).toBe('needs-confirmation')
        expect(mockWriteState).not.toHaveBeenCalled()
    })

    test('success path → ok:true; writeLucaState called with branchName, baseBranch, prBase, issueNumber', async () => {
        gitState.currentBranch = 'ENG-1428--release'
        gitState.defaultBranch = 'main'
        mockLoadPrefs.mockReturnValue(ENG_PT_PREFERENCES)
        const r = await call({
            action: 'apply',
            issueNumber: 12458,
            resolution: {
                branchName: 'feat/PT-12458-fix-order-book',
                base: 'ENG-1428--release',
                prBase: 'ENG-1428--release',
                needsConfirmation: false,
                role: 'feature',
            },
        })
        expect(r.ok).toBe(true)
        expect(r.status).toBe('applied')
        expect(r.branchName).toBe('feat/PT-12458-fix-order-book')
        expect(r.baseBranch).toBe('ENG-1428--release')
        expect(r.prBase).toBe('ENG-1428--release')
        expect(r.created).toBe(true)
        expect(mockWriteState).toHaveBeenCalledWith({
            branchName: 'feat/PT-12458-fix-order-book',
            baseBranch: 'ENG-1428--release',
            prBase: 'ENG-1428--release',
            issueNumber: 12458,
        })
        // git switched to the new branch.
        expect(gitState.currentBranch).toBe('feat/PT-12458-fix-order-book')
    })
})

// ---------------------------------------------------------------------------
// PT-12458 regression — assert-not-default surface on a release branch.
//
// The original PT-12458 incident: status() returned 'on-feature' for any
// non-default branch, allowing the executor pre-commit guard to pass and
// PT-12458 commits to land on ENG-1428--release. This test pins the new
// assert-not-default action's hard-fail behavior so the regression cannot
// recur.
// ---------------------------------------------------------------------------

describe('PT-12458 regression — release-branch hard-fail (assert-not-default)', () => {
    test('on ENG-1428--release with ENG_PT_PREFERENCES, assert-not-default hard-fails on-guarded', async () => {
        gitState.currentBranch = 'ENG-1428--release'
        gitState.defaultBranch = 'main'
        mockLoadPrefs.mockReturnValue(ENG_PT_PREFERENCES)
        const r = await call({ action: 'assert-not-default' })
        expect(r.ok).toBe(false)
        expect(r.status).toBe('on-guarded')
    })
})
