/**
 * File-based Luca workflow state persistence.
 *
 * The Mastra Code harness state (`harness.setState`) validates through a Zod
 * schema that silently strips unknown keys. Since we can't extend the built-in
 * schema, Luca-specific workflow state is stored in `.planning/luca-state.json`.
 *
 * This file survives mode switches, process restarts, and TUI reconnections.
 */
import { existsSync, readFileSync } from 'node:fs'

import { atomicWriteSync } from '../util/atomic-write.js'
import { MODES } from '../constants/mode-ids.js'
import { STATE_PATH } from '../util/phase-paths.js'
import { resolveBudgetLimits } from './state.js'
import type { ComplexityLevel, ProfileLevel } from './state.js'

/**
 * Mirror of `PhaseSnapshot` from `phase-diff.ts`. Inlined here to avoid a
 * circular import (luca-store ↔ phase-diff via session-ledger).
 */
export interface PhaseSnapshotState {
    phase: string
    takenAt: string
    headSha: string | null
    dirtyFiles: string[]
    gitAvailable: boolean
}

export interface PhaseResult {
    /** Phase name from ROADMAP.md */
    name: string
    /** Phase status */
    status: 'pending' | 'in-progress' | 'complete' | 'skipped' | 'blocked'
    /** Number of execution iterations (execute→checks→verify cycles) */
    iterations: number
    /** Number of waves completed within this phase */
    wavesCompleted: number
    /** Timestamp when phase started */
    startedAt?: string
    /** Timestamp when phase completed */
    completedAt?: string
    /** Whether verification passed */
    verificationPassed?: boolean
    /** Whether review passed */
    reviewPassed?: boolean
    /**
     * Timestamp when the current wave started (ISO 8601).
     *
     * - Set on `startPhase` (new-phase branch) — wave 1 starts.
     * - **Reset** on `startPhase` (RESUME branch) — `currentWave` resets to 1,
     *   so wave timing must reset too.
     * - Updated on each `advanceWave` — new wave begins.
     *
     * Consumed by the telemetry writer to compute `wave.end` durationMs.
     * Always look up the entry via `.find(r => r.name === currentPhaseName)`
     * — NEVER `.at(-1)` (resumed phases mutate in place, not at end).
     */
    waveStartedAt?: string
}

export interface LucaWorkflowState {
    // --- Triage output ---
    intent?: string
    complexity?: string
    profile?: string
    oversight?: string
    affectedAreas?: string[]
    skipResearch?: boolean

    // --- Pipeline progress ---
    pipelineStep?: string
    nextMode?: string
    currentPhase?: number
    totalPhases?: number

    // --- Phase tracking ---
    phaseResults?: PhaseResult[]
    currentPhaseName?: string
    /**
     * Session-scoped slug for the .planning/phases/<slug>/ artifact directory.
     *
     * Derived during triage from the user intent (ticket-id when present, else
     * timestamp + intent kebab). IMMUTABLE once persisted — re-entry into the
     * pipeline must NOT recompute the slug. Consumers that resolve artifact
     * paths via `phaseDir(slug)` / `phasePath(file, slug)` from
     * `util/phase-paths.ts` will fall back to root .planning/ when this is
     * undefined (legacy in-flight runs at upgrade time).
     *
     * @see issue #220
     */
    currentPhaseSlug?: string
    currentWave?: number
    currentIteration?: number
    milestoneCount?: number

    // --- Review tracking ---
    reviewIteration?: number
    iterationPlan?: string[]

    // --- Plan artifacts ---
    planFile?: string
    roadmapFile?: string

    // --- Session ---
    sessionId?: string
    startedAt?: string
    runId?: string

    // --- Phase proof (set by start-phase, consumed by complete-phase) ---
    currentPhaseStartSnapshot?: PhaseSnapshotState

    // --- Empty-phase justification (set by justify-empty-phase) ---
    emptyPhaseJustifications?: Record<
        string,
        { category: string; reasoning: string; at: string }
    >

    // --- Assigned work ---
    assignedTodos?: number[]

    // --- Budget enforcement (advisory) ---
    budgetExceeded?: boolean

    // --- Branching policy ---
    /** Base branch the feature was created from (written by ensureFeatureBranch.apply). */
    baseBranch?: string
    /** Target base for PR (written by ensureFeatureBranch.apply, read by finalize). */
    prBase?: string

    // --- Project preferences (set by projectPreferences tool / luca-init skill) ---
    /**
     * Loop-safety flag for the triage Step 1.6 sentinel. Set to `true` once
     * preferences have been seeded (via `projectPreferences(action: "seed")`)
     * or back-filled by `consult` when the file is found. Sentinel re-checks
     * this flag before invoking /luca-init to prevent seed → consult → null
     * infinite loops. See C1 in PLAN.md and project-preferences.test.ts.
     */
    preferencesSeeded?: boolean

    // Allow arbitrary extension
    [key: string]: unknown
}

function statePath(): string {
    return STATE_PATH()
}

/**
 * Read the current Luca workflow state from disk.
 * Returns empty object if the file doesn't exist.
 */
