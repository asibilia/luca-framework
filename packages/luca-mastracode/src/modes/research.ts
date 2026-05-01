/**
 * Research mode agent — Luca Step 7d: v2 research pipeline.
 *
 * Spawns parallel researcher subagents across 5 dimensions,
 * synthesizes findings, reviews quality, and transitions to Plan.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readLucaState } from '../state/luca-store.js'
import { resolveModel } from '../integration/model-routing.js'
import type { ComplexityLevel, ProfileLevel } from '../state/state.js'

import { MODES } from '../constants/mode-ids.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadInstructions(): string {
    return readFileSync(
        join(__dirname, '..', 'instructions', 'research.md'),
        'utf-8'
    )
}

/**
 * Build dynamic instructions for the research agent.
 * Reads workflow state from .planning/luca-state.json.
 */
export function buildResearchInstructions(
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
 * Resolve the model ID for the research agent.
 */
export function resolveResearchModel(
    _harnessState?: Record<string, unknown>
): string {
    const state = readLucaState()
    return resolveModel({
        subagentType: 'lu-research-synthesizer',
        complexity: (state.complexity as ComplexityLevel) ?? 'MODERATE',
        profile: (state.profile as ProfileLevel) ?? 'balanced',
    })
}

/**
 * Research agent configuration for mode registration.
 */
export const researchMode = {
    id: MODES.research,
    name: 'luca: Research',
    description: 'Deep codebase and ecosystem research before planning.',
    color: '#3b82f6',
    defaultModelId: 'anthropic/claude-sonnet-4-6',
    buildInstructions: buildResearchInstructions,
    resolveModel: resolveResearchModel,
}
