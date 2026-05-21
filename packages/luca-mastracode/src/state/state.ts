/**
 * Workflow state schema for the Luca pipeline (mastracode harness build).
 *
 * Shared primitives (ComplexityLevel, OversightMode, PhaseStatus,
 * RoadmapPhaseSchema) are imported from @alecsibilia/luca-core. Mastracode-
 * specific extensions — ProfileLevel, the 22-value PipelineStep, the 2D
 * (complexity × profile) BUDGET_MATRIX, plus the deprecated `profile`,
 * `workflowVersion`, and `skipBranch` state fields — live here. These are
 * retained until mastracode retires (Phase 5).
 */

import {
    ComplexityLevel,
    OversightMode,
    PhaseStatus,
    RoadmapPhaseSchema,
} from '@alecsibilia/luca-core'
import type { RoadmapPhase } from '@alecsibilia/luca-core'
import { z } from 'zod'

// Re-export shared primitives so existing `import ... from './state.js'`
// callers continue to work without modification.
export { ComplexityLevel, OversightMode, PhaseStatus, RoadmapPhaseSchema }
export type { RoadmapPhase }

// ---------------------------------------------------------------------------
// Mastracode-only enums (deprecated; retiring with mastracode)
// ---------------------------------------------------------------------------

export const ProfileLevel = z.enum(['budget', 'balanced', 'quality'])
export type ProfileLevel = z.infer<typeof ProfileLevel>

// Mastracode's 22-value pipelineStep. luca-core's trimmed PipelineStep (14
// values) auto-maps the dropped values via z.preprocess on read, so state.json
// written by mastracode parses cleanly when read by luca-core consumers.
export const PipelineStep = z.enum([
    'idle',
    'triage',
    'classify',
    'configure',
    'git-setup',
    'roadmap',
    'phase-order',
    'research',
    'discuss',
    'architect',
    'plan',
    'plan-review',
    'execute',
    'checks',
    'verify',
    'review',
    'learn',
    'milestone',
    'review-audit',
    'gap-audit',
    'cleanup',
    'complete',
])
export type PipelineStep = z.infer<typeof PipelineStep>

// ---------------------------------------------------------------------------
// Mastracode lucaStateSchema (with legacy fields)
// ---------------------------------------------------------------------------

export const lucaStateSchema = z.object({
    // --- Complexity & profile ---
    complexity: ComplexityLevel.optional(),
    profile: ProfileLevel.default('balanced'),
    oversight: OversightMode.default('full-auto'),

    // --- Pipeline progress ---
    pipelineStep: PipelineStep.default('idle'),
    currentPhase: z.number().default(0),
    totalPhases: z.number().default(0),
    phaseSubStep: z.string().optional(),

    // --- Session ---
    sessionId: z.string().optional(),
    workflowVersion: z.enum(['v1', 'v2']).default('v2'),

    // --- Roadmap ---
    roadmap: z.array(RoadmapPhaseSchema).default([]),

    // --- Git ---
    branchName: z.string().optional(),
    issueNumber: z.number().optional(),
    /**
     * When `--skip-branch` is passed, architect Step 1 skips
     * `ensureFeatureBranch` and the executor's pre-commit guard reads this
     * flag to distinguish intentional skip from a missed Step 1.
     */
    skipBranch: z.boolean().optional(),

    // --- Iteration tracking ---
    checksFixIteration: z.number().default(0),
    verifyIteration: z.number().default(0),
    planReviewIteration: z.number().default(0),
    researchReviewIteration: z.number().default(0),
    reviewIteration: z.number().default(0),

    // --- Budget matrix (resolved from complexity × profile) ---
    maxChecksFixIterations: z.number().default(3),
    maxVerifyIterations: z.number().default(2),
    maxPlanReviewIterations: z.number().default(2),
    maxResearchReviewIterations: z.number().default(2),
    maxReviewIterations: z.number().default(2),
    maxPhases: z.number().default(5),

    // --- Review-mode entry timestamp (consumed by review.iteration telemetry) ---
    reviewStartedAt: z.string().optional(),

    // --- Crash recovery ---
    lockPid: z.number().optional(),
    lockAcquiredAt: z.string().optional(),

    // --- Mastra Code sandbox paths ---
    sandboxAllowedPaths: z.array(z.string()).default([]),
})

export type LucaState = z.infer<typeof lucaStateSchema>

// ---------------------------------------------------------------------------
// Budget matrix — maps (complexity × profile) to iteration limits.
// Mastracode-only because the 2D dimension depends on the deprecated
// profile field. luca-core ships a 1D balanced-only fallback table.
// ---------------------------------------------------------------------------

