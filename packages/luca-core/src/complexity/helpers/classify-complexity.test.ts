import { describe, expect, test } from 'bun:test'

import { classifyComplexity } from './classify-complexity.ts'

import type { ClassifyComplexityInput } from '../schemas.ts'

describe('classifyComplexity', () => {
    // Table-driven: one case per score band (TRIVIAL → CRITICAL).
    const cases: Array<[string, ClassifyComplexityInput, string]> = [
        [
            'a typo in one file',
            { taskDescription: 'fix a typo', estimatedFileCount: 1 },
            'TRIVIAL',
        ],
        [
            'a small change with one concern',
            {
                taskDescription: 'add a button',
                estimatedFileCount: 4,
                crossCuttingConcerns: ['ui'],
            },
            'SIMPLE',
        ],
        [
            'a refactor across ten files',
            {
                taskDescription: 'refactor the parser',
                estimatedFileCount: 10,
                crossCuttingConcerns: ['parsing'],
            },
            'MODERATE',
        ],
        [
            'a breaking auth rework across twenty files',
            {
                taskDescription: 'auth rework',
                estimatedFileCount: 20,
                crossCuttingConcerns: ['auth', 'session', 'api'],
                hasBreakingChanges: true,
            },
            'COMPLEX',
        ],
        [
            'a breaking security + database migration',
            {
                taskDescription: 'security migration of the database schema',
                estimatedFileCount: 40,
                crossCuttingConcerns: ['auth', 'state', 'api', 'db', 'cache'],
                hasBreakingChanges: true,
                affectedDomains: ['a', 'b', 'c', 'd'],
            },
            'CRITICAL',
        ],
    ]

    for (const [label, input, expected] of cases) {
        test(`${label} → ${expected}`, () => {
            expect(classifyComplexity(input).complexity).toBe(expected)
        })
    }

    test('applies schema defaults when optional fields are omitted', () => {
        const result = classifyComplexity({ taskDescription: 'a plain change' })
        expect(result.complexity).toBe('TRIVIAL')
        expect(result.factors).toEqual({
            fileScope: 'small',
            dependencyDepth: 'shallow',
            riskLevel: 'low',
        })
    })

    test('description keywords raise the score', () => {
        const plain = classifyComplexity({
            taskDescription: 'a plain change',
            estimatedFileCount: 5,
        })
        const keyword = classifyComplexity({
            taskDescription: 'a refactor change',
            estimatedFileCount: 5,
        })
        expect(plain.complexity).toBe('TRIVIAL')
        expect(keyword.complexity).toBe('SIMPLE')
    })

    test('a breaking change forces a high risk level', () => {
        const result = classifyComplexity({
            taskDescription: 'small but breaking',
            estimatedFileCount: 1,
            hasBreakingChanges: true,
        })
        expect(result.factors.riskLevel).toBe('high')
    })

    test('reasoning reports the computed score', () => {
        const result = classifyComplexity({
            taskDescription: 'fix a typo',
            estimatedFileCount: 1,
        })
        expect(result.reasoning).toContain('Score 0')
    })
})