export function readLucaState(): LucaWorkflowState {
    const p = statePath()
    if (!existsSync(p)) return {}
    try {
        const state = JSON.parse(readFileSync(p, 'utf-8'))

        // Migrate stale "plan" pipeline step to "architect"
        // (legacy sub-step rename from before architect mode existed)
        if (state.pipelineStep === 'plan') state.pipelineStep = 'architect'

        // Migrate bare mode names to namespaced identifiers
        const BARE_TO_NAMESPACED: Record<string, string> = {
            discuss: MODES.discuss,
            triage: MODES.triage,
            research: MODES.research,
            architect: MODES.architect,
            execute: MODES.execute,
            review: MODES.review,
            finalize: MODES.finalize,
        }
        if (state.pipelineStep && BARE_TO_NAMESPACED[state.pipelineStep]) {
            state.pipelineStep = BARE_TO_NAMESPACED[state.pipelineStep]
        }
        if (state.nextMode && BARE_TO_NAMESPACED[state.nextMode]) {
            state.nextMode = BARE_TO_NAMESPACED[state.nextMode]
        }

        return state
    } catch {
        return {}
    }
}

/**
 * Write fields to Luca workflow state (merge, not replace).
 */
export function writeLucaState(
    updates: Partial<LucaWorkflowState>
): LucaWorkflowState {
    const current = readLucaState()
    const merged = { ...current, ...updates }

    atomicWriteSync(statePath(), JSON.stringify(merged, null, 2))
    return merged
}

/**
 * Reset Luca workflow state (start fresh).
 */
export function resetLucaState(): void {
    const p = statePath()
    if (existsSync(p)) {
        atomicWriteSync(p, '{}')
    }
}

// ---------------------------------------------------------------------------
// Phase tracking helpers
// ---------------------------------------------------------------------------

/**
 * Start a new phase. Initializes phase result entry and resets iteration counters.
 */
export function startPhase({ name }: { name: string }): LucaWorkflowState {
    const state = readLucaState()
    const results = state.phaseResults ?? []

    // Check if phase already exists (resuming)
    const existing = results.find((r) => r.name === name)
    const now = new Date().toISOString()
    if (existing && existing.status !== 'complete') {
        existing.status = 'in-progress'
        existing.iterations = existing.iterations ?? 0
        // Reset wave timer — currentWave resets to 1 below; wave timing too.
        existing.waveStartedAt = now
    } else if (!existing) {
        results.push({
            name,
            status: 'in-progress',
            iterations: 0,
            wavesCompleted: 0,
            startedAt: now,
            waveStartedAt: now,
        })
    }

    return writeLucaState({
        phaseResults: results,
        currentPhaseName: name,
        currentWave: 1,
        currentIteration: 0,
    })
}

/**
 * Record a completed iteration within the current phase.
 * Returns `budgetExceeded: true` (advisory) when the iteration count
 * exceeds `maxChecksFixIterations` from the budget matrix.
 */
export function recordIteration(): LucaWorkflowState {
    const state = readLucaState()
    const results = state.phaseResults ?? []
    const current = results.find((r) => r.name === state.currentPhaseName)
    if (current) {
        current.iterations = (current.iterations ?? 0) + 1
    }
    const nextIteration = (state.currentIteration ?? 0) + 1

    const limits = resolveBudgetLimits({
        complexity: (state.complexity ?? 'MODERATE') as ComplexityLevel,
        profile: (state.profile ?? 'balanced') as ProfileLevel,
    })
    const exceeded = nextIteration > limits.maxChecksFixIterations

    return writeLucaState({
        phaseResults: results,
        currentIteration: nextIteration,
        budgetExceeded: exceeded || undefined,
    })
}

/**
 * Advance to the next wave within the current phase.
 * Returns `budgetExceeded: true` (advisory) when the wave count
 * exceeds `maxPhases` from the budget matrix.
 */
export function advanceWave(): LucaWorkflowState {
    const state = readLucaState()
    const results = state.phaseResults ?? []
    const current = results.find((r) => r.name === state.currentPhaseName)
    if (current) {
        current.wavesCompleted = (current.wavesCompleted ?? 0) + 1
        // Stamp new wave start so telemetry's wave.end (next advance) can derive durationMs.
        current.waveStartedAt = new Date().toISOString()
    }
    const nextWave = (state.currentWave ?? 1) + 1

    const limits = resolveBudgetLimits({
        complexity: (state.complexity ?? 'MODERATE') as ComplexityLevel,
        profile: (state.profile ?? 'balanced') as ProfileLevel,
    })
    const exceeded = nextWave > limits.maxPhases

    return writeLucaState({
        phaseResults: results,
        currentWave: nextWave,
        currentIteration: 0,
        budgetExceeded: exceeded || undefined,
    })
}

/**
 * Complete the current phase.
 */
export function completePhase({
    verificationPassed,
    reviewPassed,
}: {
    verificationPassed?: boolean
    reviewPassed?: boolean
}): LucaWorkflowState {
    const state = readLucaState()
    const results = state.phaseResults ?? []
    const current = results.find((r) => r.name === state.currentPhaseName)
    if (current) {
        current.status = 'complete'
        current.completedAt = new Date().toISOString()
        current.verificationPassed = verificationPassed
        current.reviewPassed = reviewPassed
    }

    const completedCount = results.filter((r) => r.status === 'complete').length
    const totalPhases = state.totalPhases ?? results.length
    const nextPhaseIndex = results.findIndex((r) => r.status === 'pending')

    return writeLucaState({
        phaseResults: results,
        currentPhase: completedCount,
        totalPhases,
        currentPhaseName:
            nextPhaseIndex >= 0 ? results[nextPhaseIndex]?.name : undefined,
        currentWave: 1,
        currentIteration: 0,
    })
}
