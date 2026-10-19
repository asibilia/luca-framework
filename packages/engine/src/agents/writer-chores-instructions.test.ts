import { describe, expect, test } from 'bun:test'

import { roleInstructions } from './role-instructions'

import { EngineConfigSchema } from '../config/engine-config'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

/**
 * The writers' prompts describe the two owner chores the engine does for
 * them (#618): file modes, and the repo's named generators.
 */

describe("the writers' prompts and the engine's chores (#618)", () => {
    const config = EngineConfigSchema.parse({
        ...PRACTICE_ENGINE_CONFIG,
        generators: { 'build:parser': 'bun run gen:parser' },
    })

    test('the test-writer and the implementer are told to ask for file modes in "file_modes"', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config,
            })
            expect(text).toContain('file_modes')
            expect(text).toContain('executable')
        }
    })

    test('the test-writer and the implementer are told to ask for the named generators in "run_generators"', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config,
            })
            expect(text).toContain('run_generators')
            expect(text).toContain('build:parser')
        }
    })
})
