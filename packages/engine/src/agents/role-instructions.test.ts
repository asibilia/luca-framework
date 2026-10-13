import { describe, expect, test } from 'bun:test'

import { roleInstructions } from './role-instructions'

import { EngineConfigSchema } from '../config/engine-config'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

describe('instructions with several test commands', () => {
    const config = EngineConfigSchema.parse({
        ...PRACTICE_ENGINE_CONFIG,
        checks: {
            ...PRACTICE_ENGINE_CONFIG.checks,
            test: [
                'bun test src',
                { run: 'bun run test:workers', results: 'pass_fail' },
            ],
        },
    })

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

describe("the test-writer's outcomes (#484)", () => {
    const text = roleInstructions({
        role: 'test-writer',
        may_edit_tests: true,
        config: PRACTICE_ENGINE_CONFIG,
    })

    test('"already_done" is only for a ticket whose every criterion is met and tested on the base branch, with the commits', () => {
        expect(text).toContain('"already_done"')
        expect(text).toContain(
            'only when EVERY acceptance criterion is already met on the base branch and already has a test'
        )
        expect(text).toContain('"done_by"')
    })

    test('"nothing_new_to_test" stays for a ticket that changes no behavior', () => {
        expect(text).toContain(
            '"nothing_new_to_test" if the ticket truly changes no behavior (a refactor)'
        )
    })
})

describe("the integration lens's instructions (#513)", () => {
    const lens = (role: 'integration-lens' | 'security-lens') =>
        roleInstructions({
            role,
            may_edit_tests: false,
            config: PRACTICE_ENGINE_CONFIG,
        })

    test('ask for a summary picture and the merge danger on the first round', () => {
        const text = lens('integration-lens')
        expect(text).toContain('summary_picture')
        expect(text).toContain('merge_danger')
        expect(text).toContain('one-way door')
        expect(text).toContain('blast_radius')
    })

    test('give null for both on a re-review', () => {
        expect(lens('integration-lens')).toMatch(
            /re-review[^\n]*null[^\n]*summary_picture|re-review[^\n]*summary_picture[^\n]*null/
        )
    })

    test('the other lenses are not asked for them', () => {
        const text = lens('security-lens')
        expect(text).not.toContain('summary_picture')
        expect(text).not.toContain('merge_danger')
    })
})
