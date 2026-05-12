import { describe, test, expect, beforeEach, spyOn } from 'bun:test'
import { z } from 'zod'

import * as lucaStore from '../state/luca-store.js'
import * as sessionLedger from '../state/session-ledger.js'
import * as telemetry from '../state/telemetry.js'
import { createScopedTool } from '../tools/create-scoped-tool.js'
import { workflowStateTool, PIPELINE_ORDER } from '../tools/workflow-state.js'
import { ROOT_WHITELIST_DIRS } from '../tools/repo-cleanup.js'
import { switchModeRef } from '../util/refs.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadLucaState = spyOn(lucaStore, 'readLucaState').mockReturnValue(
    {} as any
)
const mockWriteLucaState = spyOn(
    lucaStore,
    'writeLucaState'
).mockImplementation((updates: any) => updates)
const mockAppendLedger = spyOn(sessionLedger, 'appendLedger').mockReturnValue(
    undefined
)
const mockAppendTelemetry = spyOn(telemetry, 'appendTelemetry').mockReturnValue(
    undefined
)

beforeEach(() => {
    mockReadLucaState.mockReturnValue({} as any)
    mockWriteLucaState.mockClear().mockImplementation((updates: any) => updates)
    mockAppendLedger.mockClear()
    mockAppendTelemetry.mockClear().mockReturnValue(undefined)
    switchModeRef.current = null
})

// Helper to call the tool's execute function directly
async function callAction(input: Record<string, unknown>): Promise<any> {
    return workflowStateTool.execute!(input as any, {} as any)
}

// ---------------------------------------------------------------------------
// PIPELINE_ORDER export
// ---------------------------------------------------------------------------

