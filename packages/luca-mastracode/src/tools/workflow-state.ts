import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { MODE_PERMISSIONS } from './mode-permissions.js'

import {
    readLucaState,
    writeLucaState,
    startPhase,
    recordIteration,
    advanceWave,
    completePhase,
    type LucaWorkflowState,
} from '../luca-store.js'
import { switchModeRef, contextRefresherRef } from '../refs.js'
import { appendLedger } from '../session-ledger.js'

const VALID_MODES = Object.keys(MODE_PERMISSIONS)

/**
 * Pipeline step order and transition map.
 *
 * MANUAL MIRROR: This map defines step transitions (who can come next).
 * It is manually maintained alongside PIPELINE_STEPS_ORDERED in `../pipeline-tui.ts`
 * (the canonical ordered list with display labels). Both lists must stay synchronized:
 * if you add, remove, or rename a step, update BOTH files.
 *
 * Currently these are kept separate because they serve different purposes:
 * - PIPELINE_STEPS_ORDERED (pipeline-tui.ts): ordered list with labels, used for TUI progress display
 * - PIPELINE_ORDER (this file): transition mapping, used for step sequencing/validation
 *
 * Note: A future refactor should consolidate these into a single shared module
 * to eliminate manual synchronization.
 *
 * Related: BARE_TO_NAMESPACED in `../luca-store.ts` — historical migration map
 * for mode ID renames; update separately if IDs change.
 */
export const PIPELINE_ORDER: Record<string, string | undefined> = {
    'luca:1-triage': 'luca:2-research',
    'luca:2-research': 'luca:3-architect',
    'luca:3-architect': 'luca:4-execute',
    'luca:4-execute': 'luca:5-review',
    'luca:5-review': 'luca:6-finalize',
    'luca:6-finalize': undefined,
}

/**
 * Documented backward transitions that bypass the "no backward step" check.
 * - Review → Execute:    iteration loop for MUST-FIX issues (review.md Step 7B)
 * - Finalize → Architect: cross-milestone continuation (finalize.md Step 5)
 * - Finalize → Execute:   gap-detected rework (finalize.md Step 4)
 */
const ALLOWED_BACKWARD_TRANSITIONS: Record<string, Set<string>> = {
    'luca:5-review': new Set(['luca:4-execute']),
    'luca:6-finalize': new Set(['luca:3-architect', 'luca:4-execute']),
}

/**
 * Detect stale pipeline state from a previous run. Returns true if
 * the state contains leftover intent or an active (non-idle) pipelineStep
 * that would contaminate a new pipeline run.
 */
function hasStaleState(state: LucaWorkflowState): boolean {
    if (state.pipelineStep && state.pipelineStep !== 'idle') return true
    if (state.intent) return true
    return false
}

// ── Per-action Zod schemas ──────────────────────────────────────────
// Used for runtime validation + type narrowing in the execute handler.
// Actions with no extra fields (read, record-iteration, advance-wave,
// reset-pipeline) don't need a runtime parse — the flat inputSchema
// already validates them via the action enum.

const writeAction = z.object({
    action: z.literal('write'),
    updates: z
        .record(z.string(), z.unknown())
        .describe('State fields to update'),
})

const switchModeAction = z.object({
    action: z.literal('switch-mode'),
    targetMode: z
        .string()
        .describe(
            'Target mode ID to switch to. Must be one of: build, plan, fast, luca:discuss, luca:1-triage, luca:2-research, luca:3-architect, luca:4-execute, luca:5-review, luca:6-finalize'
        ),
    userRequest: z
        .string()
        .optional()
        .describe(
            "Original user request to pass to the target mode. Written to state as 'intent' before switching."
        ),
})

const startPhaseAction = z.object({
    action: z.literal('start-phase'),
    phaseName: z.string().describe('Phase name from ROADMAP.md'),
})

const completePhaseAction = z.object({
    action: z.literal('complete-phase'),
    verificationPassed: z
        .boolean()
        .optional()
        .describe('Whether verification passed'),
    reviewPassed: z.boolean().optional().describe('Whether review passed'),
})

