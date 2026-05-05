import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { MODES, ALL_REGISTERED_MODES } from '../constants/mode-ids.js'

import {
    readLucaState,
    writeLucaState,
    startPhase,
    recordIteration,
    advanceWave,
    completePhase,
    type LucaWorkflowState,
} from '../state/luca-store.js'
import { switchModeRef, contextRefresherRef } from '../util/refs.js'
import {
    appendLedger,
    archivePriorRun,
    startNewRun,
} from '../state/session-ledger.js'
import {
    snapshotWorkingTree,
    computePhaseDiff,
    type PhaseSnapshot,
} from '../analysis/phase-diff.js'
import { readVerificationResult } from '../state/verification-result.js'
import { archiveLoose, detectStragglers } from './repo-cleanup.js'
import {
    deriveSlug,
    phasePath,
    planningRoot,
    resolveAvailableSlug,
    ROADMAP_PATH,
} from '../util/phase-paths.js'
import { join, relative } from 'node:path'

const VALID_MODES = ALL_REGISTERED_MODES

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
    [MODES.triage]: MODES.research,
    [MODES.research]: MODES.architect,
    [MODES.architect]: MODES.execute,
    [MODES.execute]: MODES.review,
    [MODES.review]: MODES.finalize,
    [MODES.finalize]: undefined,
}

/**
 * Documented backward transitions that bypass the "no backward step" check.
 * - Review → Execute:    iteration loop for MUST-FIX issues (review.md Step 7B)
 * - Finalize → Architect: cross-milestone continuation (finalize.md Step 5)
 * - Finalize → Execute:   gap-detected rework (finalize.md Step 4)
 */
const ALLOWED_BACKWARD_TRANSITIONS: Record<string, Set<string>> = {
    [MODES.review]: new Set([MODES.execute]),
    [MODES.finalize]: new Set([MODES.architect, MODES.execute]),
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
        .optional()
        .describe(
            'Path to plan file. Defaults to .planning/phases/<slug>/PLAN.md when slug is set, else .planning/PLAN.md.'
        ),
    roadmapFile: z
        .string()
        .optional()
        .describe(
            'Path to roadmap file. Always at .planning/ROADMAP.md (cross-phase).'
        ),
})

const saveReviewResultsAction = z.object({
    action: z.literal('save-review-results'),
    iterationPlan: z
        .array(z.string())
        .optional()
        .describe('Focused list of fixes for next execute iteration'),
    reviewIteration: z.number().optional().describe('Review iteration number'),
})

const EMPTY_PHASE_CATEGORIES = [
    'docs-only-in-muninn',
    'investigation-confirmed-no-change-needed',
    'config-only-no-tracked-files',
    'dependency-bump-via-lockfile-only',
    'no-op-by-design',
] as const

const justifyEmptyPhaseAction = z.object({
    action: z.literal('justify-empty-phase'),
    phase: z.string().describe('Phase name (must match the in-progress phase).'),
    category: z
        .enum(EMPTY_PHASE_CATEGORIES)
        .describe(
            'Why this phase legitimately has no diff. Used to unblock the empty-phase guard on complete-phase.'
        ),
    reasoning: z
        .string()
        .min(20, 'Reasoning must be at least 20 characters')
        .describe(
            'Concrete explanation of why no code changed. Surfaces in the postmortem report for human review.'
        ),
})

const RE_ENTER_TARGETS = [MODES.execute, MODES.review] as const

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

