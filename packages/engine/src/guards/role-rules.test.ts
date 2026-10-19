import { describe, expect, test } from 'bun:test'

import {
    checkToolCall,
    guardRoleOf,
    mayWrite,
    type GuardRole,
} from './role-rules'
import { CONFIG, WITH_MAP, WORKTREE, decide } from './role-rules-helpers'

/** Seam 3: the guard rules, table by table. Pure: no files, no git. */

describe('guardRoleOf', () => {
    test('maps each agent role to its guard role', () => {
        expect(guardRoleOf({ role: 'test-writer' })).toBe('test-writer')
        expect(guardRoleOf({ role: 'implementer' })).toBe('implementer')
        expect(guardRoleOf({ role: 'ticket-reviewer' })).toBe('reviewer')
    })
})

describe('mayWrite', () => {
    // [role, may_edit_tests, path, allowed]
    const cases: [GuardRole, boolean, string, boolean][] = [
        ['test-writer', true, 'src/sum.test.ts', true],
        ['test-writer', true, 'src/deep/a/b.test.ts', true],
        ['test-writer', true, 'src/sum.ts', false],
        ['test-writer', true, 'README.md', false],
        ['test-writer', true, 'src/test-setup.ts', false],
        // The feature map, when one is configured (#583).
        ['test-writer', true, 'docs/feature-map.md', true],
        ['test-writer', true, 'docs/other.md', false],
        ['test-writer', false, 'docs/feature-map.md', false],
        // A test-writer that may not edit tests writes nothing.
        ['test-writer', false, 'src/sum.test.ts', false],
        ['implementer', false, 'src/sum.ts', true],
        ['implementer', false, 'package.json', true],
        ['implementer', false, 'src/sum.test.ts', false],
        ['implementer', false, 'src/test-setup.ts', false],
        ['implementer', false, '.git', false],
        ['implementer', false, '.git/config', false],
        ['implementer', false, '../other/src/sum.ts', false],
        ['implementer', false, 'src/../../escape.ts', false],
        ['implementer', false, '/etc/passwd', false],
        // A refactor ticket's implementer may follow renames into tests,
        // but never into a test setup file.
        ['implementer', true, 'src/a.test.ts', true],
        ['implementer', true, 'src/sum.ts', true],
        ['implementer', true, 'src/test-setup.ts', false],
        ['implementer', true, '.git/config', false],
        ['reviewer', false, 'src/sum.ts', false],
        ['reviewer', false, 'src/sum.test.ts', false],
        // Reviewers never write, whatever they are told.
        ['reviewer', true, 'src/sum.test.ts', false],
        ['reviewer', true, 'src/sum.ts', false],
        ['learner', false, 'src/sum.ts', false],
        ['learner', false, 'notes.md', false],
        // What the package install writes belongs to the engine: no role
        // writes a lockfile or anything under node_modules.
        ['implementer', false, 'bun.lock', false],
        ['implementer', true, 'bun.lockb', false],
        ['implementer', false, 'packages/app/package-lock.json', false],
        ['implementer', false, 'yarn.lock', false],
        ['implementer', false, 'pnpm-lock.yaml', false],
        ['implementer', false, 'node_modules/zod/index.js', false],
        ['implementer', true, 'packages/app/node_modules/x/a.js', false],
        ['test-writer', true, 'node_modules/x/a.test.ts', false],
        ['implementer', false, 'src/node_modules_notes.ts', true],
    ]
    test.each(cases)(
        '%s (may edit tests: %p) writing %s: %p',
        (role, may_edit_tests, path, expected) => {
            expect(
                mayWrite({ role, may_edit_tests, path, config: WITH_MAP })
            ).toBe(expected)
        }
    )

    test.each([
        ['./docs/feature-map.md'],
        ['docs//feature-map.md'],
        ['docs/../docs/feature-map.md'],
    ])(
        'a feature map spelled %s still lets the test-writer write docs/feature-map.md (#583)',
        (spelled) => {
            const config = { ...CONFIG, feature_map: spelled }
            for (const path of [
                'docs/feature-map.md',
                './docs/feature-map.md',
                'docs//feature-map.md',
            ]) {
                expect(
                    mayWrite({
                        role: 'test-writer',
                        may_edit_tests: true,
                        path,
                        config,
                    })
                ).toBe(true)
            }
            expect(
                mayWrite({
                    role: 'test-writer',
                    may_edit_tests: true,
                    path: 'docs/other.md',
                    config,
                })
            ).toBe(false)
        }
    )

    test('without a feature map, the test-writer may not write the map path (#583)', () => {
        expect(
            mayWrite({
                role: 'test-writer',
                may_edit_tests: true,
                path: 'docs/feature-map.md',
                config: CONFIG,
            })
        ).toBe(false)
    })
})

