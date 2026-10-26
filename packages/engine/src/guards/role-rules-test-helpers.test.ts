import { describe, expect, test } from 'bun:test'

import { mayWrite, permissionRules, type GuardRole } from './role-rules'
import { sandboxSettings } from './sandbox-settings'

import { EngineConfigSchema, type EngineConfig } from '../config/engine-config'

/**
 * The guard and test helpers (#619): with `test_helper_patterns`, the
 * test-writer may also write matching non-test files, such as shared fakes
 * and fixtures, and still nothing else outside test files and the feature
 * map. The implementer's rights don't change. Pure.
 */

const CONFIG: EngineConfig = EngineConfigSchema.parse({
    checks: { test: 'bun test' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/testing/setup.ts'],
    feature_map: 'docs/feature-map',
})

/** `CONFIG` with test helpers under any `testing` folder of `src`. */
const WITH_HELPERS: EngineConfig = EngineConfigSchema.parse({
    ...CONFIG,
    test_helper_patterns: ['src/**/testing/**'],
})

const SANDBOX_PATHS = {
    worktree: '/runs/run-1/tickets/11',
    common_git_dir: '/repo/.git',
    home: '/home/owner',
    user_temp_dir: null,
}

describe('the guard and test_helper_patterns (#619)', () => {
    test('the test-writer may write a file matching a helper pattern, and still nothing else outside test files and the feature map', () => {
        // [role, may_edit_tests, path, allowed]
        const cases: [GuardRole, boolean, string, boolean][] = [
            ['test-writer', true, 'src/testing/fake-clock.ts', true],
            ['test-writer', true, './src/testing/fake-clock.ts', true],
            ['test-writer', true, 'src/app/testing/fixtures/spec.md', true],
            ['test-writer', true, 'src/sum.test.ts', true],
            ['test-writer', true, 'docs/feature-map/guards.md', true],
            ['test-writer', true, 'src/sum.ts', false],
            ['test-writer', true, 'src/testing-old/fake.ts', false],
            ['test-writer', true, 'testing/fake.ts', false],
            ['test-writer', true, 'package.json', false],
            // A test setup file stays no role's, even inside a helper folder.
            ['test-writer', true, 'src/testing/setup.ts', false],
            ['test-writer', false, 'src/testing/fake-clock.ts', false],
            ['reviewer', false, 'src/testing/fake-clock.ts', false],
            ['learner', false, 'src/testing/fake-clock.ts', false],
        ]
        const wrong = cases.filter(
            ([role, may_edit_tests, path, allowed]) =>
                mayWrite({
                    role,
                    may_edit_tests,
                    path,
                    config: WITH_HELPERS,
                }) !== allowed
        )
        expect(wrong).toEqual([])
        // Left out, a helper path is the test-writer's no more than today.
        expect(
            mayWrite({
                role: 'test-writer',
                may_edit_tests: true,
                path: 'src/testing/fake-clock.ts',
                config: CONFIG,
            })
        ).toBe(false)
    })

    test("the test-writer's permission rules allow each helper pattern, in the same form as its test globs, only when it may edit tests", () => {
        const writer = permissionRules({
            role: 'test-writer',
            may_edit_tests: true,
            config: WITH_HELPERS,
        })
        expect(writer.allowed).toContain('Edit(src/**/*.test.ts)')
        expect(writer.allowed).toContain('Edit(src/**/testing/**)')
        expect(writer.disallowed).toContain('Edit(src/testing/setup.ts)')
        const noEdit = permissionRules({
            role: 'test-writer',
            may_edit_tests: false,
            config: WITH_HELPERS,
        })
        expect(noEdit.allowed).not.toContain('Edit(src/**/testing/**)')
    })

    test("the implementer's write rules, permission rules, and sandbox are the same with helper patterns as without, while the test-writer's change", () => {
        for (const may_edit_tests of [false, true]) {
            for (const path of [
                'src/testing/fake-clock.ts',
                'src/sum.test.ts',
                'src/testing/setup.ts',
                'src/sum.ts',
            ]) {
                expect(
                    mayWrite({
                        role: 'implementer',
                        may_edit_tests,
                        path,
                        config: WITH_HELPERS,
                    })
                ).toBe(
                    mayWrite({
                        role: 'implementer',
                        may_edit_tests,
                        path,
                        config: CONFIG,
                    })
                )
            }
            expect(
                permissionRules({
                    role: 'implementer',
                    may_edit_tests,
                    config: WITH_HELPERS,
                })
            ).toEqual(
                permissionRules({
                    role: 'implementer',
                    may_edit_tests,
                    config: CONFIG,
                })
            )
            expect(
                sandboxSettings({
                    role: 'implementer',
                    may_edit_tests,
                    ...SANDBOX_PATHS,
                    config: WITH_HELPERS,
                })
            ).toEqual(
                sandboxSettings({
                    role: 'implementer',
                    may_edit_tests,
                    ...SANDBOX_PATHS,
                    config: CONFIG,
                })
            )
        }
        // The setting is in effect: the test-writer's rules do change.
        expect(
            permissionRules({
                role: 'test-writer',
                may_edit_tests: true,
                config: WITH_HELPERS,
            })
        ).not.toEqual(
            permissionRules({
                role: 'test-writer',
                may_edit_tests: true,
                config: CONFIG,
            })
        )
    })
})