interface BudgetLimits {
    maxChecksFixIterations: number
    maxVerifyIterations: number
    maxPlanReviewIterations: number
    maxResearchReviewIterations: number
    maxReviewIterations: number
    maxPhases: number
}

const BUDGET_MATRIX: Record<string, Record<string, BudgetLimits>> = {
    TRIVIAL: {
        budget: {
            maxChecksFixIterations: 1,
            maxVerifyIterations: 1,
            maxPlanReviewIterations: 0,
            maxResearchReviewIterations: 0,
            maxReviewIterations: 0,
            maxPhases: 1,
        },
        balanced: {
            maxChecksFixIterations: 2,
            maxVerifyIterations: 1,
            maxPlanReviewIterations: 1,
            maxResearchReviewIterations: 0,
            maxReviewIterations: 1,
            maxPhases: 1,
        },
        quality: {
            maxChecksFixIterations: 3,
            maxVerifyIterations: 2,
            maxPlanReviewIterations: 1,
            maxResearchReviewIterations: 1,
            maxReviewIterations: 1,
            maxPhases: 2,
        },
    },
    SIMPLE: {
        budget: {
            maxChecksFixIterations: 2,
            maxVerifyIterations: 1,
            maxPlanReviewIterations: 1,
            maxResearchReviewIterations: 0,
            maxReviewIterations: 1,
            maxPhases: 2,
        },
        balanced: {
            maxChecksFixIterations: 3,
            maxVerifyIterations: 2,
            maxPlanReviewIterations: 1,
            maxResearchReviewIterations: 1,
            maxReviewIterations: 1,
            maxPhases: 3,
        },
        quality: {
            maxChecksFixIterations: 4,
            maxVerifyIterations: 2,
            maxPlanReviewIterations: 2,
            maxResearchReviewIterations: 2,
            maxReviewIterations: 2,
            maxPhases: 4,
        },
    },
    MODERATE: {
        budget: {
            maxChecksFixIterations: 3,
            maxVerifyIterations: 2,
            maxPlanReviewIterations: 1,
            maxResearchReviewIterations: 1,
            maxReviewIterations: 1,
            maxPhases: 3,
        },
        balanced: {
            maxChecksFixIterations: 4,
            maxVerifyIterations: 2,
            maxPlanReviewIterations: 2,
            maxResearchReviewIterations: 2,
            maxReviewIterations: 2,
            maxPhases: 5,
        },
        quality: {
            maxChecksFixIterations: 5,
            maxVerifyIterations: 3,
            maxPlanReviewIterations: 3,
            maxResearchReviewIterations: 3,
            maxReviewIterations: 3,
            maxPhases: 7,
        },
    },
    COMPLEX: {
        budget: {
            maxChecksFixIterations: 4,
            maxVerifyIterations: 2,
            maxPlanReviewIterations: 2,
            maxResearchReviewIterations: 2,
            maxReviewIterations: 2,
            maxPhases: 5,
        },
        balanced: {
            maxChecksFixIterations: 5,
            maxVerifyIterations: 3,
            maxPlanReviewIterations: 3,
            maxResearchReviewIterations: 3,
            maxReviewIterations: 2,
            maxPhases: 7,
        },
        quality: {
            maxChecksFixIterations: 6,
            maxVerifyIterations: 4,
            maxPlanReviewIterations: 4,
            maxResearchReviewIterations: 4,
            maxReviewIterations: 3,
            maxPhases: 10,
        },
    },
    CRITICAL: {
        budget: {
            maxChecksFixIterations: 5,
            maxVerifyIterations: 3,
            maxPlanReviewIterations: 3,
            maxResearchReviewIterations: 3,
            maxReviewIterations: 2,
            maxPhases: 7,
        },
        balanced: {
            maxChecksFixIterations: 6,
            maxVerifyIterations: 4,
            maxPlanReviewIterations: 4,
            maxResearchReviewIterations: 4,
            maxReviewIterations: 3,
            maxPhases: 10,
        },
        quality: {
            maxChecksFixIterations: 8,
            maxVerifyIterations: 5,
            maxPlanReviewIterations: 5,
            maxResearchReviewIterations: 5,
            maxReviewIterations: 4,
            maxPhases: 15,
        },
    },
}

/**
 * Resolve budget limits from complexity and profile.
 * Returns defaults for unknown combinations.
 */
export function resolveBudgetLimits({
    complexity,
    profile,
}: {
    complexity: ComplexityLevel
    profile: ProfileLevel
}): BudgetLimits {
    return (
        BUDGET_MATRIX[complexity]?.[profile] ?? {
            maxChecksFixIterations: 3,
            maxVerifyIterations: 2,
            maxPlanReviewIterations: 2,
            maxResearchReviewIterations: 2,
            maxReviewIterations: 2,
            maxPhases: 5,
        }
    )
}
