import { z } from 'zod'

import { LEGACY_PIPELINE_STEP_MAP, PipelineStepValues } from './constants.ts'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ComplexityLevel = z.enum([
    'TRIVIAL',
    'SIMPLE',
    'MODERATE',
    'COMPLEX',
    'CRITICAL',
])
export type ComplexityLevel = z.infer<typeof ComplexityLevel>

export const OversightMode = z.enum([
    'full-auto',
    'checkpoint',
    'human-in-loop',
])
export type OversightMode = z.infer<typeof OversightMode>

const PipelineStepEnum = z.enum(PipelineStepValues)

export const PipelineStep = z.preprocess((val) => {
    if (typeof val === 'string' && val in LEGACY_PIPELINE_STEP_MAP) {
        return LEGACY_PIPELINE_STEP_MAP[val]
    }
    return val
}, PipelineStepEnum)
export type PipelineStep = z.infer<typeof PipelineStepEnum>

export const PhaseStatus = z.enum([
    'pending',
    'in-progress',
    'complete',
    'skipped',
    'blocked',
])
export type PhaseStatus = z.infer<typeof PhaseStatus>

// Coarse workflow phases (5) — what the stage-gate hook and MCP tool guards
// consult to decide which operations are permitted at the current step.
export const CoarsePhase = z.enum([
    'IDLE',
    'PLANNING',
    'EXECUTING',
    'REVIEWING',
    'FINALIZING',
])
export type CoarsePhase = z.infer<typeof CoarsePhase>

// ---------------------------------------------------------------------------
// Roadmap phase entry
// ---------------------------------------------------------------------------

export const RoadmapPhaseSchema = z.object({
    name: z.string(),
    deps: z.array(z.string()).default([]),
    status: PhaseStatus.default('pending'),
    complexity: ComplexityLevel.optional(),
})
export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>

// ---------------------------------------------------------------------------
// Main state schema
//
// Dropped fields (per decision:luca-state-machine-scope-2026-05-19):
//   - profile        (deprecated; budget matrix now uses balanced internally)
//   - workflowVersion (no v1 path needed)
//   - skipBranch     (replaced by no-bypass policy)
//
// Strict on the trimmed shape. Use lucaStateSchemaTolerant for migration
// reads that should silently drop unknown legacy fields.
// ---------------------------------------------------------------------------

export const lucaStateSchema = z.object({
    // --- Complexity & oversight ---
    complexity: ComplexityLevel.optional(),
    oversight: OversightMode.default('full-auto'),

    // --- Pipeline progress ---
    pipelineStep: PipelineStep.default('idle'),
    currentPhase: z.number().default(0),
    totalPhases: z.number().default(0),
    phaseSubStep: z.string().optional(),

    // --- Session ---
    sessionId: z.string().optional(),

    // --- Roadmap ---
    roadmap: z.array(RoadmapPhaseSchema).default([]),

    // --- Git ---
    branchName: z.string().optional(),
    issueNumber: z.number().optional(),

    // --- Iteration tracking ---
    checksFixIteration: z.number().default(0),
    verifyIteration: z.number().default(0),
    planReviewIteration: z.number().default(0),
    researchReviewIteration: z.number().default(0),
    reviewIteration: z.number().default(0),

    // --- Budget matrix (resolved from complexity) ---
    maxChecksFixIterations: z.number().default(3),
    maxVerifyIterations: z.number().default(2),
    maxPlanReviewIterations: z.number().default(2),
    maxResearchReviewIterations: z.number().default(2),
    maxReviewIterations: z.number().default(2),
    maxPhases: z.number().default(5),

    // --- Review-mode entry timestamp ---
    reviewStartedAt: z.string().optional(),

    // --- Crash recovery ---
    lockPid: z.number().optional(),
    lockAcquiredAt: z.string().optional(),

    // --- Sandbox paths (workflow-allowed file roots) ---
    sandboxAllowedPaths: z.array(z.string()).default([]),
})

export type LucaState = z.infer<typeof lucaStateSchema>

// Tolerant schema for reading legacy state.json files: drops unknown fields
// silently and applies pipelineStep legacy mapping.
export const lucaStateSchemaTolerant = lucaStateSchema.passthrough()
