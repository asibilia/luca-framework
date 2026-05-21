import {
    BUDGET_BY_COMPLEXITY,
    DEFAULT_BUDGET,
    type BudgetLimits,
} from '../configs/budget-matrix.ts'
import type { ComplexityLevel } from '../schemas.ts'

/**
 * Resolve iteration/phase budget limits from the configured complexity level.
 *
 * Falls back to MODERATE-equivalent defaults when complexity is unset.
 */
export function resolveBudgetLimits({
    complexity,
}: {
    complexity?: ComplexityLevel
}): BudgetLimits {
    if (!complexity) return DEFAULT_BUDGET
    return BUDGET_BY_COMPLEXITY[complexity] ?? DEFAULT_BUDGET
}
