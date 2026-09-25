import { describe, expect, test } from 'bun:test'

import { roleInstructions } from './role-instructions'

import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

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
