import { describe, expect, test } from 'bun:test'

import { permissionRules } from './role-rules'
import { CONFIG, WITH_MAP } from './role-rules-helpers'

/** Seam 3: the permission rules each role gets. Pure: no files, no git. */

describe('permissionRules', () => {
    test('a refactor implementer may edit tests but not setup files', () => {
        const refactor = permissionRules({
            role: 'implementer',
            may_edit_tests: true,
            config: CONFIG,
        })
        expect(refactor.allowed).toContain('Edit(**)')
        expect(refactor.disallowed).not.toContain('Edit(src/**/*.test.ts)')
        expect(refactor.disallowed).toContain('Edit(src/test-setup.ts)')
    })

    test('a test-writer that may not edit tests may edit nothing', () => {
        const rules = permissionRules({
            role: 'test-writer',
            may_edit_tests: false,
            config: CONFIG,
        })
        expect(rules.allowed).not.toContain('Edit(src/**/*.test.ts)')
        expect(rules.disallowed).toContain('Edit')
        expect(rules.disallowed).toContain('Write')
    })

    test('no role is pre-approved to install packages', () => {
        for (const role of [
            'test-writer',
            'implementer',
            'reviewer',
            'learner',
        ] as const) {
            const { allowed } = permissionRules({
                role,
                may_edit_tests: role === 'test-writer',
                config: CONFIG,
            })
            expect(
                allowed.filter((rule) =>
                    /^Bash\((bun (install|i|add)|npm|bunx (?!--bun tsc))/.test(
                        rule
                    )
                )
            ).toEqual([])
        }
    })

    test('every role is denied the package install and what it writes', () => {
        for (const role of [
            'test-writer',
            'implementer',
            'reviewer',
            'learner',
        ] as const) {
            for (const may_edit_tests of [true, false]) {
                const { allowed, disallowed } = permissionRules({
                    role,
                    may_edit_tests,
                    config: CONFIG,
                })
                expect(disallowed).toEqual(
                    expect.arrayContaining([
                        'Bash(bun install)',
                        'Bash(bun install *)',
                        'Bash(bun add *)',
                        'Bash(bun remove *)',
                        'Bash(npm *)',
                        'Bash(pnpm *)',
                        'Edit(node_modules/**)',
                        'Edit(**/node_modules/**)',
                        'Edit(bun.lock)',
                        'Edit(**/bun.lock)',
                    ])
                )
                // The type check runs through bunx, so bunx is left to the hook.
                expect(
                    disallowed.filter((rule) => rule.startsWith('Bash(bunx'))
                ).toEqual([])
                if (role === 'implementer') {
                    expect(allowed).toContain('Bash(bunx --bun tsc --noEmit)')
                }
            }
        }
    })

    test('writers are pre-approved for their check commands; reviewers are not', () => {
        const writer = permissionRules({
            role: 'implementer',
            may_edit_tests: false,
            config: CONFIG,
        })
        expect(writer.allowed).toContain('Bash(bun test)')
        expect(writer.allowed).toContain('Bash(bun test *)')
        expect(writer.allowed).toContain('Bash(bunx --bun tsc --noEmit)')
        expect(writer.allowed).toContain('Bash(bun run lint)')
        expect(writer.allowed).toContain('Edit(**)')
        expect(writer.disallowed).toContain('Edit(src/**/*.test.ts)')
        expect(writer.disallowed).toContain('Edit(src/test-setup.ts)')

        const testWriter = permissionRules({
            role: 'test-writer',
            may_edit_tests: true,
            config: CONFIG,
        })
        expect(testWriter.allowed).toContain('Edit(src/**/*.test.ts)')
        expect(testWriter.allowed).not.toContain('Edit(**)')
        // No feature map configured, so no Edit rule for one (#583).
        expect(testWriter.allowed).not.toContain('Edit(docs/feature-map.md)')

        const reviewer = permissionRules({
            role: 'reviewer',
            may_edit_tests: false,
            config: CONFIG,
        })
        expect(reviewer.allowed).not.toContain('Bash(bun test)')
        expect(reviewer.allowed).toContain('Bash(git diff *)')
        expect(reviewer.disallowed).toContain('Write')
        expect(reviewer.disallowed).toContain('Edit')

        const learner = permissionRules({
            role: 'learner',
            may_edit_tests: false,
            config: CONFIG,
        })
        expect(learner.allowed).not.toContain('Bash(bun test)')
        expect(learner.disallowed).toContain('Bash')
        for (const rules of [writer, testWriter, reviewer, learner]) {
            expect(rules.disallowed).toContain('WebFetch')
            expect(rules.disallowed).toContain('Skill')
        }
    })

    test('the test-writer may edit the feature map when one is set, in the same form as its test globs (#583)', () => {
        const withMap = permissionRules({
            role: 'test-writer',
            may_edit_tests: true,
            config: WITH_MAP,
        })
        expect(withMap.allowed).toContain('Edit(src/**/*.test.ts)')
        expect(withMap.allowed).toContain('Edit(docs/feature-map.md)')
        const noEdit = permissionRules({
            role: 'test-writer',
            may_edit_tests: false,
            config: WITH_MAP,
        })
        expect(noEdit.allowed).not.toContain('Edit(docs/feature-map.md)')
        const implementer = permissionRules({
            role: 'implementer',
            may_edit_tests: false,
            config: WITH_MAP,
        })
        expect(implementer.disallowed).not.toContain(
            'Edit(docs/feature-map.md)'
        )
    })

    test.each([['./docs/feature-map.md'], ['docs//feature-map.md']])(
        'a feature map spelled %s gets the clean Edit rule (#583)',
        (spelled) => {
            const { allowed } = permissionRules({
                role: 'test-writer',
                may_edit_tests: true,
                config: { ...CONFIG, feature_map: spelled },
            })
            expect(allowed).toContain('Edit(docs/feature-map.md)')
            expect(allowed).not.toContain(`Edit(${spelled})`)
        }
    )

    test('each role gets only its own tools', () => {
        // Besides `Agent`, which every role may have for helpers (#627).
        const own = (tools: string[]) =>
            tools.filter((tool) => tool !== 'Agent')
        expect(
            own(
                permissionRules({
                    role: 'test-writer',
                    may_edit_tests: true,
                    config: CONFIG,
                }).tools
            )
        ).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'])
        expect(
            own(
                permissionRules({
                    role: 'implementer',
                    may_edit_tests: false,
                    config: CONFIG,
                }).tools
            )
        ).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'])
        expect(
            own(
                permissionRules({
                    role: 'reviewer',
                    may_edit_tests: false,
                    config: CONFIG,
                }).tools
            )
        ).toEqual(['Read', 'Grep', 'Glob', 'Bash'])
        expect(
            own(
                permissionRules({
                    role: 'learner',
                    may_edit_tests: false,
                    config: CONFIG,
                }).tools
            )
        ).toEqual(['Read', 'Grep', 'Glob'])
    })
})