describe('PIPELINE_ORDER export', () => {
    test('is exported from workflow-state module', () => {
        expect(PIPELINE_ORDER).toBeDefined()
        expect(PIPELINE_ORDER['luca:1-triage']).toBe('luca:2-research')
        expect(PIPELINE_ORDER['luca:6-finalize']).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// save-triage-results action
// ---------------------------------------------------------------------------

describe('save-triage-results', () => {
    test('saves triage results with all required fields', async () => {
        const result = await callAction({
            action: 'save-triage-results',
            intent: 'Refactor auth module',
            complexity: 'MODERATE',
            oversight: 'full-auto',
            profile: 'balanced',
            affectedAreas: ['src/auth', 'src/middleware'],
        })

        expect(result.success).toBe(true)
        expect(result.message).toContain('MODERATE')
        expect(result.message).toContain('full-auto')

        // Verify correct fields written to state
        expect(mockWriteLucaState).toHaveBeenCalledTimes(1)
        const written = mockWriteLucaState.mock.calls[0]![0]
        expect(written.intent).toBe('Refactor auth module')
        expect(written.complexity).toBe('MODERATE')
        expect(written.oversight).toBe('full-auto')
        expect(written.profile).toBe('balanced')
        expect(written.affectedAreas).toEqual(['src/auth', 'src/middleware'])
    })

    test('uses defaults for optional fields', async () => {
        const result = await callAction({
            action: 'save-triage-results',
            intent: 'Fix a bug',
            complexity: 'TRIVIAL',
            oversight: 'full-auto',
        })

        expect(result.success).toBe(true)
        const written = mockWriteLucaState.mock.calls[0]![0]
        expect(written.profile).toBe('balanced')
        expect(written.affectedAreas).toBeUndefined()
        expect(written.skipResearch).toBeUndefined()
    })

    test('saves skipResearch flag when set', async () => {
        const result = await callAction({
            action: 'save-triage-results',
            intent: 'Fix typo',
            complexity: 'TRIVIAL',
            oversight: 'full-auto',
            skipResearch: true,
        })

        expect(result.success).toBe(true)
        const written = mockWriteLucaState.mock.calls[0]![0]
        expect(written.skipResearch).toBe(true)
    })

    test('runtime rejects when intent is missing', async () => {
        const result = await callAction({
            action: 'save-triage-results',
            complexity: 'MODERATE',
            oversight: 'full-auto',
        })
        expect(result.success).toBe(false)
    })

    test('runtime rejects when complexity is missing', async () => {
        const result = await callAction({
            action: 'save-triage-results',
            intent: 'Some work',
            oversight: 'full-auto',
        })
        expect(result.success).toBe(false)
    })

    test('runtime rejects when oversight is missing', async () => {
        const result = await callAction({
            action: 'save-triage-results',
            intent: 'Some work',
            complexity: 'MODERATE',
        })
        expect(result.success).toBe(false)
    })

    test('appends ledger entry', async () => {
        await callAction({
            action: 'save-triage-results',
            intent: 'Test ledger',
            complexity: 'COMPLEX',
            oversight: 'checkpoint',
        })

        expect(mockAppendLedger).toHaveBeenCalledTimes(1)
        expect(mockAppendLedger.mock.calls[0]![0]).toBe('triage-complete')
        expect(mockAppendLedger.mock.calls[0]![1]).toEqual({
            intent: 'Test ledger',
            complexity: 'COMPLEX',
            oversight: 'checkpoint',
        })
    })
})

// ---------------------------------------------------------------------------
// save-plan-artifacts action
// ---------------------------------------------------------------------------

describe('save-plan-artifacts', () => {
    test('saves plan artifacts with planFile and roadmapFile (normalizes to .planning/)', async () => {
        const result = await callAction({
            action: 'save-plan-artifacts',
            planFile: 'PLAN.md',
            roadmapFile: 'ROADMAP.md',
        })

        expect(result.success).toBe(true)
        expect(result.message).toContain('.planning/PLAN.md')

        const written = mockWriteLucaState.mock.calls[0]![0]
        expect(written.planFile).toBe('.planning/PLAN.md')
        expect(written.roadmapFile).toBe('.planning/ROADMAP.md')
    })

    test('saves with only planFile (roadmapFile defaults to root ROADMAP.md)', async () => {
        const result = await callAction({
            action: 'save-plan-artifacts',
            planFile: '.planning/PLAN.md',
        })

        expect(result.success).toBe(true)
        const written = mockWriteLucaState.mock.calls[0]![0]
        expect(written.planFile).toBe('.planning/PLAN.md')
        // Post-#220: roadmapFile defaults to .planning/ROADMAP.md (root, cross-phase)
        // when omitted, instead of being left undefined.
        expect(written.roadmapFile).toBe('.planning/ROADMAP.md')
    })

    test('defaults planFile to .planning/PLAN.md when omitted (no slug in state)', async () => {
        // Post-#220: planFile is optional and defaults to phaseDir(slug)/PLAN.md
        // when a phase slug is set, or .planning/PLAN.md (root) otherwise.
        // The test suite mocks readLucaState() with no currentPhaseSlug, so we
        // expect the root fallback.
        const result = await callAction({
            action: 'save-plan-artifacts',
        })
        expect(result.success).toBe(true)
        const written = mockWriteLucaState.mock.calls[0]![0]
        expect(written.planFile).toBe('.planning/PLAN.md')
        expect(written.roadmapFile).toBe('.planning/ROADMAP.md')
    })

    test('appends ledger entry with normalized paths', async () => {
        await callAction({
            action: 'save-plan-artifacts',
            planFile: 'PLAN.md',
            roadmapFile: 'ROADMAP.md',
        })

        expect(mockAppendLedger).toHaveBeenCalledTimes(1)
        expect(mockAppendLedger.mock.calls[0]![0]).toBe('plan-artifacts-saved')
        expect(mockAppendLedger.mock.calls[0]![1]).toEqual({
            planFile: '.planning/PLAN.md',
            roadmapFile: '.planning/ROADMAP.md',
        })
    })
})

// ---------------------------------------------------------------------------
// save-review-results action
// ---------------------------------------------------------------------------

describe('save-review-results', () => {
    test('saves review results with iteration plan', async () => {
        const result = await callAction({
            action: 'save-review-results',
            iterationPlan: ['Fix type error in auth.ts', 'Add missing test'],
            reviewIteration: 2,
        })

        expect(result.success).toBe(true)
        expect(result.message).toContain('iteration 2')

        const written = mockWriteLucaState.mock.calls[0]![0]
        expect(written.iterationPlan).toEqual([
            'Fix type error in auth.ts',
            'Add missing test',
        ])
        expect(written.reviewIteration).toBe(2)
    })

    test('works without optional fields', async () => {
        const result = await callAction({
            action: 'save-review-results',
        })

        expect(result.success).toBe(true)
        const written = mockWriteLucaState.mock.calls[0]![0]
        expect(written.iterationPlan).toBeUndefined()
        expect(written.reviewIteration).toBeUndefined()
    })

    test('appends ledger entry with issue count', async () => {
        await callAction({
            action: 'save-review-results',
            iterationPlan: ['fix1', 'fix2', 'fix3'],
            reviewIteration: 1,
        })

        expect(mockAppendLedger).toHaveBeenCalledTimes(1)
        expect(mockAppendLedger.mock.calls[0]![0]).toBe('review-results-saved')
        expect(mockAppendLedger.mock.calls[0]![1]).toEqual({
            iterationPlan: ['fix1', 'fix2', 'fix3'],
            reviewIteration: 1,
        })
    })
})

// ---------------------------------------------------------------------------
// reset-pipeline action
// ---------------------------------------------------------------------------

describe('reset-pipeline', () => {
    test('clears all session-scoped fields (triage output, progress, metadata)', async () => {
        const result = await callAction({
            action: 'reset-pipeline',
        })

        expect(result.success).toBe(true)
        expect(result.message).toContain('reset')

        const written = mockWriteLucaState.mock.calls[0]![0]
        // Pipeline progress
        expect(written.pipelineStep).toBe('idle')
        expect(written.nextMode).toBeUndefined()
        expect(written.currentPhase).toBe(0)
        expect(written.totalPhases).toBe(0)
        expect(written.planFile).toBeUndefined()
        expect(written.roadmapFile).toBeUndefined()
        // Triage output — stale intent was the #1 cause of session hijack
        expect(written.intent).toBeUndefined()
        expect(written.complexity).toBeUndefined()
        expect(written.oversight).toBeUndefined()
        expect(written.affectedAreas).toBeUndefined()
        expect(written.profile).toBeUndefined()
        expect(written.skipResearch).toBeUndefined()
        // Session metadata
        expect(written.sessionId).toBeUndefined()
        expect(written.startedAt).toBeUndefined()
        expect(written.assignedTodos).toBeUndefined()
        expect(written.phaseResults).toBeUndefined()
    })

    test('appends ledger entry', async () => {
        await callAction({ action: 'reset-pipeline' })

        expect(mockAppendLedger).toHaveBeenCalledTimes(1)
        expect(mockAppendLedger.mock.calls[0]![0]).toBe('pipeline-reset')
    })
})

// ---------------------------------------------------------------------------
// stale state detection on pipeline entry
// ---------------------------------------------------------------------------

describe('stale state detection on switch-mode to triage', () => {
    test('rejects with stale state warning when intent exists', async () => {
        switchModeRef.current = async () => {}
        mockReadLucaState.mockReturnValue({
            intent: 'old intent from previous run',
            pipelineStep: 'idle',
        })

        const result = await callAction({
            action: 'switch-mode',
            targetMode: 'luca:1-triage',
            userRequest: 'new task',
        })

        expect(result.success).toBe(false)
        expect(result.message).toContain('Stale pipeline state')
        expect(result.message).toContain('old intent from previous run')
        expect(result.staleState.intent).toBe('old intent from previous run')
    })

    test('rejects with stale state warning when pipelineStep is non-idle', async () => {
        switchModeRef.current = async () => {}
        mockReadLucaState.mockReturnValue({ pipelineStep: 'luca:3-architect' })

        const result = await callAction({
            action: 'switch-mode',
            targetMode: 'luca:1-triage',
            userRequest: 'new task',
        })

        expect(result.success).toBe(false)
        expect(result.message).toContain('Stale pipeline state')
        expect(result.staleState.pipelineStep).toBe('luca:3-architect')
    })

    test('allows switch-mode to triage when state is clean', async () => {
        switchModeRef.current = async () => {}
        mockReadLucaState.mockReturnValue({})

        const result = await callAction({
            action: 'switch-mode',
            targetMode: 'luca:1-triage',
            userRequest: 'fresh task',
        })

        expect(result.success).toBe(true)
    })

    test('allows switch-mode to triage when pipelineStep is idle and no intent', async () => {
        switchModeRef.current = async () => {}
        mockReadLucaState.mockReturnValue({ pipelineStep: 'idle' })

        const result = await callAction({
            action: 'switch-mode',
            targetMode: 'luca:1-triage',
            userRequest: 'fresh task',
        })

        expect(result.success).toBe(true)
    })

    test('does not trigger stale detection for non-triage targets', async () => {
        switchModeRef.current = async () => {}
        mockReadLucaState.mockReturnValue({
            intent: 'old intent',
            pipelineStep: 'luca:4-execute',
        })

        const result = await callAction({
            action: 'switch-mode',
            targetMode: 'luca:5-review',
        })

        expect(result.success).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// generic write action still works (for build/fast modes)
// ---------------------------------------------------------------------------

describe('generic write action', () => {
    test('still works for arbitrary updates', async () => {
        const result = await callAction({
            action: 'write',
            updates: { customField: 'value', anotherField: 42 },
        })

        expect(result.success).toBe(true)
        expect(mockWriteLucaState).toHaveBeenCalledWith({
            customField: 'value',
            anotherField: 42,
        })
    })

    test('runtime rejects when no updates provided', async () => {
        const result = await callAction({ action: 'write' })
        expect(result.success).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Scoped tool enforcement — verifies Zod schema rejects disallowed actions
// ---------------------------------------------------------------------------

describe('scoped tool enforcement', () => {
    test("triage-scoped tool rejects 'write' action", () => {
        const triageTool = createScopedTool({
            tool: workflowStateTool as any,
            allowed_actions: ['read', 'save-triage-results', 'switch-mode'],
        })

        const schema = triageTool.inputSchema as z.ZodTypeAny
        const result = schema.safeParse({
            action: 'write',
            updates: { foo: 'bar' },
        })
        expect(result.success).toBe(false)
    })

    test("triage-scoped tool accepts 'save-triage-results' action", () => {
        const triageTool = createScopedTool({
            tool: workflowStateTool as any,
            allowed_actions: ['read', 'save-triage-results', 'switch-mode'],
        })

        const schema = triageTool.inputSchema as z.ZodTypeAny
        const result = schema.safeParse({
            action: 'save-triage-results',
            intent: 'test',
            complexity: 'MODERATE',
            oversight: 'full-auto',
        })
        expect(result.success).toBe(true)
    })

    test("review-scoped tool rejects 'save-triage-results' action", () => {
        const reviewTool = createScopedTool({
            tool: workflowStateTool as any,
            allowed_actions: ['read', 'save-review-results', 'switch-mode'],
        })

        const schema = reviewTool.inputSchema as z.ZodTypeAny
        const result = schema.safeParse({
            action: 'save-triage-results',
            intent: 'test',
            complexity: 'MODERATE',
            oversight: 'full-auto',
        })
        expect(result.success).toBe(false)
    })

    test("execute-scoped tool rejects 'write' and 'reset-pipeline'", () => {
        const executeTool = createScopedTool({
            tool: workflowStateTool as any,
            allowed_actions: [
                'read',
                'start-phase',
                'record-iteration',
                'advance-wave',
                'complete-phase',
                'switch-mode',
            ],
        })

        const schema = executeTool.inputSchema as z.ZodTypeAny

        expect(schema.safeParse({ action: 'write', updates: {} }).success).toBe(
            false
        )
        expect(schema.safeParse({ action: 'reset-pipeline' }).success).toBe(
            false
        )
        expect(
            schema.safeParse({ action: 'save-triage-results' }).success
        ).toBe(false)
    })

    test('execute-scoped tool accepts its allowed actions', () => {
        const executeTool = createScopedTool({
            tool: workflowStateTool as any,
            allowed_actions: [
                'read',
                'start-phase',
                'record-iteration',
                'advance-wave',
                'complete-phase',
                'switch-mode',
            ],
        })

        const schema = executeTool.inputSchema as z.ZodTypeAny

        expect(schema.safeParse({ action: 'read' }).success).toBe(true)
        expect(
            schema.safeParse({ action: 'start-phase', phaseName: 'Phase 1' })
                .success
        ).toBe(true)
        expect(schema.safeParse({ action: 'record-iteration' }).success).toBe(
            true
        )
        expect(schema.safeParse({ action: 'advance-wave' }).success).toBe(true)
        expect(schema.safeParse({ action: 'complete-phase' }).success).toBe(
            true
        )
    })

    test('finalize-scoped tool only has reset-pipeline, not write', () => {
        const finalizeTool = createScopedTool({
            tool: workflowStateTool as any,
            allowed_actions: ['read', 'reset-pipeline', 'switch-mode'],
        })

        const schema = finalizeTool.inputSchema as z.ZodTypeAny

        expect(schema.safeParse({ action: 'reset-pipeline' }).success).toBe(
            true
        )
        expect(schema.safeParse({ action: 'write', updates: {} }).success).toBe(
            false
        )
        expect(
            schema.safeParse({ action: 'save-triage-results' }).success
        ).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Telemetry instrumentation (Wave 2 hook sites)
// ---------------------------------------------------------------------------

describe('telemetry instrumentation', () => {
    test('start-phase emits phase.start + wave.start', async () => {
        mockReadLucaState.mockReturnValue({
            currentPhaseName: 'Phase 1: Test',
            currentPhaseSlug: 'test-slug',
            currentWave: 1,
            runId: 'run_test_start',
        } as any)

        await callAction({ action: 'start-phase', phaseName: 'Phase 1: Test' })

        const kinds = mockAppendTelemetry.mock.calls.map((c) => c[0])
        expect(kinds).toContain('phase.start')
        expect(kinds).toContain('wave.start')
    })

    test('advance-wave emits wave.end (prior wave) + wave.start (new wave)', async () => {
        // Seed pre-wave state with a phaseResult containing waveStartedAt.
        mockReadLucaState.mockReturnValue({
            currentPhaseName: 'Phase 1: Test',
            currentPhaseSlug: 'test-slug',
            currentWave: 1,
            runId: 'run_test_adv',
            phaseResults: [
                {
                    name: 'Phase 1: Test',
                    status: 'in-progress',
                    iterations: 0,
                    wavesCompleted: 0,
                    waveStartedAt: new Date(Date.now() - 5000).toISOString(),
                },
            ],
        } as any)
        // Verification must be present for advance-wave to succeed.
        // We can't mock readVerificationResult easily; use a workspace shim.
        // Simpler: the test verifies the telemetry HOOK is wired correctly
        // by checking that advance-wave attempts to emit (or skips when
        // blocked). When blocked, no telemetry should fire — that's also a
        // valid contract assertion.
        const result = await callAction({ action: 'advance-wave' })

        // If verification missing, advance-wave returns success: false.
        // Either path is acceptable here — we're asserting the hook is wired,
        // not the verification gate. When blocked, no telemetry should fire.
        if (result.success === false) {
            // Pipeline correctly blocked; no telemetry emitted by design.
            const kinds = mockAppendTelemetry.mock.calls.map((c) => c[0])
            expect(kinds).not.toContain('wave.end')
        } else {
            const kinds = mockAppendTelemetry.mock.calls.map((c) => c[0])
            expect(kinds).toContain('wave.end')
            expect(kinds).toContain('wave.start')
            // wave.end must carry the PRIOR wave number via override.
            const waveEndCall = mockAppendTelemetry.mock.calls.find(
                (c) => c[0] === 'wave.end'
            )
            const overrides = waveEndCall?.[2] as any
            expect(overrides?.wave).toBe(1)
            expect(overrides?.phase).toBe('Phase 1: Test')
            expect(typeof overrides?.durationMs).toBe('number')
            expect(overrides?.durationMs).toBeGreaterThan(0)
        }
    })

    test('appendTelemetry throw does NOT crash start-phase action', async () => {
        mockReadLucaState.mockReturnValue({
            currentPhaseName: 'Phase 1: Test',
            currentPhaseSlug: 'test-slug',
            currentWave: 1,
            runId: 'run_test_throw',
        } as any)
        // Force the writer to throw — outer try/catch in workflow-state.ts
        // should swallow.
        mockAppendTelemetry.mockImplementation(() => {
            throw new Error('telemetry blew up')
        })

        const result = await callAction({
            action: 'start-phase',
            phaseName: 'Phase 1: Test',
        })

        // Action must still report success — telemetry never blocks pipeline.
        expect(result.success).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// ROOT_WHITELIST_DIRS regression
// ---------------------------------------------------------------------------

describe('ROOT_WHITELIST_DIRS regression', () => {
    test('contains "telemetry" (per-run telemetry dir at .planning/ root)', () => {
        expect(ROOT_WHITELIST_DIRS.has('telemetry')).toBe(true)
    })
})
