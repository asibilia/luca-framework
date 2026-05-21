import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test'

import {
    startTurn,
    resetTurn,
    recordToolStart,
    recordToolEnd,
    checkTurnCompletion,
    executeEnforcement,
    getCurrentTurn,
    PIPELINE_MODES,
    PIPELINE_ORDER,
} from '../orchestration/pipeline-guard.js'
import * as lucaStore from '../state/luca-store.js'
import type { LucaWorkflowState } from '../state/luca-store.js'
import * as sessionLedger from '../state/session-ledger.js'
import { followUpRef, switchModeRef } from '../util/refs.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock file-system-dependent modules
const mockReadLucaState = spyOn(lucaStore, 'readLucaState').mockReturnValue({
    pipelineStep: 'luca:1-triage',
} as LucaWorkflowState)
const mockWriteLucaState = spyOn(lucaStore, 'writeLucaState').mockReturnValue(
    {} as LucaWorkflowState
)
const mockAppendLedger = spyOn(sessionLedger, 'appendLedger').mockReturnValue(
    undefined
)

beforeEach(() => {
    resetTurn()
    followUpRef.current = null
    switchModeRef.current = null
    mockReadLucaState.mockReturnValue({
        pipelineStep: 'luca:1-triage',
    } as LucaWorkflowState)
    mockWriteLucaState.mockClear()
    mockAppendLedger.mockClear()
})

// ---------------------------------------------------------------------------
// PIPELINE_ORDER / PIPELINE_MODES sanity checks
// ---------------------------------------------------------------------------

describe('PIPELINE_ORDER', () => {
    test('defines the correct sequence', () => {
        expect(PIPELINE_ORDER['luca:1-triage']).toBe('luca:2-research')
        expect(PIPELINE_ORDER['luca:2-research']).toBe('luca:3-architect')
        expect(PIPELINE_ORDER['luca:3-architect']).toBe('luca:4-execute')
        expect(PIPELINE_ORDER['luca:4-execute']).toBe('luca:5-review')
        expect(PIPELINE_ORDER['luca:5-review']).toBe('luca:6-finalize')
        expect(PIPELINE_ORDER['luca:6-finalize']).toBeUndefined()
    })

    test('PIPELINE_MODES matches PIPELINE_ORDER keys', () => {
        expect(PIPELINE_MODES).toEqual(new Set(Object.keys(PIPELINE_ORDER)))
    })
})

// ---------------------------------------------------------------------------
// Turn lifecycle
// ---------------------------------------------------------------------------

