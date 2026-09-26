import { describe, expect, test } from 'bun:test'

import { roleInstructions } from './role-instructions'

import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

describe('instructions with several test commands', () => {
    const config = {
        ...PRACTICE_ENGINE_CONFIG,
        checks: {
            ...PRACTICE_ENGINE_CONFIG.checks,
            test: [
                'bun test src',
                { run: 'bun run test:workers', results: 'pass_fail' },
            ],
        },
    } as unknown as Parameters<typeof roleInstructions>[0]['config']

    test('let writers run each test command, with options only after a bun one', () => {
        for (const role of ['test-writer', 'implementer'] as const) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config,
            })
            expect(text).toContain(
                '- `bun test src` (you may add test files or options after it)'
            )
            expect(text).toContain('- `bun run test:workers`\n')
            expect(text).not.toContain(
                '`bun run test:workers` (you may add test files or options after it)'
            )
        }
    })

    test("name every test command among the implementer's gates", () => {
        const text = roleInstructions({
            role: 'implementer',
            may_edit_tests: false,
            config,
        })
        expect(text).toMatch(
            /Make every gate pass: [^\n]*`bun test src`[^\n]*`bun run test:workers`/
        )
    })
})

describe("the learner's instructions", () => {
    const learner = () =>
        roleInstructions({
            role: 'learner',
            may_edit_tests: false,
            config: PRACTICE_ENGINE_CONFIG,
        })

    test('ask for each memory’s scope, "repo" or "anywhere", by whether it would help in a completely different repo', () => {
        const text = learner()
        expect(text).toContain('"repo"')
        expect(text).toContain('"anywhere"')
        expect(text).toContain('useful in a completely different repo')
    })

    test('name the scope in the structured result', () => {
        expect(learner()).toMatch(
            /Your result \(structured output\):[^\n]*scope/
        )
    })
})
