/**
 * Pipeline transition enforcement — watchdog that detects when a pipeline
 * mode agent finishes its turn without calling `workflowState(action: "switch-mode")`.
 *
 * Two escalation levels:
 * 1. First miss → send a followUp nudge demanding the agent call switch-mode
 * 2. Second consecutive miss → force the transition directly via switchModeRef
 *
 * The module tracks per-turn state (tool calls, switch-mode detection) and
 * correlates tool_start → tool_end events via toolCallId to accurately detect
 * when the workflow-state tool's switch-mode action was invoked.
 */
import { readLucaState, writeLucaState } from './luca-store.js'
import { followUpRef, switchModeRef } from './refs.js'
import { appendLedger } from './session-ledger.js'
import { PIPELINE_ORDER } from './tools/workflow-state.js'

export { PIPELINE_ORDER }
export const PIPELINE_MODES = new Set(Object.keys(PIPELINE_ORDER))

// ---------------------------------------------------------------------------
// Turn tracking state
// ---------------------------------------------------------------------------

interface TurnState {
    /** The pipeline mode this turn started in */
    modeId: string
    /** Number of tool calls observed during this turn */
    toolCallCount: number
    /** Whether switch-mode was successfully called */
    switchModeCalled: boolean
    /** Consecutive enforcement nudges sent without a successful switch-mode */
    consecutiveMisses: number
}

/** Active tool_start → toolName+args mapping for tool_end correlation */
interface PendingToolCall {
    toolName: string
    isSwitchMode: boolean
}

let currentTurn: TurnState | null = null
const pendingToolCalls = new Map<string, PendingToolCall>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Begin tracking a new turn when entering a pipeline mode.
 * Preserves the consecutive miss counter across turns in the same mode
 * (for escalation tracking).
 */
export function startTurn(modeId: string): void {
    const prevMisses =
        currentTurn && currentTurn.modeId === modeId
            ? currentTurn.consecutiveMisses
            : 0

    currentTurn = {
        modeId,
        toolCallCount: 0,
        switchModeCalled: false,
        consecutiveMisses: prevMisses,
    }
    pendingToolCalls.clear()
}

/**
 * Record a tool_start event. Tracks the toolCallId → toolName mapping
 * so we can correlate with tool_end later.
 *
 * Also detects switch-mode calls by inspecting the args of the
 * workflow-state tool.
 */
export function recordToolStart(
    toolCallId: string,
    toolName: string,
    args: unknown
): void {
    if (!currentTurn) return
    currentTurn.toolCallCount++

    // Check if this is a workflow-state switch-mode call
    const isSwitchMode =
        toolName === 'workflowState' &&
        typeof args === 'object' &&
        args !== null &&
        (args as Record<string, unknown>).action === 'switch-mode'

    pendingToolCalls.set(toolCallId, { toolName, isSwitchMode })

    // Optimistic: mark switch-mode as called on tool_start.
    // Even if the tool errors, the intent was there — we don't want to
    // double-nudge for a transient failure.
    if (isSwitchMode) {
        currentTurn.switchModeCalled = true
    }
}

/**
 * Record a tool_end event. Confirms the switch-mode call completed
 * (or errored — we still count it as "attempted").
 */
export function recordToolEnd(toolCallId: string): void {
    pendingToolCalls.delete(toolCallId)
}

/**
 * Check turn completion when agent_end fires. Returns enforcement action
 * needed (if any), or null if no enforcement is required.
 */
export function checkTurnCompletion(reason: string | undefined): {
    action: 'nudge' | 'force'
    modeId: string
    nextMode: string
    consecutiveMisses: number
    toolCallCount: number
} | null {
    if (!currentTurn) return null

    // Only enforce on normal completions — not aborts, errors, or suspensions
    if (reason !== 'complete') {
        return null
    }

    // Only enforce on pipeline modes
    if (!PIPELINE_MODES.has(currentTurn.modeId)) {
        return null
    }

    // Don't enforce if the pipeline is not actively running — prevents
    // stale guard state from triggering false enforcement after completion.
    const state = readLucaState()
    if (!state.pipelineStep || state.pipelineStep === 'idle') {
        return null
    }

    // If switch-mode was called, all good
    if (currentTurn.switchModeCalled) {
        currentTurn.consecutiveMisses = 0
        return null
    }

    // Finalize is the last step — no switch-mode needed
    if (currentTurn.modeId === 'luca:6-finalize') {
        return null
    }

    // Agent completed without calling switch-mode — enforcement needed
    const nextMode = PIPELINE_ORDER[currentTurn.modeId]
    if (!nextMode) return null

    currentTurn.consecutiveMisses++

    const action = currentTurn.consecutiveMisses >= 2 ? 'force' : 'nudge'

    return {
        action,
        modeId: currentTurn.modeId,
        nextMode,
        consecutiveMisses: currentTurn.consecutiveMisses,
        toolCallCount: currentTurn.toolCallCount,
    }
}

/**
 * Reset all tracking state. Called when user manually switches out of
 * a pipeline mode or when the pipeline completes.
 */
export function resetTurn(): void {
    currentTurn = null
    pendingToolCalls.clear()
}

/**
 * Get current turn state (for testing/debugging).
 */
export function getCurrentTurn(): TurnState | null {
    return currentTurn ? { ...currentTurn } : null
}

// ---------------------------------------------------------------------------
// Enforcement actions — called from index.ts subscription handler
// ---------------------------------------------------------------------------

/**
 * Execute the enforcement action returned by checkTurnCompletion().
 * Handles both nudge (followUp message) and force (direct switchMode).
 */
export async function executeEnforcement(enforcement: {
    action: 'nudge' | 'force'
    modeId: string
    nextMode: string
    consecutiveMisses: number
    toolCallCount: number
}): Promise<void> {
    const { action, modeId, nextMode, consecutiveMisses, toolCallCount } =
        enforcement

    if (action === 'nudge') {
        appendLedger('pipeline-enforcement', {
            mode: modeId,
            nextMode,
            reason: 'missing-switch-mode',
            toolCallCount,
            consecutiveMisses,
        })

        if (followUpRef.current) {
            await followUpRef.current({
                content: [
                    `⚠ **Pipeline enforcement**: You completed your turn in **${modeId}** mode without calling \`workflowState(action: "switch-mode")\`.`,
                    ``,
                    `You **MUST** transition to the next pipeline step now. Call:`,
                    `\`\`\``,
                    `workflowState(action: "switch-mode", targetMode: "${nextMode}")`,
                    `\`\`\``,
                    ``,
                    `Do NOT do any other work. Call switch-mode immediately.`,
                ].join('\n'),
            })
        }
    } else {
        // Force transition — agent ignored the nudge
        appendLedger('pipeline-forced-transition', {
            mode: modeId,
            nextMode,
            reason: 'agent-ignored-nudge',
            consecutiveMisses,
        })

        // Write state as if the agent had called switch-mode properly
        writeLucaState({ pipelineStep: nextMode, nextMode })
        appendLedger('mode-transition', { from: modeId, to: nextMode })

        if (switchModeRef.current) {
            await switchModeRef.current(nextMode)
        }

        // Reset after forced transition
        resetTurn()
    }
}