const saveTriageResultsAction = z.object({
    action: z.literal('save-triage-results'),
    intent: z.string().describe('Parsed intent summary'),
    complexity: z
        .enum(['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL'])
        .describe('Classified complexity level'),
    oversight: z
        .enum(['full-auto', 'checkpoint', 'human-in-loop'])
        .describe('Oversight mode'),
    profile: z.string().optional().describe('Execution profile'),
    affectedAreas: z
        .array(z.string())
        .optional()
        .describe('List of affected packages/modules'),
    skipResearch: z
        .boolean()
        .optional()
        .describe('Skip research phase for trivial/simple tasks'),
})

const savePlanArtifactsAction = z.object({
    action: z.literal('save-plan-artifacts'),
    planFile: z
        .string()
        .describe('Path to plan file (default: .planning/PLAN.md)'),
    roadmapFile: z
        .string()
        .optional()
        .describe('Path to roadmap file (default: .planning/ROADMAP.md)'),
})

const saveReviewResultsAction = z.object({
    action: z.literal('save-review-results'),
    iterationPlan: z
        .array(z.string())
        .optional()
        .describe('Focused list of fixes for next execute iteration'),
    reviewIteration: z.number().optional().describe('Review iteration number'),
})

const RE_ENTER_TARGETS = ['luca:4-execute', 'luca:5-review'] as const

const reEnterPipelineAction = z.object({
    action: z.literal('re-enter-pipeline'),
    targetMode: z
        .enum(RE_ENTER_TARGETS)
        .describe(
            'Pipeline mode to re-enter at. Only execute or review — cannot re-enter at triage/research/architect.'
        ),
    reason: z
        .string()
        .describe(
            'Why the pipeline is being re-entered (stored in state as reEntryReason).'
        ),
})

// ── All valid actions (exported for createScopedTool) ──────────────
export const WORKFLOW_STATE_ACTIONS = [
    'read',
    'write',
    'switch-mode',
    'start-phase',
    'record-iteration',
    'advance-wave',
    'complete-phase',
    'save-triage-results',
    'save-plan-artifacts',
    'save-review-results',
    'reset-pipeline',
    're-enter-pipeline',
] as const

export type WorkflowStateAction = (typeof WORKFLOW_STATE_ACTIONS)[number]

/**
 * Flat z.object schema for the Anthropic API.
 *
 * z.discriminatedUnion produces { oneOf: [...] } without a top-level "type",
 * which Anthropic's API rejects. This flat schema generates a valid
 * { "type": "object", "properties": { ... } } JSON Schema.
 *
 * Action-specific fields are optional here; the execute handler validates
 * required fields per-action using the strict per-action schemas above.
 */
