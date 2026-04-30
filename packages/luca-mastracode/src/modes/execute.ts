/**
 * Execute mode agent — Luca Steps 7h-7l: execute, checks, verify, review, learn.
 *
 * Core implementation loop. Spawns executor subagents per wave,
 * runs automated checks, verifies correctness, performs code review
 * from 4 perspectives, and captures learnings.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readLucaState } from '../luca-store.js'
import { resolveModel } from '../model-routing.js'
import type { ComplexityLevel, ProfileLevel } from '../state.js'

import { MODES } from './mode-ids.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadInstructions(): string {
    return readFileSync(
        join(__dirname, '..', 'instructions', 'execute.md'),
        'utf-8'
    )
}

/**
 * Build dynamic instructions for the execute agent.
 * Reads workflow state from .planning/luca-state.json.
 */
export function buildExecuteInstructions(
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
        state.planFile
            ? `- Plan file: ${state.planFile} (read this file from disk for the execution plan)`
            : null,
        state.roadmapFile
            ? `- Roadmap file: ${state.roadmapFile} (read this file from disk for phase sequencing)`
            : null,
        state.assignedTodos?.length
            ? `- Assigned TODOs: #${state.assignedTodos.join(', #')}`
            : null,
    ]
        .filter(Boolean)
        .join('\n')

    // Inject review iteration context when re-entering from Review mode
    const rawPlan = state.iterationPlan
    const iterationPlan = Array.isArray(rawPlan) ? rawPlan : undefined
    const reviewIteration = state.reviewIteration
    const reviewContext = iterationPlan?.length
        ? [
              '',
              '## ⚠️ Review Iteration Re-entry',
              `**This is review iteration ${reviewIteration ?? 1}.** You are re-entering from Review mode to fix must-fix issues.`,
              '',
              '**Iteration plan (your task list for this pass):**',
              ...iterationPlan.map((fix, i) => `${i + 1}. ${fix}`),
              '',
              `Read the latest \`.planning/REVIEW-*.md\` for full context (file paths, evidence, fix suggestions).`,
              'Scope your work to these items ONLY — do not re-execute the full plan.',
          ].join('\n')
        : ''

    return base + stateContext + reviewContext
}

/**
 * Resolve the model ID for the execute agent.
 * Uses ORCHESTRATOR preset — scales up with complexity.
 */
export function resolveExecuteModel(
    _harnessState?: Record<string, unknown>
): string {
    const state = readLucaState()
    return resolveModel({
        subagentType: 'lu-executor',
        complexity: (state.complexity as ComplexityLevel) ?? 'MODERATE',
        profile: (state.profile as ProfileLevel) ?? 'balanced',
    })
}

/**
 * Execute agent configuration for mode registration.
 */
export const executeMode = {
    id: MODES.execute,
    name: 'luca: Execute',
    description:
        'Implement code changes atomically with automated checks, verification, code review, and learning capture.',
    color: '#10b981',
    defaultModelId: 'anthropic/claude-opus-4-7',
    buildInstructions: buildExecuteInstructions,
    resolveModel: resolveExecuteModel,
}
