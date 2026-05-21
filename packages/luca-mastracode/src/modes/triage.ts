/**
 * Triage mode agent — Luca Steps 1-3: parse, classify, configure.
 *
 * First contact point. Parses user request, classifies complexity,
 * configures oversight and budget, then transitions to Research or Plan.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MODES } from '../constants/mode-ids.js'
import { resolveModel } from '../integration/model-routing.js'
import { readLucaState } from '../state/luca-store.js'
import { LOCK_PATH } from '../util/phase-paths.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadInstructions(): string {
    return readFileSync(
        join(__dirname, '..', 'instructions', 'triage.md'),
        'utf-8'
    )
}

/**
 * Build dynamic instructions for the triage agent.
 * Reads Luca workflow state from .planning/luca-state.json (not harness state,
 * which strips custom keys via Zod).
 */
export function buildTriageInstructions(
    _harnessState?: Record<string, unknown>
): string {
    const base = loadInstructions()

    // Only inject workflow state context if there's an active pipeline lock.
    // Without a lock, any persisted state is stale from a previous session
    // and should not cause the agent to skip classification.
    const lockPath = LOCK_PATH()
    if (!existsSync(lockPath)) return base

    const state = readLucaState()
    if (!state.complexity && !state.pipelineStep) return base

    const stateContext = [
        '',
        '## Current Workflow State',
        `- Pipeline step: ${state.pipelineStep ?? 'idle'}`,
        state.complexity ? `- Complexity: ${state.complexity}` : null,
        state.profile ? `- Profile: ${state.profile}` : null,
        state.oversight ? `- Oversight: ${state.oversight}` : null,
        state.intent ? `- Intent: ${state.intent}` : null,
        state.sessionId ? `- Session: ${state.sessionId}` : null,
        '',
        state.complexity
            ? '**Triage is already complete.** If the user confirms, use `workflowState(action: "switch-mode", targetMode: "luca:2-research")` to proceed.'
            : null,
    ]
        .filter(Boolean)
        .join('\n')

    return base + stateContext
}

/**
 * Resolve the model ID for the triage agent.
 * Pre-classification: always use sonnet. Post-classification: use resolved model.
 */
export function resolveTriageModel(
    _harnessState?: Record<string, unknown>
): string {
    const state = readLucaState()
    if (!state.complexity) {
        return 'anthropic/claude-sonnet-4-6'
    }
    return resolveModel({
        subagentType: 'lu-cognition',
        complexity: state.complexity as
            | 'TRIVIAL'
            | 'SIMPLE'
            | 'MODERATE'
            | 'COMPLEX'
            | 'CRITICAL',
        profile:
            (state.profile as 'budget' | 'balanced' | 'quality') ?? 'balanced',
    })
}

/**
 * Triage agent configuration for mode registration.
 */
export const triageMode = {
    id: MODES.triage,
    name: 'luca: Triage',
    description:
        'Parse, classify, and configure the workflow for a development request.',
    color: '#f59e0b',
    defaultModelId: 'anthropic/claude-sonnet-4-6',
    buildInstructions: buildTriageInstructions,
    resolveModel: resolveTriageModel,
}
