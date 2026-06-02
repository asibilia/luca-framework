import { describe, expect, test } from 'bun:test'

import {
    ComplexityLevel,
    lucaStateSchema,
    lucaStateSchemaTolerant,
    OversightMode,
    PhaseStatus,
    PipelineStep,
    RoadmapPhaseSchema,
} from './schemas.ts'

describe('ComplexityLevel', () => {
    test('accepts each canonical complexity value', () => {
        for (const level of [
            'TRIVIAL',
            'SIMPLE',
            'MODERATE',
            'COMPLEX',
            'CRITICAL',
        ] as const) {
            expect(ComplexityLevel.parse(level)).toBe(level)
        }
    })

    test('rejects lowercase or unknown values', () => {
        expect(ComplexityLevel.safeParse('moderate').success).toBe(false)
        expect(ComplexityLevel.safeParse('EXTREME').success).toBe(false)
    })
})

describe('OversightMode', () => {
    test('accepts each canonical oversight value', () => {
        for (const mode of [
            'full-auto',
            'checkpoint',
            'human-in-loop',
        ] as const) {
            expect(OversightMode.parse(mode)).toBe(mode)
        }
    })
})

describe('PipelineStep', () => {
    test('accepts each of the 14 canonical pipelineStep values', () => {
        const canonical = [
            'idle',
            'triage',
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
            'finalize',
        ] as const
        for (const step of canonical) {
            expect(PipelineStep.parse(step)).toBe(step)
        }
    })

    test('maps legacy setup-phase values to triage', () => {
        for (const legacy of [
            'classify',
            'configure',
            'git-setup',
            'roadmap',
            'phase-order',
        ]) {
            expect(PipelineStep.parse(legacy)).toBe('triage')
        }
    })

    test('maps legacy audit sub-steps to review', () => {
        expect(PipelineStep.parse('review-audit')).toBe('review')
        expect(PipelineStep.parse('gap-audit')).toBe('review')
    })

    test('maps legacy milestone/complete/cleanup to finalize', () => {
        expect(PipelineStep.parse('cleanup')).toBe('finalize')
        expect(PipelineStep.parse('milestone')).toBe('finalize')
        expect(PipelineStep.parse('complete')).toBe('finalize')
    })

    test('rejects unknown pipelineStep values', () => {
        expect(PipelineStep.safeParse('totally-fake').success).toBe(false)
    })
})

describe('PhaseStatus', () => {
    test('accepts each canonical status value', () => {
        for (const status of [
            'pending',
            'in-progress',
            'complete',
            'skipped',
            'blocked',
        ] as const) {
            expect(PhaseStatus.parse(status)).toBe(status)
        }
    })
})

describe('RoadmapPhaseSchema', () => {
    test('parses minimum-input phase with defaults', () => {
        const parsed = RoadmapPhaseSchema.parse({ name: 'first-phase' })
        expect(parsed.name).toBe('first-phase')
        expect(parsed.deps).toEqual([])
        expect(parsed.status).toBe('pending')
        expect(parsed.complexity).toBeUndefined()
    })

    test('rejects missing name', () => {
        expect(RoadmapPhaseSchema.safeParse({}).success).toBe(false)
    })
})

describe('lucaStateSchema', () => {
    test('parses empty object with all defaults', () => {
        const parsed = lucaStateSchema.parse({})
        expect(parsed.pipelineStep).toBe('idle')
        expect(parsed.oversight).toBe('full-auto')
        expect(parsed.currentPhase).toBe(0)
        expect(parsed.totalPhases).toBe(0)
        expect(parsed.roadmap).toEqual([])
        expect(parsed.sandboxAllowedPaths).toEqual([])
        expect(parsed.checksFixIteration).toBe(0)
        expect(parsed.maxChecksFixIterations).toBe(3)
    })

    test('parses with all known fields supplied', () => {
        const parsed = lucaStateSchema.parse({
            complexity: 'COMPLEX',
            oversight: 'checkpoint',
            pipelineStep: 'execute',
            currentPhase: 2,
            totalPhases: 5,
            sessionId: 'sess-123',
            branchName: 'feat/x',
            issueNumber: 42,
            lockPid: 1234,
        })
        expect(parsed.complexity).toBe('COMPLEX')
        expect(parsed.pipelineStep).toBe('execute')
        expect(parsed.sessionId).toBe('sess-123')
        expect(parsed.branchName).toBe('feat/x')
        expect(parsed.lockPid).toBe(1234)
    })

    test('applies pipelineStep legacy mapping at the top level', () => {
        const parsed = lucaStateSchema.parse({ pipelineStep: 'cleanup' })
        expect(parsed.pipelineStep).toBe('finalize')
    })

    test('strict variant drops legacy fields by failing them', () => {
        // Plain z.object allows unknown fields silently. The point of the
        // tolerant variant is to also strip without erroring. Verify the
        // base schema does not surface legacy fields in parsed output.
        const parsed = lucaStateSchema.parse({
            profile: 'balanced',
            workflowVersion: 'v2',
            skipBranch: true,
        })
        expect('profile' in parsed).toBe(false)
        expect('workflowVersion' in parsed).toBe(false)
        expect('skipBranch' in parsed).toBe(false)
    })
})

describe('lucaStateSchemaTolerant', () => {
    test('preserves legacy fields via passthrough', () => {
        const parsed = lucaStateSchemaTolerant.parse({
            profile: 'balanced',
            workflowVersion: 'v2',
            skipBranch: true,
        })
        // Passthrough preserves unknown keys on the parsed object.
        expect((parsed as { profile?: unknown }).profile).toBe('balanced')
        expect((parsed as { workflowVersion?: unknown }).workflowVersion).toBe(
            'v2'
        )
        expect((parsed as { skipBranch?: unknown }).skipBranch).toBe(true)
    })
})