const workflowStateInputSchema = z.object({
    action: z
        .enum(WORKFLOW_STATE_ACTIONS)
        .describe(
            "Which action to perform. read: check state before acting. switch-mode: only after current mode's work is complete. start-phase/complete-phase: bracket each phase. advance-wave: only after checks pass."
        ),

    // write
    updates: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("State fields to update (required for 'write' action)."),

    // switch-mode
    targetMode: z
        .string()
        .optional()
        .describe(
            "Target mode ID (required for 'switch-mode'). One of: build, plan, fast, luca:discuss, luca:1-triage, luca:2-research, luca:3-architect, luca:4-execute, luca:5-review, luca:6-finalize"
        ),
    userRequest: z
        .string()
        .optional()
        .describe(
            "Original user request to pass to target mode (switch-mode only). Written to state as 'intent'."
        ),

    // start-phase
    phaseName: z
        .string()
        .optional()
        .describe("Phase name from ROADMAP.md (required for 'start-phase')."),

    // complete-phase
    verificationPassed: z
        .boolean()
        .optional()
        .describe('Whether verification passed (complete-phase only).'),
    reviewPassed: z
        .boolean()
        .optional()
        .describe('Whether review passed (complete-phase only).'),

    // save-triage-results
    intent: z
        .string()
        .optional()
        .describe(
            "Parsed intent summary (required for 'save-triage-results')."
        ),
    complexity: z
        .enum(['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL'])
        .optional()
        .describe(
            "Classified complexity level (required for 'save-triage-results')."
        ),
    oversight: z
        .enum(['full-auto', 'checkpoint', 'human-in-loop'])
        .optional()
        .describe("Oversight mode (required for 'save-triage-results')."),
    profile: z
        .string()
        .optional()
        .describe('Execution profile (save-triage-results only).'),
    affectedAreas: z
        .array(z.string())
        .optional()
        .describe(
            'List of affected packages/modules (save-triage-results only).'
        ),
    skipResearch: z
        .boolean()
        .optional()
        .describe(
            'Skip research phase for trivial/simple tasks (save-triage-results only).'
        ),

    // save-plan-artifacts
    planFile: z
        .string()
        .optional()
        .describe(
            "Path to plan file, default .planning/PLAN.md (required for 'save-plan-artifacts')."
        ),
    roadmapFile: z
        .string()
        .optional()
        .describe(
            'Path to roadmap file, default .planning/ROADMAP.md (save-plan-artifacts only).'
        ),

    // save-review-results
    iterationPlan: z
        .array(z.string())
        .optional()
        .describe(
            'Focused list of fixes for next execute iteration (save-review-results only).'
        ),
    reviewIteration: z
        .number()
        .optional()
        .describe('Review iteration number (save-review-results only).'),

    // re-enter-pipeline
    reason: z
        .string()
        .optional()
        .describe(
            "Why the pipeline is being re-entered (required for 're-enter-pipeline'). Stored in state as reEntryReason."
        ),
})

export type WorkflowStateInput = z.infer<typeof workflowStateInputSchema>

// ── Helper: strict parse an action's input ─────────────────────────
function parseAction<S extends z.ZodTypeAny>(
    schema: S,
    input: Record<string, unknown>
): z.infer<S> {
    const result = schema.safeParse(input)
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        throw new ActionValidationError(input.action as string, issues)
    }
    return result.data
}

class ActionValidationError extends Error {
    constructor(action: string, details: string) {
        super(`Invalid input for action '${action}': ${details}`)
        this.name = 'ActionValidationError'
    }
}

// ── Tool definition ────────────────────────────────────────────────