describe('startTurn / resetTurn', () => {
    test('startTurn initializes tracking state', () => {
        startTurn('luca:1-triage')
        const turn = getCurrentTurn()
        expect(turn).not.toBeNull()
        expect(turn!.modeId).toBe('luca:1-triage')
        expect(turn!.toolCallCount).toBe(0)
        expect(turn!.switchModeCalled).toBe(false)
        expect(turn!.consecutiveMisses).toBe(0)
    })

    test('resetTurn clears all state', () => {
        startTurn('luca:1-triage')
        resetTurn()
        expect(getCurrentTurn()).toBeNull()
    })

    test('startTurn in same mode preserves consecutiveMisses', () => {
        startTurn('luca:1-triage')
        // Simulate a miss
        const enforcement = checkTurnCompletion('complete')
        expect(enforcement).not.toBeNull()
        expect(enforcement!.consecutiveMisses).toBe(1)

        // Re-enter the same mode — miss counter should carry over
        startTurn('luca:1-triage')
        expect(getCurrentTurn()!.consecutiveMisses).toBe(1)
    })

    test('startTurn in different mode resets consecutiveMisses', () => {
        startTurn('luca:1-triage')
        checkTurnCompletion('complete') // miss #1

        startTurn('luca:2-research') // different mode
        expect(getCurrentTurn()!.consecutiveMisses).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// Tool tracking
// ---------------------------------------------------------------------------

describe('recordToolStart / recordToolEnd', () => {
    test('increments tool call count', () => {
        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'classifyComplexity', { action: 'classify' })
        recordToolStart('tc-2', 'workflowState', { action: 'read' })
        expect(getCurrentTurn()!.toolCallCount).toBe(2)
    })

    test('detects switch-mode from workflowState tool', () => {
        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'workflowState', {
            action: 'switch-mode',
            targetMode: 'luca:2-research',
        })
        expect(getCurrentTurn()!.switchModeCalled).toBe(true)
    })

    test('does NOT detect switch-mode from non-workflowState tools', () => {
        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'classifyComplexity', {
            action: 'switch-mode',
        })
        expect(getCurrentTurn()!.switchModeCalled).toBe(false)
    })

    test('does NOT detect switch-mode for non-switch-mode actions', () => {
        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'workflowState', { action: 'read' })
        expect(getCurrentTurn()!.switchModeCalled).toBe(false)
    })

    test('ignores events when no turn is active', () => {
        // Should not throw
        recordToolStart('tc-1', 'workflowState', { action: 'switch-mode' })
        recordToolEnd('tc-1')
        expect(getCurrentTurn()).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// checkTurnCompletion
// ---------------------------------------------------------------------------

describe('checkTurnCompletion', () => {
    test('returns null when no turn is active', () => {
        expect(checkTurnCompletion('complete')).toBeNull()
    })

    test('returns null for non-complete reasons', () => {
        startTurn('luca:1-triage')
        expect(checkTurnCompletion('aborted')).toBeNull()
        expect(checkTurnCompletion('error')).toBeNull()
        expect(checkTurnCompletion('suspended')).toBeNull()
        expect(checkTurnCompletion(undefined)).toBeNull()
    })

    test('returns null for non-pipeline modes', () => {
        startTurn('build')
        // Manually set up — build isn't a pipeline mode so startTurn
        // would still track it, but checkTurnCompletion should skip
        expect(checkTurnCompletion('complete')).toBeNull()
    })

    test('returns null when switch-mode was called', () => {
        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'workflowState', {
            action: 'switch-mode',
            targetMode: 'luca:2-research',
        })
        recordToolEnd('tc-1')
        expect(checkTurnCompletion('complete')).toBeNull()
    })

    test('returns null for finalize mode (last pipeline step)', () => {
        startTurn('luca:6-finalize')
        // Agent completes finalize without switching — that's expected
        expect(checkTurnCompletion('complete')).toBeNull()
    })

    test('returns null when pipeline is idle (prevents stale guard enforcement)', () => {
        mockReadLucaState.mockReturnValue({
            pipelineStep: 'idle',
        } as LucaWorkflowState)
        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'classifyComplexity', { action: 'classify' })
        recordToolEnd('tc-1')
        expect(checkTurnCompletion('complete')).toBeNull()
    })

    test('returns null when pipelineStep is unset', () => {
        mockReadLucaState.mockReturnValue({} as LucaWorkflowState)
        startTurn('luca:1-triage')
        expect(checkTurnCompletion('complete')).toBeNull()
    })

    test('returns nudge on first miss in pipeline mode', () => {
        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'classifyComplexity', { action: 'classify' })
        recordToolEnd('tc-1')

        const result = checkTurnCompletion('complete')
        expect(result).not.toBeNull()
        expect(result!.action).toBe('nudge')
        expect(result!.modeId).toBe('luca:1-triage')
        expect(result!.nextMode).toBe('luca:2-research')
        expect(result!.consecutiveMisses).toBe(1)
        expect(result!.toolCallCount).toBe(1)
    })

    test('returns force on second consecutive miss', () => {
        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'classifyComplexity', { action: 'classify' })
        const first = checkTurnCompletion('complete')
        expect(first!.action).toBe('nudge')

        // Same mode re-entered (followUp triggered a new agent turn)
        startTurn('luca:1-triage')
        const second = checkTurnCompletion('complete')
        expect(second!.action).toBe('force')
        expect(second!.consecutiveMisses).toBe(2)
    })

    test('resets consecutive misses on successful switch-mode', () => {
        startTurn('luca:1-triage')
        checkTurnCompletion('complete') // miss #1

        startTurn('luca:1-triage')
        recordToolStart('tc-1', 'workflowState', {
            action: 'switch-mode',
            targetMode: 'luca:2-research',
        })
        const result = checkTurnCompletion('complete')
        expect(result).toBeNull() // no enforcement
        expect(getCurrentTurn()!.consecutiveMisses).toBe(0)
    })

    test('works for all pipeline modes with correct next mode', () => {
        const testCases = [
            { mode: 'luca:1-triage', expectedNext: 'luca:2-research' },
            { mode: 'luca:2-research', expectedNext: 'luca:3-architect' },
            { mode: 'luca:3-architect', expectedNext: 'luca:4-execute' },
            { mode: 'luca:4-execute', expectedNext: 'luca:5-review' },
            { mode: 'luca:5-review', expectedNext: 'luca:6-finalize' },
        ]

        for (const { mode, expectedNext } of testCases) {
            resetTurn()
            startTurn(mode)
            const result = checkTurnCompletion('complete')
            expect(result).not.toBeNull()
            expect(result!.nextMode).toBe(expectedNext)
        }
    })
})

