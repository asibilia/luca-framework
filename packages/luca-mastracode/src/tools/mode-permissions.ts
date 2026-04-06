/**
 * Mode permission manifest — SINGLE SOURCE OF TRUTH for mode-tool access.
 *
 * Each mode maps to the tools it receives. For action-based tools,
 * the value is an array of permitted action strings. The sentinel '*'
 * means every action the tool defines is allowed.
 *
 * Keys are snake_case tool identifiers that the resolver maps to the
 * actual tool instances and camelCase record keys expected by Mastra.
 *
 * ─── Adding a new mode or tool ───
 * 1. Add its permissions here.
 * 2. Register the base tool in build-mode-tools.ts TOOL_REGISTRY.
 * 3. That's it — buildModeTools() handles scoping automatically.
 */
export const MODE_PERMISSIONS: Record<string, Record<string, readonly string[] | '*'>> = {
  build: {
    manage_todos: '*',
    workflow_state: '*',
    repo_cleanup: '*',
  },
  fast: {
    manage_todos: '*',
    workflow_state: '*',
    repo_cleanup: ['scan', 'parse-report', 'summary'],
  },
  plan: {
    classify_complexity: '*',
    session_ledger: '*',
    workflow_state: ['read'],
  },
  discuss: {
    session_ledger: '*',
    manage_todos: ['list', 'read'],
    workflow_state: ['read'],
  },
  triage: {
    classify_complexity: '*',
    workflow_state: ['read', 'save-triage-results', 'switch-mode'],
    pipeline_lock: ['status', 'recover', 'acquire'],
  },
  research: {
    workflow_state: ['read', 'switch-mode'],
    manage_todos: ['add'],
  },
  architect: {
    manage_roadmap: '*',
    workflow_state: ['read', 'save-plan-artifacts', 'switch-mode'],
  },
  execute: {
    workflow_state: ['read', 'start-phase', 'record-iteration', 'advance-wave', 'complete-phase', 'switch-mode'],
    manage_todos: ['list', 'read'],
    run_checks: '*',
    verification_result: '*',
  },
  review: {
    workflow_state: ['read', 'save-review-results', 'switch-mode'],
    run_checks: '*',
    verification_result: ['read', 'read-history', 'aggregate'],
    repo_cleanup: ['scan', 'parse-report', 'summary'],
  },
  finalize: {
    workflow_state: ['read', 'reset-pipeline', 'switch-mode'],
    run_checks: '*',
    pipeline_lock: ['release'],
    session_ledger: '*',
    verification_result: ['read', 'read-history', 'aggregate'],
    manage_todos: ['list', 'read'],
    repo_cleanup: '*',
  },
} as const;