// archive-loose has no extra fields — the action discriminator alone is
// sufficient. Defined for completeness and future-proofing in case the
// action gains options (e.g. dry-run / explicit slug override).
const archiveLooseAction = z.object({
    action: z.literal('archive-loose'),
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
    'justify-empty-phase',
    'save-triage-results',
    'save-plan-artifacts',
    'save-review-results',
    'reset-pipeline',
    're-enter-pipeline',
    'archive-loose',
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
            "Which action to perform. read: check state before acting. switch-mode: only after current mode's work is complete. start-phase/complete-phase: bracket each phase. advance-wave: only after checks pass. archive-loose: migrate root stragglers under .planning/ into the active phase dir (refused if pipeline lock is held by another live session)."
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
            'Path to plan file. Defaults to .planning/phases/<slug>/PLAN.md when slug is set, else .planning/PLAN.md.'
        ),
    roadmapFile: z
        .string()
        .optional()
        .describe(
            'Path to roadmap file. Always at .planning/ROADMAP.md (cross-phase).'
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

    // justify-empty-phase
    phase: z
        .string()
        .optional()
        .describe(
            "Phase name (required for 'justify-empty-phase'). Must match the in-progress phase."
        ),
    category: z
        .enum(EMPTY_PHASE_CATEGORIES)
        .optional()
        .describe(
            "Empty-phase category (required for 'justify-empty-phase'). One of: docs-only-in-muninn | investigation-confirmed-no-change-needed | config-only-no-tracked-files | dependency-bump-via-lockfile-only | no-op-by-design."
        ),
    reasoning: z
        .string()
        .optional()
        .describe(
            "Concrete reasoning for why no code changed (required for 'justify-empty-phase'). Surfaces in postmortem report."
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
                        targetMode === MODES.triage &&
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
                                currentStep === MODES.triage &&
                                targetMode === MODES.architect &&
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

                    // Snapshot working tree as proof-of-work baseline.
                    const snapshot: PhaseSnapshot =
                        snapshotWorkingTree(phaseName)
                    writeLucaState({ currentPhaseStartSnapshot: snapshot })
                    appendLedger('phase-snapshot', {
                        phase: phaseName,
                        headSha: snapshot.headSha,
                        dirtyFileCount: snapshot.dirtyFiles.length,
                        gitAvailable: snapshot.gitAvailable,
                    })

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
                    // Guard: refuse to advance unless the current wave has a
                    // verification result on file. Prevents waves from being
                    // closed silently without proof of work.
                    const preWaveState = readLucaState()
                    const currentWave = preWaveState.currentWave ?? 1
                    const verification = readVerificationResult()
                    if (
                        !verification ||
                        verification.wave !== currentWave
                    ) {
                        appendLedger('wave-advance-blocked', {
                            phase: preWaveState.currentPhaseName,
                            wave: currentWave,
                            reason: 'no verification-result for current wave',
                        })
                        return {
                            success: false,
                            code: 'WAVE_ADVANCE_NO_VERIFICATION',
                            message: `Cannot advance wave: no verification-result.json for wave ${currentWave}. Call verificationResult(action: "write", ...) before advance-wave.`,
                        }
                    }

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

                    // ── Guard 1: diff-based phase proof ─────────────────────
                    const preState = readLucaState()
                    const phaseName = preState.currentPhaseName ?? '<unknown>'
                    const startSnapshot =
                        preState.currentPhaseStartSnapshot ?? null
                    const diff = computePhaseDiff(startSnapshot)
                    appendLedger('phase-diff-summary', {
                        phase: phaseName,
                        filesChanged: diff.filesChanged,
                        commitsAdded: diff.commitsAdded,
                        isEmpty: diff.isEmpty,
                        indeterminate: diff.indeterminate,
                    })

                    if (diff.isEmpty) {
                        const justifications =
                            preState.emptyPhaseJustifications ?? {}
                        const j = justifications[phaseName]
                        if (!j) {
                            return {
                                success: false,
                                code: 'EMPTY_PHASE_BLOCKED',
                                message: `Phase "${phaseName}" has zero file changes and zero commits. Either (a) call workflowState(action: "justify-empty-phase", phase: "${phaseName}", category: <category>, reasoning: "<why>") if this is intentional, or (b) re-enter execute mode to do the work.`,
                            }
                        }
                    }

                    // ── Guard 2: verification result must exist for current wave ──
                    const verification = readVerificationResult()
                    const currentWave = preState.currentWave ?? 1
                    if (
                        verificationPassed !== false &&
                        (!verification ||
                            verification.wave !== currentWave ||
                            verification.status !== 'PASS')
                    ) {
                        return {
                            success: false,
                            code: 'PHASE_COMPLETE_NO_VERIFICATION',
                            message: `Phase "${phaseName}" cannot be completed: no PASS verification-result.json for wave ${currentWave}. Call verificationResult(action: "write", ...) with a PASS verdict before complete-phase, or pass verificationPassed: false to record a failed completion.`,
                        }
                    }

                    const phaseResult = completePhase({
                        verificationPassed,
                        reviewPassed,
                    })

                    // Clear snapshot now that the phase is closed.
                    writeLucaState({ currentPhaseStartSnapshot: undefined })

                    appendLedger('phase-complete', {
                        phase: phaseName,
                        verificationPassed: verificationPassed ?? null,
                        reviewPassed: reviewPassed ?? null,
                        filesChanged: diff.filesChanged.length,
                        commitsAdded: diff.commitsAdded.length,
                    })

                    // ── Advisory: detect cross-phase stragglers under .planning/ ──
                    // Non-blocking: phase completion always succeeds even when
                    // stragglers exist. Surfaces a warning payload so the
                    // caller (typically the finalize gate) can prompt the
                    // operator to migrate via the archive-loose action before
                    // opening a PR. See #220.
                    let stragglerWarning:
                        | {
                              count: number
                              files: string[]
                              suggestion: string
                          }
                        | undefined
                    try {
                        const { rootStragglers } = detectStragglers()
                        if (rootStragglers.length > 0) {
                            stragglerWarning = {
                                count: rootStragglers.length,
                                files: rootStragglers,
                                suggestion:
                                    'Run workflowState({action:"archive-loose"}) to migrate these into the active phase dir before opening a PR.',
                            }
                        }
                    } catch {
                        // detectStragglers is best-effort advisory; never
                        // fail complete-phase because of a scan glitch.
                    }

                    return {
                        success: true,
                        message: `Completed phase "${phaseName}" (${diff.filesChanged.length} files changed, ${diff.commitsAdded.length} commits)`,
                        state: phaseResult,
                        stragglerWarning,
                    }
                }
                case 'save-triage-results': {
                    const triage = parseAction(saveTriageResultsAction, raw)
                    const updates: Partial<LucaWorkflowState> = {
                        intent: triage.intent,
                        complexity: triage.complexity,
                        oversight: triage.oversight,
                        profile: triage.profile ?? 'balanced',
                        affectedAreas: triage.affectedAreas,
                        skipResearch: triage.skipResearch,
                    }

                    // Derive session-scoped phase slug if not already set
                    // (re-entry idempotency). Slug is IMMUTABLE: once
                    // persisted by triage, never recomputed. See #220.
                    const current = readLucaState()
                    if (!current.currentPhaseSlug && triage.intent) {
                        const baseSlug = deriveSlug(triage.intent)
                        updates.currentPhaseSlug =
                            resolveAvailableSlug(baseSlug)
                    }

                    const triageState = writeLucaState(updates)
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

                    // Per-phase scope per #220: PLAN.md, CONTEXT.md, RESEARCH.md
                    // resolve under phaseDir(slug); ROADMAP.md is always root.
                    // Read slug at exec time; absent slug falls back to root
                    // (see `phasePath` semantics).
                    const slug = readLucaState().currentPhaseSlug
                    const toRepoRelative = (abs: string): string =>
                        relative(process.cwd(), abs)

                    // planFile resolution:
                    //  - omitted              → phasePath('PLAN.md', slug)
                    //  - bare filename ("X")  → phasePath('X', slug)
                    //  - explicit .planning/* → preserved as-is (caller knows)
                    //  - any other path       → preserved as-is
                    let planFile: string
                    if (rawPlan === undefined) {
                        planFile = toRepoRelative(phasePath('PLAN.md', slug))
                    } else if (
                        !rawPlan.includes('/') &&
                        !rawPlan.includes('\\')
                    ) {
                        planFile = toRepoRelative(phasePath(rawPlan, slug))
                    } else {
                        planFile = rawPlan
                    }

                    // roadmapFile resolution:
                    //  - omitted              → ROADMAP_PATH() (root)
                    //  - bare filename        → planningRoot()/<filename>
                    //  - explicit path        → preserved as-is
                    let roadmapFile: string
                    if (rawRoadmap === undefined) {
                        roadmapFile = toRepoRelative(ROADMAP_PATH())
                    } else if (
                        !rawRoadmap.includes('/') &&
                        !rawRoadmap.includes('\\')
                    ) {
                        roadmapFile = toRepoRelative(
                            join(planningRoot(), rawRoadmap)
                        )
                    } else {
                        roadmapFile = rawRoadmap
                    }

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
                        message: `Plan artifacts saved: planFile=${planFile}, roadmapFile=${roadmapFile}`,
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
                case 'justify-empty-phase': {
                    const { phase, category, reasoning } = parseAction(
                        justifyEmptyPhaseAction,
                        raw
                    )
                    const justState = readLucaState()
                    const currentPhaseName = justState.currentPhaseName
                    if (!currentPhaseName) {
                        return {
                            success: false,
                            code: 'NO_PHASE_IN_PROGRESS',
                            message: `Cannot justify empty phase: no phase is currently in progress. Call workflowState(action: "start-phase", ...) first.`,
                        }
                    }
                    if (phase !== currentPhaseName) {
                        return {
                            success: false,
                            code: 'PHASE_MISMATCH',
                            message: `Cannot justify empty phase: provided phase "${phase}" does not match the in-progress phase "${currentPhaseName}". Justifications can only be recorded for the active phase.`,
                        }
                    }
                    const existing = justState.emptyPhaseJustifications ?? {}
                    const merged = {
                        ...existing,
                        [phase]: {
                            category,
                            reasoning,
                            at: new Date().toISOString(),
                        },
                    }
                    const updatedState = writeLucaState({
                        emptyPhaseJustifications: merged,
                    })
                    appendLedger('phase-empty-justification', {
                        phase,
                        category,
                        reasoning,
                    })
                    return {
                        success: true,
                        message: `Recorded empty-phase justification for "${phase}" (category: ${category}). complete-phase will now accept this phase.`,
                        state: updatedState,
                    }
                }
                case 'reset-pipeline': {
                    // Archive the prior run's ledger artifacts BEFORE wiping
                    // state, so we don't lose audit trail when starting fresh.
                    const priorRunId = readLucaState().runId as
                        | string
                        | undefined
                    if (priorRunId) {
                        archivePriorRun(priorRunId)
                    }
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
                        // Phase-diff snapshots (Step 2 of the postmortem plan)
                        currentPhaseStartSnapshot: undefined,
                        // Empty-phase justifications — must clear so prior-run
                        // justifications can't unblock complete-phase in a new run
                        emptyPhaseJustifications: undefined,
                        // Run identity — clear so startNewRun mints a fresh ID
                        runId: undefined,
                        // Phase slug — clear so the next save-triage-results
                        // re-derives a fresh slug from the new intent. Otherwise
                        // the stale slug short-circuits the
                        // `if (!current.currentPhaseSlug && triage.intent)`
                        // guard and the new session writes into the prior
                        // session's phases/<old-slug>/ tree (#220 review).
                        // archivePriorRun above runs first, so it can still
                        // resolve the prior slug for archival routing.
                        currentPhaseSlug: undefined,
                    })
                    const newRunId = startNewRun()
                    appendLedger('pipeline-reset', {
                        priorRunId: priorRunId ?? null,
                        newRunId,
                    })
                    return {
                        success: true,
                        message: `Pipeline reset to idle state (run ${newRunId})`,
                        state: { ...freshState, runId: newRunId },
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
                case 'archive-loose': {
                    // Validate the action shape (no extra fields). Keeps
                    // future option additions cheap and gives a precise
                    // ActionValidationError on misuse.
                    parseAction(archiveLooseAction, raw)

                    // Delegate to repo-cleanup's archiveLoose() which
                    // performs the full guard set:
                    //   1. Refuses if .luca-lock.json is held by another
                    //      live PID (own PID is fine).
                    //   2. Refuses if currentPhaseSlug is not set (cannot
                    //      determine target phase directory).
                    //   3. Skips files whose target already exists.
                    try {
                        const { archived, skipped } = archiveLoose()
                        appendLedger('archive-loose', {
                            archivedCount: archived.length,
                            skippedCount: skipped.length,
                        })
                        const summary =
                            archived.length === 0 && skipped.length === 0
                                ? 'No root stragglers found — nothing to archive.'
                                : `Archived ${archived.length} file(s) into the active phase dir${skipped.length > 0 ? ` (${skipped.length} skipped)` : ''}.`
                        return {
                            success: true,
                            message: summary,
                            archived,
                            skipped,
                        }
                    } catch (err) {
                        return {
                            success: false,
                            error:
                                err instanceof Error
                                    ? err.message
                                    : String(err),
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
