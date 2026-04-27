/**
 * Architect mode agent — Luca Steps 4-7g: git, roadmap, plan, plan review.
 *
 * Handles git workflow setup, roadmap creation with WSJF scoring,
 * .planning/PLAN.md creation via goal-backward analysis, and iterative plan review.
 *
 * This is a Luca pipeline stage (formerly "plan" mode in the pipeline).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readLucaState } from '../luca-store.js'
import { resolveModel } from '../model-routing.js'
import type { ComplexityLevel, ProfileLevel } from '../state.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadInstructions(): string {
    return readFileSync(
        join(__dirname, '..', 'instructions', 'architect.md'),
        'utf-8'
    )
}

/**
 * Build dynamic instructions for the architect agent.
 * Reads workflow state from .planning/luca-state.json.
 */
export function buildArchitectInstructions(
    _harnessState?: Record<string, unknown>
): string {
    const base = loadInstructions()
    const state = readLucaState()

    const stateContext = [
        '',
        '## Current Workflow State',
        `- Complexity: ${state.complexity ?? 'unknown'}`,
        `- Profile: ${state.profile ?? 'balanced'}`,
        `- Oversight: ${state.oversight ?? 'full-auto'}`,
        state.intent ? `- Intent: ${state.intent}` : null,
        state.assignedTodos?.length
            ? `- Assigned TODOs: #${state.assignedTodos.join(', #')}`
            : null,
    ]
        .filter(Boolean)
        .join('\n')

    return base + stateContext
}

/**
 * Resolve the model ID for the architect agent.
 */
export function resolveArchitectModel(
    _harnessState?: Record<string, unknown>
): string {
    const state = readLucaState()
    return resolveModel({
        subagentType: 'lu-planner',
        complexity: (state.complexity as ComplexityLevel) ?? 'MODERATE',
        profile: (state.profile as ProfileLevel) ?? 'balanced',
    })
}

/**
 * Architect agent configuration for mode registration.
 */
export const architectMode = {
    id: 'luca:3-architect' as const,
    name: 'luca: Architect',
    description:
        'Git workflow, roadmap creation, .planning/PLAN.md via goal-backward analysis, and plan review.',
    color: '#a855f7',
    defaultModelId: 'anthropic/claude-opus-4-7',
    buildInstructions: buildArchitectInstructions,
    resolveModel: resolveArchitectModel,
}
