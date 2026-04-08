/**
 * Execute mode agent — Luca Steps 7h-7l: execute, checks, verify, review, learn.
 *
 * Core implementation loop. Spawns executor subagents per wave,
 * runs automated checks, verifies correctness, performs code review
 * from 4 perspectives, and captures learnings.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModel } from '../model-routing.js';
import { readLucaState } from '../luca-store.js';
import type { ComplexityLevel, ProfileLevel } from '../state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadInstructions(): string {
  return readFileSync(join(__dirname, '..', 'instructions', 'execute.md'), 'utf-8');
}

/**
 * Build dynamic instructions for the execute agent.
 * Reads workflow state from .planning/luca-state.json.
 */
export function buildExecuteInstructions(_harnessState?: Record<string, unknown>): string {
  const base = loadInstructions();
  const state = readLucaState();

  const stateContext = [
    '',
    '## Current Workflow State',
    `- Complexity: ${state.complexity ?? 'unknown'}`,
    `- Profile: ${state.profile ?? 'balanced'}`,
    `- Oversight: ${state.oversight ?? 'full-auto'}`,
    state.intent ? `- Intent: ${state.intent}` : null,
    state.planFile ? `- Plan file: ${state.planFile} (read this file from disk for the execution plan)` : null,
    state.roadmapFile ? `- Roadmap file: ${state.roadmapFile} (read this file from disk for phase sequencing)` : null,
    state.assignedTodos?.length ? `- Assigned TODOs: #${state.assignedTodos.join(', #')}` : null,
  ].filter(Boolean).join('\n');

  return base + stateContext;
}

/**
 * Resolve the model ID for the execute agent.
 * Uses ORCHESTRATOR preset — scales up with complexity.
 */
export function resolveExecuteModel(_harnessState?: Record<string, unknown>): string {
  const state = readLucaState();
  return resolveModel({
    subagentType: 'lu-executor',
    complexity: (state.complexity as ComplexityLevel) ?? 'MODERATE',
    profile: (state.profile as ProfileLevel) ?? 'balanced',
  });
}

/**
 * Execute agent configuration for mode registration.
 */
export const executeMode = {
  id: 'luca:4-execute' as const,
  name: 'Execute',
  description: 'Implement code changes atomically with automated checks, verification, code review, and learning capture.',
  color: '#10b981',
  defaultModelId: 'anthropic/claude-opus-4-6',
  buildInstructions: buildExecuteInstructions,
  resolveModel: resolveExecuteModel,
};
