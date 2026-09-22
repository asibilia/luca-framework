import type { ComplexityLevel } from '../schemas.ts'

export interface BudgetLimits {
    maxChecksFixIterations: number
    maxVerifyIterations: number
    maxPlanReviewIterations: number
    maxResearchReviewIterations: number
    maxReviewIterations: number
    maxPhases: number
    // --- Run-budget ceilings (#319). Wall-time is the guaranteed trip wire;
    // tool-call is best-effort; softCostCeilingUsd = 0 means disabled. ---
    maxWallClockMs: number
    maxToolCalls: number
    softCostCeilingUsd: number
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
        maxWallClockMs: 1_200_000,
        maxToolCalls: 150,
        softCostCeilingUsd: 0,
    },
    SIMPLE: {
        maxChecksFixIterations: 3,
        maxVerifyIterations: 2,
        maxPlanReviewIterations: 1,
        maxResearchReviewIterations: 1,
        maxReviewIterations: 1,
        maxPhases: 3,
        maxWallClockMs: 2_400_000,
        maxToolCalls: 300,
        softCostCeilingUsd: 0,
    },
    MODERATE: {
        maxChecksFixIterations: 4,
        maxVerifyIterations: 2,
        maxPlanReviewIterations: 2,
        maxResearchReviewIterations: 2,
        maxReviewIterations: 2,
        maxPhases: 5,
        maxWallClockMs: 4_500_000,
        maxToolCalls: 550,
        softCostCeilingUsd: 0,
    },
    COMPLEX: {
        maxChecksFixIterations: 5,
        maxVerifyIterations: 3,
        maxPlanReviewIterations: 3,
        maxResearchReviewIterations: 3,
        maxReviewIterations: 2,
        maxPhases: 7,
        maxWallClockMs: 7_200_000,
        maxToolCalls: 850,
        softCostCeilingUsd: 0,
    },
    CRITICAL: {
        maxChecksFixIterations: 6,
        maxVerifyIterations: 4,
        maxPlanReviewIterations: 4,
        maxResearchReviewIterations: 4,
        maxReviewIterations: 3,
        maxPhases: 10,
        maxWallClockMs: 9_000_000,
        maxToolCalls: 1200,
        softCostCeilingUsd: 0,
    },
}

export const DEFAULT_BUDGET: BudgetLimits = {
    maxChecksFixIterations: 3,
    maxVerifyIterations: 2,
    maxPlanReviewIterations: 2,
    maxResearchReviewIterations: 2,
    maxReviewIterations: 2,
    maxPhases: 5,
    maxWallClockMs: 7_200_000,
    maxToolCalls: 850,
    softCostCeilingUsd: 0,
}