export const workflowStateTool = createTool({
    id: 'workflow-state',
    description:
        "Read/write Luca workflow state (.planning/luca-state.json). Tracks pipeline progress, phase status, and mode transitions. Pipeline order: triage→research→architect→execute→review→finalize. Do NOT call switch-mode without completing current mode's requirements.",
    inputSchema: workflowStateInputSchema,
    execute: async (inputData) => {
        try {
            const raw = inputData as Record<string, unknown>

            switch (inputData.action) {
                case 'read': {
                    const state = readLucaState()
                    return {
                        success: true,
                        message: 'State read successfully',
                        state,
                    }
                }
                case 'write': {
                    const { updates } = parseAction(writeAction, raw)
                    const merged = writeLucaState(updates)
                    return {
                        success: true,
                        message: `Updated state: ${Object.keys(updates).join(', ')}`,
                        state: merged,
                    }
                }
                case 'switch-mode': {
                    const { targetMode, userRequest } = parseAction(
                        switchModeAction,
                        raw
                    )
                    if (!VALID_MODES.includes(targetMode)) {
                        return {
                            success: false,
                            message: `Invalid mode "${targetMode}". Valid modes: ${VALID_MODES.join(', ')}`,
                        }
                    }
                    if (!switchModeRef.current) {
                        return {
                            success: false,
                            message:
                                'switchMode not available — harness not initialized',
                        }
                    }

                    // --- Stale state detection on pipeline entry ---
                    const prevState = readLucaState()
                    if (
                        targetMode === 'luca:1-triage' &&
                        hasStaleState(prevState)
                    ) {
                        return {
                            success: false,
                            message: [
                                `Stale pipeline state detected from a previous run.`,
                                prevState.intent
                                    ? `Previous intent: "${prevState.intent}"`
                                    : null,
                                prevState.pipelineStep &&
                                prevState.pipelineStep !== 'idle'
                                    ? `Previous pipeline step: "${prevState.pipelineStep}"`
                                    : null,
                                ``,
                                `Before starting a new pipeline, ask the user (via ask_user) whether to:`,
                                `(1) Clear the old state and start fresh`,
                                `(2) Resume the previous pipeline`,
                                ``,
                                `If they choose to clear, call workflowState(action: "reset-pipeline") first, then retry this switch-mode call.`,
                            ]
                                .filter(Boolean)
                                .join('\n'),
                            staleState: {
                                intent: prevState.intent,
                                pipelineStep: prevState.pipelineStep,
                                complexity: prevState.complexity,
                                startedAt: prevState.startedAt,
                            },
                        }
                    }

                    // --- Pipeline ordering enforcement ---
                    const PIPELINE_MODES = new Set(Object.keys(PIPELINE_ORDER))
                    const currentStep = prevState.pipelineStep

                    if (
                        currentStep &&
                        PIPELINE_MODES.has(currentStep) &&
                        PIPELINE_MODES.has(targetMode)
                    ) {
                        const expectedNext = PIPELINE_ORDER[currentStep]

                        if (targetMode !== expectedNext) {
                            // Allow triage → architect skip when skipResearch is set
                            if (
                                currentStep === 'luca:1-triage' &&
                                targetMode === 'luca:3-architect' &&
                                prevState.skipResearch
                            ) {
                                // Skip-ahead allowed
                            } else {
                                const pipelineSequence =
                                    Object.keys(PIPELINE_ORDER)
                                const currentIdx =
                                    pipelineSequence.indexOf(currentStep)
                                const targetIdx =
                                    pipelineSequence.indexOf(targetMode)

                                if (targetIdx <= currentIdx) {
                                    // Allow documented backward transitions (iteration loops, cross-milestone continuation)
                                    const allowedBackward =
                                        ALLOWED_BACKWARD_TRANSITIONS[
                                            currentStep
                                        ]
                                    if (!allowedBackward?.has(targetMode)) {
                                        return {
                                            success: false,
                                            message: `Pipeline ordering violation: cannot go backward from "${currentStep}" to "${targetMode}". The correct next step is "${expectedNext}". Call workflowState(action: "switch-mode", targetMode: "${expectedNext}") instead.`,
                                        }
                                    }
                                    // Backward transition allowed — fall through
                                } else {
                                    return {
                                        success: false,
                                        message: `Pipeline ordering violation: cannot skip from "${currentStep}" to "${targetMode}". The correct next step is "${expectedNext}". Call workflowState(action: "switch-mode", targetMode: "${expectedNext}") instead.`,
                                    }
                                }
                            }
                        }
                    }

                    try {
                        const stateUpdates: Record<string, unknown> = {
                            pipelineStep: targetMode,
                            nextMode: targetMode,
                        }
                        if (userRequest) {
                            stateUpdates.intent = userRequest
                        }
                        writeLucaState(stateUpdates)
                        appendLedger('mode-transition', {
                            from: prevState.pipelineStep,
                            to: targetMode,
                        })
                        await switchModeRef.current(targetMode)
                        // Notify context refresher of mode change AFTER successful switch
                        // so it doesn't get stuck in the wrong mode if switch fails.
                        contextRefresherRef.current?.setMode(targetMode)
                        return {
                            success: true,
                            message: `Switched to "${targetMode}" mode.`,
                        }
                    } catch (err) {
                        return {
                            success: false,
                            message: `Failed to switch mode: ${err instanceof Error ? err.message : String(err)}`,
                            error: err instanceof Error ? err.stack : undefined,
                        }
                    }
                }
                case 'start-phase': {
                    const { phaseName } = parseAction(startPhaseAction, raw)
                    const phaseState = startPhase({ name: phaseName })
                    appendLedger('phase-start', { phase: phaseName })
                    return {
                        success: true,
                        message: `Started phase "${phaseName}" (wave 1, iteration 0)`,
                        state: phaseState,
                    }
                }
                case 'record-iteration': {
                    const iterState = recordIteration()
                    appendLedger('iteration-complete', {
                        phase: iterState.currentPhaseName,
                        wave: iterState.currentWave,
                        iteration: iterState.currentIteration,
                        budgetExceeded: iterState.budgetExceeded ?? false,
                    })
                    let iterMsg = `Recorded iteration ${iterState.currentIteration} for phase "${iterState.currentPhaseName}"`
                    if (iterState.budgetExceeded) {
                        iterMsg += ` ⚠ Budget limit exceeded (maxChecksFixIterations). Consider advancing to the next wave or reporting remaining failures.`
                        appendLedger('budget-exceeded', {
                            type: 'iteration',
                            iteration: iterState.currentIteration,
                            phase: iterState.currentPhaseName,
                        })
                    }
                    return {
                        success: true,
                        message: iterMsg,
                        state: iterState,
                    }
                }
                case 'advance-wave': {
                    const waveState = advanceWave()
                    appendLedger('wave-advance', {
                        phase: waveState.currentPhaseName,
                        wave: waveState.currentWave,
                        budgetExceeded: waveState.budgetExceeded ?? false,
                    })
                    let waveMsg = `Advanced to wave ${waveState.currentWave} in phase "${waveState.currentPhaseName}"`
                    if (waveState.budgetExceeded) {
                        waveMsg += ` ⚠ Budget limit exceeded (maxPhases). Consider completing the phase or reporting remaining work.`
                        appendLedger('budget-exceeded', {
                            type: 'wave',
                            wave: waveState.currentWave,
                            phase: waveState.currentPhaseName,
                        })
                    }
                    return {
                        success: true,
                        message: waveMsg,
                        state: waveState,
                    }
                }
                case 'complete-phase': {
                    const { verificationPassed, reviewPassed } = parseAction(
                        completePhaseAction,
                        raw
                    )
                    const phaseResult = completePhase({
                        verificationPassed,
                        reviewPassed,
                    })
                    appendLedger('phase-complete', {
                        phase: phaseResult.completedPhaseName,
                        verificationPassed: verificationPassed ?? null,
                        reviewPassed: reviewPassed ?? null,
                    })
                    return {
                        success: true,
                        message: `Completed phase "${phaseResult.completedPhaseName}" (${phaseResult.completedPhases}/${phaseResult.totalPhases} phases done)`,
                        state: phaseResult,
                    }
                }
                case 'save-triage-results': {
                    const triage = parseAction(saveTriageResultsAction, raw)
                    const triageState = writeLucaState({
                        intent: triage.intent,
                        complexity: triage.complexity,
                        oversight: triage.oversight,
                        profile: triage.profile ?? 'balanced',
                        affectedAreas: triage.affectedAreas,
                        skipResearch: triage.skipResearch,
                    })
                    appendLedger('triage-complete', {
                        intent: triage.intent,
                        complexity: triage.complexity,
                        oversight: triage.oversight,
                    })
                    return {
                        success: true,
                        message: `Triage saved: complexity=${triage.complexity}, oversight=${triage.oversight}${triage.skipResearch ? ' (research skipped)' : ''}`,
                        state: triageState,
                    }
                }
                case 'save-plan-artifacts': {
                    const { planFile: rawPlan, roadmapFile: rawRoadmap } =
                        parseAction(savePlanArtifactsAction, raw)
                    // Normalize bare filenames to .planning/ directory
                    const planFile = rawPlan.startsWith('.planning/')
                        ? rawPlan
                        : `.planning/${rawPlan}`
                    const roadmapFile = rawRoadmap
                        ? rawRoadmap.startsWith('.planning/')
                            ? rawRoadmap
                            : `.planning/${rawRoadmap}`
                        : undefined
                    const planState = writeLucaState({
                        planFile,
                        roadmapFile,
                    })
                    appendLedger('plan-artifacts-saved', {
                        planFile,
                        roadmapFile,
                    })
                    return {
                        success: true,
                        message: `Plan artifacts saved: planFile=${planFile}${roadmapFile ? `, roadmapFile=${roadmapFile}` : ''}`,
                        state: planState,
                    }
                }
                case 'save-review-results': {
                    const { iterationPlan, reviewIteration } = parseAction(
                        saveReviewResultsAction,
                        raw
                    )
                    const reviewState = writeLucaState({
                        iterationPlan: iterationPlan ?? undefined,
                        reviewIteration: reviewIteration ?? undefined,
                    })
                    appendLedger('review-results-saved', {
                        iterationPlan,
                        reviewIteration,
                    })
                    return {
                        success: true,
                        message: `Review results saved${reviewIteration != null ? ` (iteration ${reviewIteration})` : ''}${iterationPlan?.length ? `, ${iterationPlan.length} fixes planned` : ''}`,
                        state: reviewState,
                    }
                }
                case 'reset-pipeline': {
                    const freshState = writeLucaState({
                        pipelineStep: 'idle',
                        // Triage output — stale intent is the #1 cause of session hijack
                        intent: undefined,
                        complexity: undefined,
                        oversight: undefined,
                        affectedAreas: undefined,
                        profile: undefined,
                        skipResearch: undefined,
                        // Pipeline progress
                        currentPhase: 0,
                        totalPhases: 0,
                        phaseSubStep: undefined,
                        currentPhaseName: undefined,
                        currentWave: 1,
                        currentIteration: 0,
                        nextMode: undefined,
                        budgetExceeded: false,
                        planFile: undefined,
                        roadmapFile: undefined,
                        reviewIteration: undefined,
                        // Session metadata
                        sessionId: undefined,
                        startedAt: undefined,
                        assignedTodos: undefined,
                        phaseResults: undefined,
                    })
                    appendLedger('pipeline-reset', {})
                    return {
                        success: true,
                        message: 'Pipeline reset to idle state',
                        state: freshState,
                    }
                }
                case 're-enter-pipeline': {
                    const { targetMode: reEntryTarget, reason: reEntryReason } =
                        parseAction(reEnterPipelineAction, raw)
                    if (!switchModeRef.current) {
                        return {
                            success: false,
                            message:
                                'switchMode not available — harness not initialized',
                        }
                    }

                    // Preserve existing state, update pipeline position and reset review counters
                    const reEntryState = writeLucaState({
                        pipelineStep: reEntryTarget,
                        nextMode: reEntryTarget,
                        reEntryReason,
                        reviewIteration: 0,
                        budgetExceeded: false,
                    })
                    appendLedger('pipeline-re-entered', {
                        targetMode: reEntryTarget,
                        reason: reEntryReason,
                    })

                    try {
                        await switchModeRef.current(reEntryTarget)
                        // Notify context refresher AFTER successful switch so it doesn't
                        // get stuck in the wrong mode if switch fails.
                        contextRefresherRef.current?.setMode(reEntryTarget)
                        return {
                            success: true,
                            message: `Pipeline re-entered at "${reEntryTarget}". Reason: ${reEntryReason}`,
                            state: reEntryState,
                        }
                    } catch (err) {
                        return {
                            success: false,
                            message: `Re-entered state but mode switch failed: ${err instanceof Error ? err.message : String(err)}`,
                        }
                    }
                }
                default: {
                    return {
                        success: false,
                        message: `Unknown action: "${inputData.action}"`,
                    }
                }
            }
        } catch (err) {
            if (err instanceof ActionValidationError) {
                return { success: false, message: err.message }
            }
            throw err
        }
    },
})
