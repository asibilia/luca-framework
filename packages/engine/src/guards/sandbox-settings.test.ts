import { describe, expect, test } from 'bun:test'

import { sandboxSettings } from './sandbox-settings'

import type { EngineConfig } from '../config/engine-config'

/** Seam 3: the sandbox each role runs in. Pure: the caller resolves paths. */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['src/**/*.test.ts', 'test/**/*.ts'],
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
}

const PATHS = {
    worktree: '/private/var/runs/run-1/tickets/11',
    common_git_dir: '/Users/me/code/app/.git',
    home: '/Users/me',
}

const DENY_READ = [
    '/Users/me/.claude.json',
    '/Users/me/.claude',
    '/Users/me/.paseo',
    '/Users/me/.ssh',
    '/Users/me/.config/gh',
]

describe('sandboxSettings', () => {
    test('every role: on, fails if unavailable, no auto-allow, no network, no local ports', () => {
        for (const role of [
            'test-writer',
            'implementer',
            'reviewer',
            'learner',
        ] as const) {
            const sandbox = sandboxSettings({
                role,
                may_edit_tests: role === 'test-writer',
                config: CONFIG,
                ...PATHS,
            })
            expect(sandbox).toMatchObject({
                enabled: true,
                failIfUnavailable: true,
                autoAllowBashIfSandboxed: false,
                allowUnsandboxedCommands: false,
                network: {
                    allowedDomains: [],
                    strictAllowlist: true,
                    allowLocalBinding: false,
                },
            })
            expect(sandbox.filesystem?.denyRead).toEqual(DENY_READ)
        }
    })

    test('the test-writer may not write git or test setup files', () => {
        expect(
            sandboxSettings({
                role: 'test-writer',
                may_edit_tests: true,
                config: CONFIG,
                ...PATHS,
            }).filesystem?.denyWrite
        ).toEqual([
            '/Users/me/code/app/.git',
            '/private/var/runs/run-1/tickets/11/.git',
            '/private/var/runs/run-1/tickets/11/src/test-setup.ts',
        ])
    })

    test('a test-writer that may not edit tests may not write the worktree', () => {
        expect(
            sandboxSettings({
                role: 'test-writer',
                may_edit_tests: false,
                config: CONFIG,
                ...PATHS,
            }).filesystem?.denyWrite
        ).toEqual([
            '/Users/me/code/app/.git',
            '/private/var/runs/run-1/tickets/11/.git',
            '/private/var/runs/run-1/tickets/11',
        ])
    })

    test('a refactor implementer may write test files, but not git or test setup files', () => {
        expect(
            sandboxSettings({
                role: 'implementer',
                may_edit_tests: true,
                config: CONFIG,
                ...PATHS,
            }).filesystem?.denyWrite
        ).toEqual([
            '/Users/me/code/app/.git',
            '/private/var/runs/run-1/tickets/11/.git',
            '/private/var/runs/run-1/tickets/11/src/test-setup.ts',
        ])
    })

    test('the implementer may not write git, test files, or test setup files', () => {
        expect(
            sandboxSettings({
                role: 'implementer',
                may_edit_tests: false,
                config: CONFIG,
                ...PATHS,
            }).filesystem?.denyWrite
        ).toEqual([
            '/Users/me/code/app/.git',
            '/private/var/runs/run-1/tickets/11/.git',
            '/private/var/runs/run-1/tickets/11/src/**/*.test.ts',
            '/private/var/runs/run-1/tickets/11/test/**/*.ts',
            '/private/var/runs/run-1/tickets/11/src/test-setup.ts',
        ])
    })

    test('reviewers and the learner may not write the worktree at all', () => {
        for (const role of ['reviewer', 'learner'] as const) {
            expect(
                sandboxSettings({
                    role,
                    may_edit_tests: true,
                    config: CONFIG,
                    ...PATHS,
                }).filesystem?.denyWrite
            ).toEqual([
                '/Users/me/code/app/.git',
                '/private/var/runs/run-1/tickets/11/.git',
                '/private/var/runs/run-1/tickets/11',
            ])
        }
    })

    test('refuses relative paths, which the sandbox does not hold on macOS', () => {
        expect(() =>
            sandboxSettings({
                role: 'implementer',
                may_edit_tests: false,
                config: CONFIG,
                ...PATHS,
                worktree: 'tickets/11',
            })
        ).toThrow('absolute')
    })
})
