import { describe, test, expect, beforeEach, spyOn } from 'bun:test'
import { z } from 'zod'

import * as lucaStore from '../state/luca-store.js'
import * as sessionLedger from '../state/session-ledger.js'
import * as telemetry from '../state/telemetry.js'
import * as verificationResult from '../state/verification-result.js'
import * as phaseDiff from '../analysis/phase-diff.js'
import { createScopedTool } from '../tools/create-scoped-tool.js'
import { workflowStateTool, PIPELINE_ORDER } from '../tools/workflow-state.js'
import * as repoCleanup from '../tools/repo-cleanup.js'
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
const mockReadVerificationResult = spyOn(
    verificationResult,
    'readVerificationResult'
).mockReturnValue(null)
const mockComputePhaseDiff = spyOn(
    phaseDiff,
    'computePhaseDiff'
).mockReturnValue({
    filesChanged: ['src/foo.ts'],
    commitsAdded: ['abc123'],
} as any)
const mockDetectStragglers = spyOn(
    repoCleanup,
    'detectStragglers'
).mockReturnValue({ rootStragglers: [], unknownRootDirs: [] } as any)

beforeEach(() => {
    mockReadLucaState.mockReturnValue({} as any)
    mockWriteLucaState.mockClear().mockImplementation((updates: any) => updates)
    mockAppendLedger.mockClear()
    mockAppendTelemetry.mockClear().mockReturnValue(undefined)
    mockReadVerificationResult.mockClear().mockReturnValue(null)
    mockComputePhaseDiff.mockClear().mockReturnValue({
        filesChanged: ['src/foo.ts'],
        commitsAdded: ['abc123'],
    } as any)
    mockDetectStragglers
        .mockClear()
        .mockReturnValue({ rootStragglers: [], unknownRootDirs: [] } as any)
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
        // Mock the verification gate so the happy-path runs (not the
        // vacuous "no verification → blocked" branch). The verifier
        // contract for advance-wave is `verification.wave === currentWave`.
        mockReadVerificationResult.mockReturnValue({
            wave: 1,
            status: 'PASS',
            mode: 'quick',
            criteria: [],
            checks: [],
            convergence: 'resolved',
            errorFingerprints: [],
            recommendation: 'proceed',
        } as any)

        const result = await callAction({ action: 'advance-wave' })

        expect(result.success).toBe(true)
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
    })

    test('complete-phase emits wave.end + phase.end with pre-mutation context', async () => {
        // MF-2: complete-phase telemetry hook test. Mock readLucaState with
        // phaseResults containing startedAt + waveStartedAt; mock
        // readVerificationResult to allow action through. Assert both
        // wave.end AND phase.end are emitted with overrides carrying the
        // closing phase + numeric durationMs.
        //
        // Mock chain required for complete-phase happy path (4 spies):
        //   readLucaState          → overridden below (phaseResults with timestamps)
        //   readVerificationResult → overridden below (PASS for wave 2)
        //   computePhaseDiff       → beforeEach default
        //                            ({ filesChanged, commitsAdded }) — bypasses
        //                            the `if (diff.isEmpty)` PHASE_NO_CHANGES guard
        //   detectStragglers       → beforeEach default
        //                            ({ rootStragglers: [], unknownRootDirs: [] }) —
        //                            bypasses the straggler-blocking guard
        // If any future guard is added before the telemetry hook, mock it here.
        const waveStarted = new Date(Date.now() - 3000).toISOString()
        const phaseStarted = new Date(Date.now() - 9000).toISOString()
        mockReadLucaState.mockReturnValue({
            currentPhaseName: 'Phase 1: Closing',
            currentPhaseSlug: 'closing-slug',
            currentWave: 2,
            runId: 'run_test_close',
            currentPhaseStartSnapshot: {
                headSha: 'deadbeef',
                dirtyFiles: [],
                gitAvailable: true,
            },
            phaseResults: [
                {
                    name: 'Phase 1: Closing',
                    status: 'in-progress',
                    iterations: 1,
                    wavesCompleted: 1,
                    startedAt: phaseStarted,
                    waveStartedAt: waveStarted,
                },
            ],
        } as any)
        mockReadVerificationResult.mockReturnValue({
            wave: 2,
            status: 'PASS',
            mode: 'full',
            criteria: [],
            checks: [],
            convergence: 'resolved',
            errorFingerprints: [],
            recommendation: 'proceed',
        } as any)

        const result = await callAction({
            action: 'complete-phase',
            verificationPassed: true,
            reviewPassed: true,
        })

        expect(result.success).toBe(true)
        const kinds = mockAppendTelemetry.mock.calls.map((c) => c[0])
        expect(kinds).toContain('wave.end')
        expect(kinds).toContain('phase.end')

        const waveEnd = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'wave.end'
        )
        const phaseEnd = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'phase.end'
        )

        const wOverrides = waveEnd?.[2] as any
        expect(wOverrides?.wave).toBe(2)
        expect(wOverrides?.phase).toBe('Phase 1: Closing')
        expect(wOverrides?.slug).toBe('closing-slug')
        expect(typeof wOverrides?.durationMs).toBe('number')
        expect(wOverrides?.durationMs).toBeGreaterThan(0)

        const pOverrides = phaseEnd?.[2] as any
        expect(pOverrides?.wave).toBe(2)
        expect(pOverrides?.phase).toBe('Phase 1: Closing')
        expect(pOverrides?.slug).toBe('closing-slug')
        expect(typeof pOverrides?.durationMs).toBe('number')
        expect(pOverrides?.durationMs).toBeGreaterThan(0)
    })

    test('advance-wave emits wave.end with durationMs:null when waveStartedAt is malformed', async () => {
        // Regression: Copilot PR #239 review #3228846363. A corrupted /
        // user-edited waveStartedAt that fails Date parsing would produce
        // NaN; Zod rejects NaN, silently dropping the entire wave.end event.
        // The finiteOrNull guard must convert NaN to null so the event is
        // still emitted (just without a duration).
        mockReadLucaState.mockReturnValue({
            currentPhaseName: 'Phase 1: Test',
            currentPhaseSlug: 'test-slug',
            currentWave: 1,
            runId: 'run_test_nan',
            phaseResults: [
                {
                    name: 'Phase 1: Test',
                    status: 'in-progress',
                    iterations: 0,
                    wavesCompleted: 0,
                    waveStartedAt: 'not-an-iso-date', // → new Date(...).getTime() = NaN
                },
            ],
        } as any)
        mockReadVerificationResult.mockReturnValue({
            wave: 1,
            status: 'PASS',
            mode: 'quick',
            criteria: [],
            checks: [],
            convergence: 'resolved',
            errorFingerprints: [],
            recommendation: 'proceed',
        } as any)

        const result = await callAction({ action: 'advance-wave' })
        expect(result.success).toBe(true)

        const waveEnd = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'wave.end'
        )
        const overrides = waveEnd?.[2] as any
        expect(overrides?.durationMs).toBeNull()
    })

    test('complete-phase emits wave.end + phase.end with durationMs:null when timestamps malformed', async () => {
        // Regression: Copilot PR #239 review #3228846383. Same NaN trap as
        // advance-wave, applied to both closing events at complete-phase.
        mockReadLucaState.mockReturnValue({
            currentPhaseName: 'Phase 1: Closing',
            currentPhaseSlug: 'closing-slug',
            currentWave: 2,
            runId: 'run_test_nan_close',
            currentPhaseStartSnapshot: {
                headSha: 'deadbeef',
                dirtyFiles: [],
                gitAvailable: true,
            },
            phaseResults: [
                {
                    name: 'Phase 1: Closing',
                    status: 'in-progress',
                    iterations: 1,
                    wavesCompleted: 1,
                    startedAt: 'garbage', // → NaN
                    waveStartedAt: 'also-garbage', // → NaN
                },
            ],
        } as any)
        mockReadVerificationResult.mockReturnValue({
            wave: 2,
            status: 'PASS',
            mode: 'full',
            criteria: [],
            checks: [],
            convergence: 'resolved',
            errorFingerprints: [],
            recommendation: 'proceed',
        } as any)

        const result = await callAction({
            action: 'complete-phase',
            verificationPassed: true,
            reviewPassed: true,
        })
        expect(result.success).toBe(true)

        const waveEnd = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'wave.end'
        )
        const phaseEnd = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'phase.end'
        )
        expect((waveEnd?.[2] as any)?.durationMs).toBeNull()
        expect((phaseEnd?.[2] as any)?.durationMs).toBeNull()
    })

    // Note: A "start-phase survives appendTelemetry throw" test previously
    // lived here. It was deleted in review iter-2 (MF-2) for two reasons:
    //
    //   1. With SF-5 (outer try/catch wrappers removed at hook sites), the
    //      action no longer has an integration-level guard around
    //      appendTelemetry. Mocking the writer to throw would correctly
    //      propagate to the outer execute() guard — surfacing as a generic
    //      error, NOT success — which contradicts the fail-safe contract.
    //
    //   2. The genuine fail-safe contract — "appendTelemetry never throws"
    //      — is proven against a real failure mode (appendFileSync
    //      throwing ENOSPC) in telemetry.test.ts:149-164:
    //         "does NOT throw when appendFileSync throws (disk full / permission)"
    //      That unit test is the source of truth. Duplicating it as an
    //      integration test by mocking the writer to violate its own
    //      contract would test nothing useful.
    //
    // If the contract regresses in the future (e.g. someone adds a `throw`
    // path inside appendTelemetry that bypasses its outer try/catch), the
    // failing test will be telemetry.test.ts, not this file.
})

