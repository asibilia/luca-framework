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
import { MODES } from '../modes/mode-ids.js'

export const MODE_PERMISSIONS: Record<
    string,
    Record<string, readonly string[] | '*'>
> = {
    build: {
        manage_todos: '*',
        workflow_state: '*',
        repo_cleanup: '*',
        pr_review: '*',
        run_rules: '*',
    },
    fast: {
        manage_todos: '*',
        workflow_state: '*',
        repo_cleanup: ['scan', 'parse-report', 'summary'],
        pr_review: '*',
        run_rules: '*',
    },
    plan: {
        classify_complexity: '*',
        session_ledger: '*',
        workflow_state: ['read'],
    },
    [MODES.discuss]: {
        session_ledger: '*',
        manage_todos: ['list', 'read'],
        workflow_state: ['read'],
        run_postmortem: ['analyze', 'list-runs'],
    },
    [MODES.triage]: {
        classify_complexity: '*',
        workflow_state: ['read', 'save-triage-results', 'switch-mode'],
        pipeline_lock: ['status', 'recover', 'acquire'],
        manage_todos: ['list', 'read'],
    },
    [MODES.research]: {
        workflow_state: ['read', 'switch-mode'],
        manage_todos: ['list', 'read', 'add'],
        write_planning_file: ['write', 'read'],
    },
    [MODES.architect]: {
        manage_roadmap: '*',
        workflow_state: ['read', 'save-plan-artifacts', 'switch-mode'],
        write_planning_file: ['write', 'read'],
    },
    [MODES.execute]: {
        workflow_state: [
            'read',
            'start-phase',
            'record-iteration',
            'advance-wave',
            'complete-phase',
            'justify-empty-phase',
            'switch-mode',
        ],
        manage_todos: ['list', 'read', 'move', 'move-batch'],
        pipeline_lock: ['update'],
        run_checks: '*',
        run_rules: ['list', 'run', 'gate'],
        verification_result: '*',
        write_planning_file: ['write', 'read'],
        confidence_journal: '*',
    },
    [MODES.review]: {
        workflow_state: ['read', 'save-review-results', 'switch-mode'],
        run_checks: '*',
        run_rules: ['list', 'run'],
        verification_result: ['read', 'read-history', 'aggregate'],
        repo_cleanup: ['scan', 'parse-report', 'summary'],
        write_planning_file: ['write', 'read'],
        confidence_journal: ['read', 'summary'],
        claim_verifier: ['verify-text', 'verify-file'],
    },
    [MODES.finalize]: {
        workflow_state: [
            'read',
            'reset-pipeline',
            'switch-mode',
            're-enter-pipeline',
            'justify-empty-phase',
        ],
        run_checks: '*',
        pipeline_lock: ['release'],
        session_ledger: '*',
        verification_result: ['read', 'read-history', 'aggregate'],
        manage_todos: ['list', 'read', 'move', 'move-batch'],
        repo_cleanup: '*',
        confidence_journal: ['read', 'summary', 'render'],
        run_postmortem: '*',
        claim_verifier: '*',
        run_rules: '*',
    },
} as const
