/**
 * Finalize mode agent — Luca Steps 8-11: milestone, gap audit, cleanup.
 *
 * Handles milestone boundaries, gap detection, PR creation,
 * and session cleanup with final metrics reporting.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModel } from '../model-routing.js';
import { readLucaState } from '../luca-store.js';
import type { ComplexityLevel, ProfileLevel } from '../state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadInstructions(): string {
  return readFileSync(join(__dirname, '..', 'instructions', 'finalize.md'), 'utf-8');
}

/**
 * Build dynamic instructions for the finalize agent.
 * Reads workflow state from .planning/luca-state.json.
 */
export function buildFinalizeInstructions(_harnessState?: Record<string, unknown>): string {
  const base = loadInstructions();
  const state = readLucaState();

  const stateContext = [
    '',
    '## Current Workflow State',
    `- Complexity: ${state.complexity ?? 'unknown'}`,
    `- Profile: ${state.profile ?? 'balanced'}`,
    `- Oversight: ${state.oversight ?? 'full-auto'}`,
    state.intent ? `- Intent: ${state.intent}` : null,
    state.assignedTodos?.length ? `- Assigned TODOs: #${state.assignedTodos.join(', #')}` : null,
    state.sessionId ? `- Session: ${state.sessionId}` : null,
  ].filter(Boolean).join('\n');

  return base + stateContext;
}

/**
 * Resolve the model ID for the finalize agent.
 */
export function resolveFinalizeModel(_harnessState?: Record<string, unknown>): string {
  const state = readLucaState();
  return resolveModel({
    subagentType: 'lu-learner',
    complexity: (state.complexity as ComplexityLevel) ?? 'MODERATE',
    profile: (state.profile as ProfileLevel) ?? 'balanced',
  });
}

/**
 * Finalize agent configuration for mode registration.
 */
export const finalizeMode = {
  id: 'luca:6-finalize' as const,
  name: 'Finalize',
  description: 'Milestone boundaries, gap audit, PR creation, and session cleanup.',
  color: '#6366f1',
  defaultModelId: 'anthropic/claude-sonnet-4-6',
  buildInstructions: buildFinalizeInstructions,
  resolveModel: resolveFinalizeModel,
};