// ---------------------------------------------------------------------------
// ROOT_WHITELIST_DIRS regression
// ---------------------------------------------------------------------------

describe('ROOT_WHITELIST_DIRS regression', () => {
    test('contains "telemetry" (per-run telemetry dir at .planning/ root)', () => {
        expect(ROOT_WHITELIST_DIRS.has('telemetry')).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// switch-mode telemetry
// ---------------------------------------------------------------------------

describe('switch-mode telemetry', () => {
    test('(a) emits mode.end with populated durationMs for prior mode', async () => {
        switchModeRef.current = async () => {}
        const priorModeStartedAt = new Date(Date.now() - 100).toISOString()
        mockReadLucaState.mockReturnValue({
            pipelineStep: 'luca:1-triage',
            currentModeStartedAt: priorModeStartedAt,
            currentPhaseName: null,
            currentPhaseSlug: null,
            currentWave: null,
        } as any)

        const result = await callAction({
            action: 'switch-mode',
            targetMode: 'luca:2-research',
        })

        expect(result.success).toBe(true)
        const modeEndCall = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'mode.end'
        )
        expect(modeEndCall).toBeDefined()
        const overrides = modeEndCall![2] as any
        expect(typeof overrides?.durationMs).toBe('number')
        expect(overrides?.durationMs).toBeGreaterThan(0)
    })

    test('(b) emits mode.start with durationMs: null for incoming mode', async () => {
        switchModeRef.current = async () => {}
        const priorModeStartedAt = new Date(Date.now() - 100).toISOString()
        mockReadLucaState.mockReturnValue({
            pipelineStep: 'luca:1-triage',
            currentModeStartedAt: priorModeStartedAt,
        } as any)

        await callAction({
            action: 'switch-mode',
            targetMode: 'luca:2-research',
        })

        const modeStartCall = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'mode.start'
        )
        expect(modeStartCall).toBeDefined()
        const overrides = modeStartCall![2] as any
        expect(overrides?.durationMs ?? null).toBeNull()
        const meta = modeStartCall![1] as any
        expect(meta?.to).toBe('luca:2-research')
    })

    test('(c) first switch (no prior currentModeStartedAt) emits mode.end with durationMs: null', async () => {
        switchModeRef.current = async () => {}
        mockReadLucaState.mockReturnValue({
            pipelineStep: 'idle',
            // no currentModeStartedAt
        } as any)

        const result = await callAction({
            action: 'switch-mode',
            targetMode: 'luca:1-triage',
        })

        expect(result.success).toBe(true)
        const modeEndCall = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'mode.end'
        )
        expect(modeEndCall).toBeDefined()
        const overrides = modeEndCall![2] as any
        expect(overrides?.durationMs).toBeNull()
    })

    test('(d) malformed currentModeStartedAt → durationMs: null (NaN guard)', async () => {
        switchModeRef.current = async () => {}
        mockReadLucaState.mockReturnValue({
            pipelineStep: 'luca:1-triage',
            currentModeStartedAt: 'not-a-valid-date',
        } as any)

        await callAction({
            action: 'switch-mode',
            targetMode: 'luca:2-research',
        })

        const modeEndCall = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'mode.end'
        )
        expect(modeEndCall).toBeDefined()
        const overrides = modeEndCall![2] as any
        expect(overrides?.durationMs).toBeNull()
    })

    test('(e) failed switch (switchModeRef throws) → no telemetry emitted', async () => {
        switchModeRef.current = async () => {
            throw new Error('switch failed')
        }
        mockReadLucaState.mockReturnValue({
            pipelineStep: 'luca:1-triage',
            currentModeStartedAt: new Date().toISOString(),
        } as any)

        const result = await callAction({
            action: 'switch-mode',
            targetMode: 'luca:2-research',
        })

        expect(result.success).toBe(false)
        // appendTelemetry must NOT have been called — switch failed before hook
        const modeCalls = mockAppendTelemetry.mock.calls.filter(
            (c) => c[0] === 'mode.end' || c[0] === 'mode.start'
        )
        expect(
            modeCalls,
            'switch failed but telemetry leaked — hook must be AFTER switchModeRef.current() resolves'
        ).toHaveLength(0)
    })

    test('(f) reset-pipeline clears currentModeStartedAt → next mode.end has durationMs: null', async () => {
        // First: perform a reset-pipeline to clear session state
        await callAction({ action: 'reset-pipeline' })

        // Verify writeLucaState was called with currentModeStartedAt: undefined
        const resetCalls = mockWriteLucaState.mock.calls
        const resetStateCall = resetCalls.find(
            (c) => c[0] && 'currentModeStartedAt' in (c[0] as any)
        )
        expect(resetStateCall).toBeDefined()
        expect((resetStateCall![0] as any).currentModeStartedAt).toBeUndefined()

        // Simulate the state after reset: currentModeStartedAt is gone
        mockWriteLucaState.mockClear()
        mockAppendTelemetry.mockClear()
        switchModeRef.current = async () => {}
        mockReadLucaState.mockReturnValue({
            pipelineStep: 'idle',
            // currentModeStartedAt deliberately absent — simulates post-reset state
        } as any)

        await callAction({
            action: 'switch-mode',
            targetMode: 'luca:1-triage',
        })

        const modeEndCall = mockAppendTelemetry.mock.calls.find(
            (c) => c[0] === 'mode.end'
        )
        expect(modeEndCall).toBeDefined()
        const overrides = modeEndCall![2] as any
        expect(overrides?.durationMs).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// record-subagent telemetry
// ---------------------------------------------------------------------------

describe('record-subagent telemetry', () => {
    test('(a) invoke emits subagent.invoke with correlationId + role in meta', async () => {
        mockAppendTelemetry.mockClear()
        await callAction({
            action: 'record-subagent',
            event: 'invoke',
            role: 'executor',
            correlationId: 'executor-1747097200000',
        })
        expect(mockAppendTelemetry).toHaveBeenCalledTimes(1)
        const [kind, meta] = mockAppendTelemetry.mock.calls[0]!
        expect(kind).toBe('subagent.invoke')
        expect(meta).toMatchObject({
            role: 'executor',
            correlationId: 'executor-1747097200000',
        })
    })

    test('(b) complete emits subagent.complete with tokens + durationMs + success', async () => {
        mockAppendTelemetry.mockClear()
        await callAction({
            action: 'record-subagent',
            event: 'complete',
            role: 'verifier',
            correlationId: 'verifier-1747097200000',
            inputTokens: 5000,
            outputTokens: 1200,
            durationMs: 30000,
            success: true,
            model: 'claude-opus-4-5',
        })
        expect(mockAppendTelemetry).toHaveBeenCalledTimes(1)
        const [kind, meta] = mockAppendTelemetry.mock.calls[0]!
        expect(kind).toBe('subagent.complete')
        expect(meta).toMatchObject({
            role: 'verifier',
            correlationId: 'verifier-1747097200000',
            inputTokens: 5000,
            outputTokens: 1200,
            durationMs: 30000,
            success: true,
            model: 'claude-opus-4-5',
        })
    })

    test('(c) missing role → ActionValidationError surfaces as failure result', async () => {
        mockAppendTelemetry.mockClear()
        const result = await callAction({
            action: 'record-subagent',
            event: 'invoke',
            // role missing
            correlationId: 'x-123',
        })
        expect(result.success).toBe(false)
        expect(mockAppendTelemetry).not.toHaveBeenCalled()
    })

    test('(d) null tokens accepted — record still emitted', async () => {
        mockAppendTelemetry.mockClear()
        await callAction({
            action: 'record-subagent',
            event: 'complete',
            role: 'learner',
            correlationId: 'learner-123',
            inputTokens: null,
            outputTokens: null,
            success: true,
        })
        expect(mockAppendTelemetry).toHaveBeenCalledTimes(1)
        const [kind, meta] = mockAppendTelemetry.mock.calls[0]!
        expect(kind).toBe('subagent.complete')
        expect((meta as Record<string, unknown>).inputTokens).toBeNull()
        expect((meta as Record<string, unknown>).outputTokens).toBeNull()
    })

    test('(e) token > 10_000_000 clamped to null', async () => {
        mockAppendTelemetry.mockClear()
        await callAction({
            action: 'record-subagent',
            event: 'complete',
            role: 'researcher',
            correlationId: 'researcher-123',
            inputTokens: 99_999_999,
            outputTokens: 11_000_000,
            success: true,
        })
        const [, meta] = mockAppendTelemetry.mock.calls[0]!
        expect((meta as Record<string, unknown>).inputTokens).toBeNull()
        expect((meta as Record<string, unknown>).outputTokens).toBeNull()
    })

    test('(f) event=invoke → kind subagent.invoke; event=complete → kind subagent.complete', async () => {
        mockAppendTelemetry.mockClear()
        for (const event of ['invoke', 'complete'] as const) {
            await callAction({
                action: 'record-subagent',
                event,
                role: 'reviewer',
                correlationId: `reviewer-${event}-123`,
            })
        }
        const kinds = mockAppendTelemetry.mock.calls.map((c) => c[0])
        expect(kinds).toContain('subagent.invoke')
        expect(kinds).toContain('subagent.complete')
    })

    test('(g) role > 64 chars → ActionValidationError (success: false)', async () => {
        const result = await callAction({
            action: 'record-subagent',
            event: 'invoke',
            role: 'x'.repeat(65),
            correlationId: 'x-123',
        })
        // Rejected either by Mastra inputSchema validation ({ error: true, ... })
        // or by per-action parseAction ({ success: false, ... }). Both paths
        // prove the .max(64) cap is enforced before telemetry emission.
        expect(result.success !== true).toBe(true)
    })
})
