/**
 * Plan mode — stock read-only plan mode.
 *
 * Explores the codebase and designs implementation plans without making changes.
 * This is NOT part of the Luca pipeline — it's a standalone utility mode.
 * For pipeline planning, use Architect mode.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadInstructions(): string {
  return readFileSync(join(__dirname, '..', 'instructions', 'plan.md'), 'utf-8');
}

export function buildPlanInstructions(): string {
  return loadInstructions();
}

export function resolvePlanModel(): string {
  return 'anthropic/claude-sonnet-4-6';
}

export const planMode = {
  id: 'plan' as const,
  name: 'Plan',
  description: 'Read-only exploration and plan design. Does not modify files.',
  color: '#8b5cf6',
  defaultModelId: 'anthropic/claude-sonnet-4-6',
  buildInstructions: buildPlanInstructions,
  resolveModel: resolvePlanModel,
};
