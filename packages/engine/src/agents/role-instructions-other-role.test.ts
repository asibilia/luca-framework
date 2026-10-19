import { describe, expect, test } from 'bun:test'

import { roleInstructions } from './role-instructions'

import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

describe("the fixers' instructions on other_role (#616)", () => {
    test('both writers are told when to answer "other_role", and no longer that test findings go to a fresh test-writer', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config: PRACTICE_ENGINE_CONFIG,
            })
            const start = text.indexOf('## Fixing review findings')
            expect(start).toBeGreaterThan(-1)
            const end = text.indexOf('\n## ', start)
            const section = text.slice(start, end === -1 ? undefined : end)
            expect(section).toContain('"other_role"')
            expect(section).toContain('test')
            expect(section).toContain('helper')
            expect(text).not.toContain(
                'Test findings go to a fresh test-writer; code findings to the implementer.'
            )
        }
    })
})
