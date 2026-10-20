import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { roleInstructions } from './role-instructions'
import { AgentRoleSchema } from './role-results'

import { EngineConfigSchema } from '../config/engine-config'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

/** The text of the section headed `heading`, up to the next `## ` heading. */
const sectionOf = ({
    text,
    heading,
}: {
    text: string
    heading: string
}): string | undefined =>
    text.split(/^(?=## )/m).find((part) => part.startsWith(`${heading}\n`))

const withRules = (rule_files: string[]) =>
    EngineConfigSchema.parse({ ...PRACTICE_ENGINE_CONFIG, rule_files })

/** Each writer, as a ticket's agent and as a final review fixer. */
const WRITERS = [
    { role: 'test-writer', may_edit_tests: true, messaging: true },
    { role: 'test-writer', may_edit_tests: true, messaging: false },
    { role: 'implementer', may_edit_tests: false, messaging: true },
    { role: 'implementer', may_edit_tests: false, messaging: false },
] as const

describe('the writers and the repo rules (#646)', () => {
    test('the test-writer and the implementer, as fixers too, get a Repo rules section that lists each rule file and says to read and follow them first', () => {
        const config = withRules([
            'AGENTS.md',
            'docs/guides/coding-standards.md',
        ])
        for (const writer of WRITERS) {
            const text = roleInstructions({ ...writer, config })
            const section = sectionOf({ text, heading: '## Repo rules' })
            expect(section).toBeDefined()
            expect(section).toContain('AGENTS.md')
            expect(section).toContain('docs/guides/coding-standards.md')
            expect(section).toMatch(/read[^\n]*before/i)
            expect(section).toMatch(/follow/i)
        }
    })

    test('the Repo rules section comes only with rule files: with none, no writer gets it', () => {
        for (const writer of WRITERS) {
            const named = roleInstructions({
                ...writer,
                config: withRules(['AGENTS.md']),
            })
            const none = roleInstructions({
                ...writer,
                config: withRules([]),
            })
            expect(named).toContain('## Repo rules')
            expect(none).not.toContain('## Repo rules')
        }
    })

    test("the rule files are named, and their contents aren't pasted in", () => {
        const folder = mkdtempSync(join(tmpdir(), 'luca-repo-rules-'))
        const path = join(folder, 'RULES.md')
        writeFileSync(path, 'Every function name ends in Zebrafinch.\n')
        for (const writer of WRITERS) {
            const text = roleInstructions({
                ...writer,
                config: withRules([path]),
            })
            expect(text).toContain(path)
            expect(text).not.toContain('Zebrafinch')
        }
    })
})

describe('every role and its sandbox (#646)', () => {
    test("every role's instructions, the learner's included, have a Your sandbox section on the gates, what it blocks, and failures only it causes", () => {
        for (const role of AgentRoleSchema.options) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config: PRACTICE_ENGINE_CONFIG,
            })
            const section = sectionOf({ text, heading: '## Your sandbox' })
            expect(section).toBeDefined()
            const said = section ?? ''
            // The gates run outside the sandbox, and their results come back.
            expect(said).toMatch(/gates \(tests, types, lint\)/)
            expect(said).toContain('outside your sandbox')
            expect(said).toMatch(/results/)
            // What it blocks.
            for (const blocked of [
                'network',
                'local ports',
                'outside your worktree',
                'git internals',
                'node_modules',
                'lockfiles',
                'test setup files',
                'test files for roles that may not edit them',
                'secret files',
            ])
                expect(said).toContain(blocked)
            // A failure only the sandbox causes isn't the agent's to fix.
            expect(said).toMatch(/fails only inside your sandbox/)
            expect(said).toMatch(/(isn't|is not) yours to fix/)
            expect(said).toMatch(/rely on the engine's gate results/i)
        }
    })
})
