import { describe, expect, test } from 'bun:test'

import { isToolAllowed, type ToolCategory } from './is-tool-allowed.ts'

import type { CoarsePhase } from '../schemas.ts'

describe('isToolAllowed — matrix coverage', () => {
    // IDLE is permissive — no enforcement. Every category allowed.
    test.each<ToolCategory>([
        'code-write',
        'planning-write-general',
        'planning-write-audit',
        'bash-readonly',
        'bash-mutate',
        'bash-commit',
    ])('IDLE allows %s', (cat) => {
        expect(isToolAllowed({ phase: 'IDLE', category: cat })).toBe(true)
    })

    // PLANNING: planning writes + read-only bash only. No code writes,
    // no bash mutation, no commits.
    const planningExpect: Record<ToolCategory, boolean> = {
        'code-write': false,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-mutate': false,
        'bash-commit': false,
        'luca-write': true,
    }
    for (const [cat, expected] of Object.entries(planningExpect)) {
        test(`PLANNING ${expected ? 'allows' : 'blocks'} ${cat}`, () => {
            expect(
                isToolAllowed({
                    phase: 'PLANNING',
                    category: cat as ToolCategory,
                })
            ).toBe(expected)
        })
    }

    // EXECUTING: everything except commits.
    const executingExpect: Record<ToolCategory, boolean> = {
        'code-write': true,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-mutate': true,
        'bash-commit': false,
        'luca-write': true,
    }
    for (const [cat, expected] of Object.entries(executingExpect)) {
        test(`EXECUTING ${expected ? 'allows' : 'blocks'} ${cat}`, () => {
            expect(
                isToolAllowed({
                    phase: 'EXECUTING',
                    category: cat as ToolCategory,
                })
            ).toBe(expected)
        })
    }

    // REVIEWING: only audit writes + read-only bash. NOT general .luca/
    // writes (reviewers must use the MCP audit tool).
    const reviewingExpect: Record<ToolCategory, boolean> = {
        'code-write': false,
        'planning-write-general': false,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-mutate': false,
        'bash-commit': false,
        'luca-write': true,
    }
    for (const [cat, expected] of Object.entries(reviewingExpect)) {
        test(`REVIEWING ${expected ? 'allows' : 'blocks'} ${cat}`, () => {
            expect(
                isToolAllowed({
                    phase: 'REVIEWING',
                    category: cat as ToolCategory,
                })
            ).toBe(expected)
        })
    }

    // FINALIZING: planning writes + read-only bash + commit.
    const finalizingExpect: Record<ToolCategory, boolean> = {
        'code-write': false,
        'planning-write-general': true,
        'planning-write-audit': true,
        'bash-readonly': true,
        'bash-mutate': false,
        'bash-commit': true,
        'luca-write': true,
    }
    for (const [cat, expected] of Object.entries(finalizingExpect)) {
        test(`FINALIZING ${expected ? 'allows' : 'blocks'} ${cat}`, () => {
            expect(
                isToolAllowed({
                    phase: 'FINALIZING',
                    category: cat as ToolCategory,
                })
            ).toBe(expected)
        })
    }
})

describe('isToolAllowed — sanity', () => {
    test('every (phase, category) returns a deterministic boolean', () => {
        const phases: CoarsePhase[] = [
            'IDLE',
            'PLANNING',
            'EXECUTING',
            'REVIEWING',
            'FINALIZING',
        ]
        const cats: ToolCategory[] = [
            'code-write',
            'planning-write-general',
            'planning-write-audit',
            'bash-readonly',
            'bash-mutate',
            'bash-commit',
        ]
        for (const phase of phases) {
            for (const category of cats) {
                const r = isToolAllowed({ phase, category })
                expect(typeof r).toBe('boolean')
            }
        }
    })
})
