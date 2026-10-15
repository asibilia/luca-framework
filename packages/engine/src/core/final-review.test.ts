import { describe, expect, test } from 'bun:test'

import { rulePath } from './execute-final-review'

import { roleInstructions } from '../agents/role-instructions'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

/**
 * Final review pieces that need no practice repo, so they run with the fast
 * tests (#568). The review itself, end to end, is in
 * `final-review.e2e.test.ts`.
 */

describe('where a rule file is read', () => {
    test('in the run branch worktree, under home for ~/, and as is when absolute', () => {
        const where = (path: string) =>
            rulePath({ path, worktree: '/run/branch', home: '/home/me' })

        expect(where('AGENTS.md')).toBe('/run/branch/AGENTS.md')
        expect(where('docs/rules.md')).toBe('/run/branch/docs/rules.md')
        expect(where('~/.claude/rules/no-classes.md')).toBe(
            '/home/me/.claude/rules/no-classes.md'
        )
        expect(where('/etc/luca/rules.md')).toBe('/etc/luca/rules.md')
    })
})

describe("final review agents' instructions", () => {
    test('a fixer with no messaging is not told about agent messages', () => {
        const config = { ...PRACTICE_ENGINE_CONFIG, muninn: undefined }
        const told = (messaging?: boolean) =>
            roleInstructions({
                role: 'implementer',
                may_edit_tests: false,
                config,
                messaging,
            }).includes('## Agent messages')

        expect(told()).toBe(true)
        expect(told(false)).toBe(false)
        expect(
            roleInstructions({
                role: 'security-lens',
                may_edit_tests: false,
                config,
            }).includes('## Agent messages')
        ).toBe(false)
    })
})
