import { describe, expect, test } from 'bun:test'

import { roleInstructions } from './role-instructions'
import { AgentRoleSchema } from './role-results'

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

test("the implementer's gate line names the slow command and says it runs at the final review (#563)", () => {
    const config = EngineConfigSchema.parse({
        checks: {
            test: 'bun test src',
            slow_test: 'bun test .e2e.test',
            types: 'tsc',
        },
    })
    const text = roleInstructions({
        role: 'implementer',
        may_edit_tests: false,
        config,
    })
    expect(text).toContain('Make every gate pass: `bun test src`, `tsc`.')
    expect(text).toContain(
        "The slow tests (`bun test .e2e.test`) run at the final review, and the ticket's gates also run the slow test files it added or changed; you may run them yourself."
    )
})

test("the implementer's prompt names the fast test limit and the bad_test way out (#580)", () => {
    const config = EngineConfigSchema.parse({
        checks: { test: 'bun test' },
        test_case_timeout_ms: 2000,
    })
    const text = roleInstructions({
        role: 'implementer',
        may_edit_tests: false,
        config,
    })
    expect(text).toContain(
        'Each fast test must finish within 2000 ms. If one of the ticket\'s tests can\'t, answer "bad_test".'
    )
    // One bullet per line: the limit line sits right after the gate line.
    expect(text).toMatch(/Make every gate pass: [^\n]*\n- Each fast test/)
})

test('left out, the implementer prompt has no limit line and no blank line (#580)', () => {
    const config = EngineConfigSchema.parse({ checks: { test: 'bun test' } })
    const text = roleInstructions({
        role: 'implementer',
        may_edit_tests: false,
        config,
    })
    expect(text).not.toContain('Each fast test must finish')
    expect(text).toMatch(/Make every gate pass: [^\n]*\n- Never create/)
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

describe('the test-writer and the per-criterion cap (#581)', () => {
    test('is told the cap, and to map every test it adds', () => {
        const text = roleInstructions({
            role: 'test-writer',
            may_edit_tests: true,
            config: PRACTICE_ENGINE_CONFIG,
        })
        expect(text).toContain(
            'Every acceptance criterion needs at least one test, and at most 3: write the fewest tests that prove it.'
        )
        expect(text).toContain(
            "Map every test you add. The red check refuses a new test your criterion mapping doesn't name."
        )
    })
})

describe('the test-writer and the feature map (#583)', () => {
    const withMap = EngineConfigSchema.parse({
        checks: { test: 'bun test' },
        feature_map: 'docs/feature-map.md',
    })

    test('is told to read the feature map first and list a new test file in it', () => {
        const text = roleInstructions({
            role: 'test-writer',
            may_edit_tests: true,
            config: withMap,
        })
        expect(text).toContain(
            'Read docs/feature-map.md first: it lists each feature and the test files that prove it.'
        )
        expect(text).toContain(
            "Put new tests in a feature's existing test files when you can. A new test file must be listed under its feature in docs/feature-map.md; you may edit that file."
        )
    })

    test('may edit the map, so the "only test files" line names it too', () => {
        const text = roleInstructions({
            role: 'test-writer',
            may_edit_tests: true,
            config: withMap,
        })
        expect(text).toContain(
            'Create or edit ONLY test files (**/*.test.ts) and the feature map docs/feature-map.md.'
        )
    })

    test.each([['./docs/feature-map.md'], ['docs//feature-map.md']])(
        'a map spelled %s is named by its clean path',
        (spelled) => {
            const text = roleInstructions({
                role: 'test-writer',
                may_edit_tests: true,
                config: EngineConfigSchema.parse({
                    checks: { test: 'bun test' },
                    feature_map: spelled,
                }),
            })
            expect(text).toContain('Read docs/feature-map.md first:')
            expect(text).toContain(
                'listed under its feature in docs/feature-map.md; you may edit that file.'
            )
            expect(text).toContain(
                ' and the feature map docs/feature-map.md. No other file:'
            )
            expect(text).not.toContain(spelled)
        }
    )

    test('without a feature map, the test-writer is not told about one', () => {
        const text = roleInstructions({
            role: 'test-writer',
            may_edit_tests: true,
            config: PRACTICE_ENGINE_CONFIG,
        })
        expect(text).not.toContain('feature map')
        expect(text).toContain(
            'Create or edit ONLY test files (src/**/*.test.ts). No other file:'
        )
    })
})

describe('the test-writer and a feature map folder (#597)', () => {
    test("names the folder, says to read its pages first, and to list a new test file on its area's page", () => {
        const text = roleInstructions({
            role: 'test-writer',
            may_edit_tests: true,
            config: EngineConfigSchema.parse({
                checks: { test: 'bun test' },
                feature_map: 'docs/feature-map',
            }),
        })
        expect(text).toContain('docs/feature-map')
        expect(text).not.toContain('docs/feature-map.md')
        expect(text).toMatch(/pages[^\n]*first/)
        expect(text).toContain("area's page")
    })
})

describe('helpers (#627)', () => {
    test("every role's instructions have a helpers section: the searcher, when it's worth it, that it only reads, and the limit of 3", () => {
        for (const role of AgentRoleSchema.options) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config: PRACTICE_ENGINE_CONFIG,
            })
            const section =
                text
                    .split(/^(?=## )/m)
                    .find((part) => /^## Helpers/.test(part)) ?? ''

            expect(section).toContain('searcher')
            expect(section).toContain('callers')
            expect(section).toMatch(/only read|read-only/i)
            expect(section).toMatch(/\b3\b/)
        }
    })
})
