import { describe, expect, test } from 'bun:test'

import { mayWrite, permissionRules, type GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'

/**
 * The guard and a feature map folder (#597): the test-writer may write any
 * `*.md` page under it, and nothing else besides test files. Pure.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
}

/** `CONFIG` with a feature map folder. */
const WITH_FOLDER: EngineConfig = { ...CONFIG, feature_map: 'docs/feature-map' }

describe('the guard and a feature map folder (#597)', () => {
    test('the test-writer may write any *.md page under the folder, and not a file outside it; other roles are unchanged', () => {
        // [role, may_edit_tests, path, allowed]
        const cases: [GuardRole, boolean, string, boolean][] = [
            ['test-writer', true, 'docs/feature-map/index.md', true],
            ['test-writer', true, 'docs/feature-map/guards.md', true],
            ['test-writer', true, './docs/feature-map/guards.md', true],
            ['test-writer', true, 'docs/feature-map/areas/board.md', true],
            ['test-writer', true, 'src/sum.test.ts', true],
            ['test-writer', true, 'docs/feature-map/notes.txt', false],
            ['test-writer', true, 'docs/feature-map', false],
            ['test-writer', true, 'docs/feature-map.md', false],
            ['test-writer', true, 'docs/feature-map-old/guards.md', false],
            ['test-writer', true, 'docs/other.md', false],
            ['test-writer', true, 'src/sum.ts', false],
            ['test-writer', false, 'docs/feature-map/guards.md', false],
            ['implementer', false, 'docs/feature-map/guards.md', true],
            ['implementer', false, 'src/sum.test.ts', false],
            ['reviewer', false, 'docs/feature-map/guards.md', false],
            ['learner', false, 'docs/feature-map/guards.md', false],
        ]
        const wrong = cases.filter(
            ([role, may_edit_tests, path, allowed]) =>
                mayWrite({
                    role,
                    may_edit_tests,
                    path,
                    config: WITH_FOLDER,
                }) !== allowed
        )
        expect(wrong).toEqual([])
    })

    test("the test-writer's permission rules allow the folder's *.md pages, in the same form as its test globs", () => {
        const writer = permissionRules({
            role: 'test-writer',
            may_edit_tests: true,
            config: WITH_FOLDER,
        })
        expect(writer.allowed).toContain('Edit(src/**/*.test.ts)')
        expect(writer.allowed).toContain('Edit(docs/feature-map/**/*.md)')
        expect(writer.allowed).not.toContain('Edit(docs/feature-map)')
        const noEdit = permissionRules({
            role: 'test-writer',
            may_edit_tests: false,
            config: WITH_FOLDER,
        })
        expect(noEdit.allowed).not.toContain('Edit(docs/feature-map/**/*.md)')
    })
})