describe('checkToolCall: file tools', () => {
    const cases: [GuardRole, string, unknown, boolean][] = [
        ['test-writer', 'Write', { file_path: 'src/sum.test.ts' }, true],
        [
            'test-writer',
            'Write',
            { file_path: `${WORKTREE}/src/sum.test.ts` },
            true,
        ],
        [
            'test-writer',
            'Edit',
            { file_path: `${WORKTREE}/src/sum.test.ts` },
            true,
        ],
        ['test-writer', 'Write', { file_path: 'src/sum.ts' }, false],
        ['test-writer', 'Edit', { file_path: `${WORKTREE}/src/sum.ts` }, false],
        ['implementer', 'Write', { file_path: 'src/sum.test.ts' }, false],
        ['implementer', 'Edit', { file_path: 'src/test-setup.ts' }, false],
        ['implementer', 'Write', { file_path: 'src/sum.ts' }, true],
        ['implementer', 'Write', { file_path: `${WORKTREE}/src/sum.ts` }, true],
        ['reviewer', 'Write', { file_path: 'src/sum.ts' }, false],
        ['reviewer', 'Edit', { file_path: 'src/sum.test.ts' }, false],
        ['learner', 'Write', { file_path: 'notes.md' }, false],
        // Paths outside the worktree, or `..` escaping it.
        ['implementer', 'Write', { file_path: '/tmp/x.ts' }, false],
        ['implementer', 'Write', { file_path: '../12/src/sum.ts' }, false],
        [
            'implementer',
            'Write',
            { file_path: `${WORKTREE}/src/../../12/sum.ts` },
            false,
        ],
        ['implementer', 'Write', { file_path: '.git/config' }, false],
        ['implementer', 'Write', {}, false],
        // Reads stay inside the worktree too.
        ['reviewer', 'Read', { file_path: 'src/sum.ts' }, true],
        ['reviewer', 'Read', { file_path: `${WORKTREE}/src/sum.ts` }, true],
        ['learner', 'Read', { file_path: 'src/sum.ts' }, true],
        ['reviewer', 'Read', { file_path: '/Users/me/.ssh/id_rsa' }, false],
        ['reviewer', 'Read', { file_path: '../../journal.jsonl' }, false],
        ['reviewer', 'Grep', { pattern: 'sum' }, true],
        ['reviewer', 'Grep', { pattern: 'sum', path: 'src' }, true],
        ['reviewer', 'Grep', { pattern: 'sum', path: '/etc' }, false],
        ['learner', 'Glob', { pattern: '**/*.ts' }, true],
        ['learner', 'Glob', { pattern: '*', path: '..' }, false],
    ]
    test.each(cases)(
        '%s %s %j: %p',
        (role, tool_name, tool_input, expected) => {
            expect(decide({ role, tool_name, tool_input })).toBe(expected)
        }
    )

    // [role, may_edit_tests, tool, input, allowed]
    const refactorCases: [GuardRole, boolean, string, unknown, boolean][] = [
        ['implementer', true, 'Edit', { file_path: 'src/a.test.ts' }, true],
        [
            'implementer',
            true,
            'Write',
            { file_path: `${WORKTREE}/src/a.test.ts` },
            true,
        ],
        [
            'implementer',
            true,
            'Edit',
            { file_path: 'src/test-setup.ts' },
            false,
        ],
        ['implementer', false, 'Edit', { file_path: 'src/a.test.ts' }, false],
        ['test-writer', false, 'Write', { file_path: 'src/a.test.ts' }, false],
        ['reviewer', true, 'Write', { file_path: 'src/a.test.ts' }, false],
    ]
    test.each(refactorCases)(
        '%s (may edit tests: %p) %s %j: %p',
        (role, may_edit_tests, tool_name, tool_input, expected) => {
            expect(
                decide({ role, may_edit_tests, tool_name, tool_input })
            ).toBe(expected)
        }
    )
})

describe('checkToolCall: other tools', () => {
    const cases: [GuardRole, string, boolean][] = [
        ['implementer', 'mcp__luca__send_message', true],
        ['test-writer', 'mcp__luca__send_message', true],
        // Reviewers and the learner never message, even if handed the tool.
        ['reviewer', 'mcp__luca__send_message', false],
        ['learner', 'mcp__luca__send_message', false],
        ['implementer', 'mcp__muninn__muninn_remember', false],
        ['implementer', 'mcp__paseo__create_agent', false],
        ['implementer', 'WebFetch', false],
        ['implementer', 'WebSearch', false],
        ['implementer', 'Agent', false],
        ['implementer', 'Task', false],
        ['implementer', 'Skill', false],
        ['implementer', 'NotebookEdit', false],
        ['implementer', 'SomeNewTool', false],
        ['reviewer', 'StructuredOutput', true],
        ['learner', 'StructuredOutput', true],
    ]
    test.each(cases)('%s calls %s: %p', (role, tool_name, expected) => {
        expect(decide({ role, tool_name, tool_input: {} })).toBe(expected)
    })

    test('an install is denied because the engine runs it', () => {
        for (const command of ['bun add zod', 'bun test --install=force']) {
            expect(
                checkToolCall({
                    role: 'implementer',
                    may_edit_tests: false,
                    tool_name: 'Bash',
                    tool_input: { command },
                    worktree: WORKTREE,
                    config: CONFIG,
                })
            ).toEqual({
                allow: false,
                reason: expect.stringContaining(
                    'The engine runs the package install'
                ),
            })
        }
    })

    test('a denial says why', () => {
        const decision = checkToolCall({
            role: 'implementer',
            may_edit_tests: false,
            tool_name: 'Bash',
            tool_input: { command: 'git commit -m x' },
            worktree: WORKTREE,
            config: CONFIG,
        })
        expect(decision).toEqual({
            allow: false,
            reason: expect.stringContaining('git commit -m x'),
        })
    })
})