// ---------------------------------------------------------------------------
// executeEnforcement
// ---------------------------------------------------------------------------

describe('executeEnforcement', () => {
    test('nudge sends followUp message and logs to ledger', async () => {
        const mockFollowUp = mock(() => Promise.resolve())
        followUpRef.current = mockFollowUp

        await executeEnforcement({
            action: 'nudge',
            modeId: 'luca:1-triage',
            nextMode: 'luca:2-research',
            consecutiveMisses: 1,
            toolCallCount: 3,
        })

        // Verify followUp was called with a message containing the target mode
        expect(mockFollowUp).toHaveBeenCalledTimes(1)
        expect(mockFollowUp).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('luca:2-research'),
            })
        )

        // Verify ledger entry
        expect(mockAppendLedger).toHaveBeenCalledWith(
            'pipeline-enforcement',
            expect.objectContaining({
                mode: 'luca:1-triage',
                nextMode: 'luca:2-research',
                reason: 'missing-switch-mode',
            })
        )
    })

    test('nudge is graceful when followUpRef is null', async () => {
        followUpRef.current = null

        // Should not throw
        await executeEnforcement({
            action: 'nudge',
            modeId: 'luca:1-triage',
            nextMode: 'luca:2-research',
            consecutiveMisses: 1,
            toolCallCount: 0,
        })

        // Ledger still logged
        expect(mockAppendLedger).toHaveBeenCalled()
    })

    test('force calls switchModeRef and writes state', async () => {
        const mockSwitch = mock(() => Promise.resolve())
        switchModeRef.current = mockSwitch

        await executeEnforcement({
            action: 'force',
            modeId: 'luca:1-triage',
            nextMode: 'luca:2-research',
            consecutiveMisses: 2,
            toolCallCount: 5,
        })

        // Verify state was written
        expect(mockWriteLucaState).toHaveBeenCalledWith({
            pipelineStep: 'luca:2-research',
            nextMode: 'luca:2-research',
        })

        // Verify switchMode was called
        expect(mockSwitch).toHaveBeenCalledWith('luca:2-research')

        // Verify ledger entries (forced-transition + mode-transition)
        expect(mockAppendLedger).toHaveBeenCalledWith(
            'pipeline-forced-transition',
            expect.objectContaining({
                mode: 'luca:1-triage',
                nextMode: 'luca:2-research',
                reason: 'agent-ignored-nudge',
            })
        )
        expect(mockAppendLedger).toHaveBeenCalledWith(
            'mode-transition',
            expect.objectContaining({
                from: 'luca:1-triage',
                to: 'luca:2-research',
            })
        )
    })

    test('force resets turn state after transition', async () => {
        switchModeRef.current = mock(() => Promise.resolve())

        startTurn('luca:1-triage')

        await executeEnforcement({
            action: 'force',
            modeId: 'luca:1-triage',
            nextMode: 'luca:2-research',
            consecutiveMisses: 2,
            toolCallCount: 0,
        })

        expect(getCurrentTurn()).toBeNull()
    })

    test('force is graceful when switchModeRef is null', async () => {
        switchModeRef.current = null

        // Should not throw
        await executeEnforcement({
            action: 'force',
            modeId: 'luca:1-triage',
            nextMode: 'luca:2-research',
            consecutiveMisses: 2,
            toolCallCount: 0,
        })

        // State still written, ledger still logged
        expect(mockWriteLucaState).toHaveBeenCalled()
        expect(mockAppendLedger).toHaveBeenCalled()
    })
})
