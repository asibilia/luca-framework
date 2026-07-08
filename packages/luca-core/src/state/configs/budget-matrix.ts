import type { ComplexityLevel } from '../schemas.ts'

export interface BudgetLimits {
    maxChecksFixIterations: number
    maxVerifyIterations: number
    maxPlanReviewIterations: number
    maxResearchReviewIterations: number
    maxReviewIterations: number
    maxPhases: number
}

// Budget limits per complexity level.
// Values correspond to the 'balanced' profile of the legacy (complexity ×
// profile) matrix. Re-introducing profile later requires reverting to 2D.
//
// DEMOTED (DAD-P1t): this is data referenced BY the machine state (iteration
// budgets), not control flow. It does not encode the pipeline's structure.
export const BUDGET_BY_COMPLEXITY: Record<ComplexityLevel, BudgetLimits> = {
    TRIVIAL: {
        maxChecksFixIterations: 2,
        maxVerifyIterations: 1,
        maxPlanReviewIterations: 1,
        maxResearchReviewIterations: 0,
        maxReviewIterations: 1,
        maxPhases: 1,
    },
    SIMPLE: {
        maxChecksFixIterations: 3,
        maxVerifyIterations: 2,
        maxPlanReviewIterations: 1,
        maxResearchReviewIterations: 1,
        maxReviewIterations: 1,
        maxPhases: 3,
    },
    MODERATE: {
        maxChecksFixIterations: 4,
        maxVerifyIterations: 2,
        maxPlanReviewIterations: 2,
        maxResearchReviewIterations: 2,
        maxReviewIterations: 2,
        maxPhases: 5,
    },
    COMPLEX: {
        maxChecksFixIterations: 5,
        maxVerifyIterations: 3,
        maxPlanReviewIterations: 3,
        maxResearchReviewIterations: 3,
        maxReviewIterations: 2,
        maxPhases: 7,
    },
    CRITICAL: {
        maxChecksFixIterations: 6,
        maxVerifyIterations: 4,
        maxPlanReviewIterations: 4,
        maxResearchReviewIterations: 4,
        maxReviewIterations: 3,
        maxPhases: 10,
    },
}

export const DEFAULT_BUDGET: BudgetLimits = {
    maxChecksFixIterations: 3,
    maxVerifyIterations: 2,
    maxPlanReviewIterations: 2,
    maxResearchReviewIterations: 2,
    maxReviewIterations: 2,
    maxPhases: 5,
}
