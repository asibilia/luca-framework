/**
 * Review mode agent — read-only code audit.
 *
 * Performs multi-perspective code review against the plan,
 * produces a structured audit report, and routes to either
 * Finalize (clean) or back to Execute (must-fix issues).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModel } from '../model-routing.js';
import { readLucaState } from '../luca-store.js';
import type { ComplexityLevel, ProfileLevel } from '../state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadInstructions(): string {
  return readFileSync(join(__dirname, '..', 'instructions', 'review.md'), 'utf-8');
}

/**
 * Build dynamic instructions for the review agent.
 * Reads workflow state from .planning/luca-state.json.
 */
export function buildReviewInstructions(_harnessState?: Record<string, unknown>): string {
  const base = loadInstructions();
  const state = readLucaState();

  const stateContext = [
    '',
    '## Current Workflow State',
    `- Complexity: ${state.complexity ?? 'unknown'}`,
    `- Profile: ${state.profile ?? 'balanced'}`,
    `- Oversight: ${state.oversight ?? 'full-auto'}`,
    state.intent ? `- Intent: ${state.intent}` : null,
    state.planFile ? `- Plan file: ${state.planFile}` : null,
    state.roadmapFile ? `- Roadmap file: ${state.roadmapFile}` : null,
    `- Review iteration: ${state.reviewIteration ?? 0}`,
    `- Max review iterations: ${state.maxReviewIterations ?? 2}`,
  ].filter(Boolean).join('\n');

  return base + stateContext;
}

/**
 * Resolve the model ID for the review agent.
 * Uses lu-reviewer preset — defaults to Sonnet for balanced analysis.
 */
export function resolveReviewModel(_harnessState?: Record<string, unknown>): string {
  const state = readLucaState();
  return resolveModel({
    subagentType: 'lu-reviewer',
    complexity: (state.complexity as ComplexityLevel) ?? 'MODERATE',
    profile: (state.profile as ProfileLevel) ?? 'balanced',
  });
}

/**
 * Review agent configuration for mode registration.
 */
export const reviewMode = {
  id: 'luca:5-review' as const,
  name: 'luca: Review',
  description: 'Read-only code audit: multi-perspective review, structured findings, and iteration routing.',
  color: '#f59e0b',
  defaultModelId: 'anthropic/claude-sonnet-4-6',
  buildInstructions: buildReviewInstructions,
  resolveModel: resolveReviewModel,
};
