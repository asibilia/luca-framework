import { describe, expect, test } from 'bun:test'

import {
    BUDGET_BY_COMPLEXITY,
    DEFAULT_BUDGET,
} from '../configs/budget-matrix.ts'
import type { ComplexityLevel } from '../schemas.ts'
import { resolveBudgetLimits } from './resolve-budget-limits.ts'

describe('resolveBudgetLimits', () => {
    test('returns DEFAULT_BUDGET when complexity is undefined', () => {
        expect(resolveBudgetLimits({})).toEqual(DEFAULT_BUDGET)
    })

    test('returns DEFAULT_BUDGET when complexity is explicitly undefined', () => {
        expect(resolveBudgetLimits({ complexity: undefined })).toEqual(
            DEFAULT_BUDGET,
        )
    })

    const levels: ComplexityLevel[] = [
        'TRIVIAL',
        'SIMPLE',
        'MODERATE',
        'COMPLEX',
        'CRITICAL',
    ]
    for (const level of levels) {
        test(`returns BUDGET_BY_COMPLEXITY[${level}] for ${level}`, () => {
            expect(resolveBudgetLimits({ complexity: level })).toEqual(
                BUDGET_BY_COMPLEXITY[level],
            )
        })
    }

    test('budget limits increase monotonically along the complexity scale (maxPhases)', () => {
        const phases = levels.map(
            (l) => BUDGET_BY_COMPLEXITY[l].maxPhases,
        )
        for (let i = 1; i < phases.length; i += 1) {
            expect(phases[i]!).toBeGreaterThanOrEqual(phases[i - 1]!)
        }
    })
})
