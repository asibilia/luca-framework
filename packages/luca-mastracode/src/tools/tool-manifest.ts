/**
 * Tool manifest — SINGLE SOURCE OF TRUTH for tool registration and mode access.
 *
 * Each entry maps a snake_case manifest key to:
 *   - tool:       the Mastra Tool instance
 *   - record_key: the camelCase key expected by Mastra Agent's tools record
 *   - modes:      which modes receive this tool and with what action scope
 *
 * The sentinel '*' means every action the tool defines is allowed.
 * An array of strings restricts the tool to those actions only.
 *
 * ─── Adding a new tool ───
 * 1. Create the tool file in src/tools/.
 * 2. Add a TOOL_MANIFEST entry here (tool instance + record_key + modes).
 * 3. Export it from tools/index.ts.
 * That's it — buildModeTools() handles scoping automatically.
 */
import type { Tool } from '@mastra/core/tools'

import { MODES } from '../constants/mode-ids.js'
import { appendLedger } from '../state/session-ledger.js'

import { claimVerifierTool } from './claim-verifier.js'
import { classifyComplexityTool } from './classify-complexity.js'
import { confidenceJournalTool } from './confidence-journal.js'
import { createScopedTool } from './create-scoped-tool.js'
import { manageRoadmapTool } from './manage-roadmap.js'
import { manageTodosTool } from './manage-todos.js'
import { pipelineLockTool } from './pipeline-lock.js'
import { prReviewTool } from './pr-review.js'
import { repoCleanupTool } from './repo-cleanup.js'
import { runChecksTool } from './run-checks.js'
import { runPostmortemTool } from './run-postmortem.js'
import { runRulesTool } from './run-rules.js'
import { sessionLedgerTool } from './session-ledger.js'
import { verificationResultTool } from './verification-result.js'
import { workflowStateTool } from './workflow-state.js'
import { writePlanningFileTool } from './write-planning-file.js'

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

interface ToolManifestEntry {
    /** The actual Mastra Tool instance. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tool: Tool<any, any, any>
    /** The camelCase key used in the Agent tools record. */
    record_key: string
    /** Per-mode permissions: '*' = full access, string[] = allowed actions. */
    modes: Record<string, readonly string[] | '*'>
}

// ---------------------------------------------------------------------------
// TOOL_MANIFEST — single source of truth
// ---------------------------------------------------------------------------

const TOOL_MANIFEST: Record<string, ToolManifestEntry> = {
    classify_complexity: {
        tool: classifyComplexityTool,
        record_key: 'classifyComplexity',
        modes: {
            plan: '*',
            [MODES.triage]: '*',
        },
    },
    manage_todos: {
        tool: manageTodosTool,
        record_key: 'manageTodos',
        modes: {
            build: '*',
            fast: '*',
            [MODES.discuss]: ['list', 'read'],
            [MODES.triage]: ['list', 'read'],
            [MODES.research]: ['list', 'read', 'add'],
            [MODES.execute]: ['list', 'read', 'move', 'move-batch'],
            [MODES.finalize]: ['list', 'read', 'move', 'move-batch'],
        },
    },
    manage_roadmap: {
        tool: manageRoadmapTool,
        record_key: 'manageRoadmap',
        modes: {
            [MODES.architect]: '*',
        },
    },
    workflow_state: {
        tool: workflowStateTool,
        record_key: 'workflowState',
        modes: {
            build: '*',
            fast: '*',
            plan: ['read'],
            [MODES.discuss]: ['read'],
            [MODES.triage]: ['read', 'save-triage-results', 'switch-mode'],
            [MODES.research]: ['read', 'switch-mode'],
            [MODES.architect]: ['read', 'save-plan-artifacts', 'switch-mode'],
            [MODES.execute]: [
                'read',
                'start-phase',
                'record-iteration',
                'advance-wave',
                'complete-phase',
                'justify-empty-phase',
                'switch-mode',
            ],
            [MODES.review]: ['read', 'save-review-results', 'switch-mode'],
            [MODES.finalize]: [
                'read',
                'reset-pipeline',
                'switch-mode',
                're-enter-pipeline',
                'justify-empty-phase',
            ],
        },
    },
    pipeline_lock: {
        tool: pipelineLockTool,
        record_key: 'pipelineLock',
        modes: {
            [MODES.triage]: ['status', 'recover', 'acquire'],
            [MODES.execute]: ['update'],
            [MODES.finalize]: ['release'],
        },
    },
    run_checks: {
        tool: runChecksTool,
        record_key: 'runChecks',
        modes: {
            [MODES.execute]: '*',
            [MODES.review]: '*',
            [MODES.finalize]: '*',
        },
    },
    session_ledger: {
        tool: sessionLedgerTool,
        record_key: 'sessionLedger',
        modes: {
            plan: '*',
            [MODES.discuss]: '*',
            [MODES.finalize]: '*',
        },
    },
    verification_result: {
        tool: verificationResultTool,
        record_key: 'verificationResult',
        modes: {
            [MODES.execute]: '*',
            [MODES.review]: ['read', 'read-history', 'aggregate'],
            [MODES.finalize]: ['read', 'read-history', 'aggregate'],
        },
    },
    repo_cleanup: {
        tool: repoCleanupTool,
        record_key: 'repoCleanup',
        modes: {
            build: '*',
            fast: ['scan', 'parse-report', 'summary'],
            [MODES.review]: ['scan', 'parse-report', 'summary'],
            [MODES.finalize]: '*',
        },
    },
    write_planning_file: {
        tool: writePlanningFileTool,
        record_key: 'writePlanningFile',
        modes: {
            [MODES.research]: ['write', 'read'],
            [MODES.architect]: ['write', 'read'],
            [MODES.execute]: ['write', 'read'],
            [MODES.review]: ['write', 'read'],
        },
    },
    confidence_journal: {
        tool: confidenceJournalTool,
        record_key: 'confidenceJournal',
        modes: {
            [MODES.execute]: '*',
            [MODES.review]: ['read', 'summary'],
            [MODES.finalize]: ['read', 'summary', 'render'],
        },
    },
    run_postmortem: {
        tool: runPostmortemTool,
        record_key: 'runPostmortem',
        modes: {
            [MODES.discuss]: ['analyze', 'list-runs'],
            [MODES.finalize]: '*',
        },
    },
    claim_verifier: {
        tool: claimVerifierTool,
        record_key: 'claimVerifier',
        modes: {
            [MODES.review]: ['verify-text', 'verify-file'],
            [MODES.finalize]: '*',
        },
    },
    pr_review: {
        tool: prReviewTool,
        record_key: 'prReview',
        modes: {
            build: '*',
            fast: '*',
        },
    },
    run_rules: {
        tool: runRulesTool,
        record_key: 'runRules',
        modes: {
            build: '*',
            fast: '*',
            [MODES.execute]: ['list', 'run', 'gate'],
            [MODES.review]: ['list', 'run'],
            [MODES.finalize]: '*',
        },
    },
}

// ---------------------------------------------------------------------------
// Derived MODE_PERMISSIONS — backward-compatible view (mode → tool → actions)
//
// Computed from TOOL_MANIFEST at module init. Inverts the per-tool mode map
// into the per-mode tool map that consumers expect.
// ---------------------------------------------------------------------------

export const MODE_PERMISSIONS: Record<
    string,
    Record<string, readonly string[] | '*'>
> = Object.entries(TOOL_MANIFEST).reduce(
    (acc, [manifest_key, entry]) => {
        for (const [mode, actions] of Object.entries(entry.modes)) {
            acc[mode] ??= {}
            acc[mode][manifest_key] = actions
        }
        return acc
    },
    {} as Record<string, Record<string, readonly string[] | '*'>>
)

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the tool set for a specific mode, applying action restrictions
 * from the manifest.
 *
 * Returns a Record<string, Tool> with camelCase keys matching the names
 * used in mode instruction files (e.g., `workflowState`, `manageTodos`).
 *
 * Full-access tools ('*') are passed through unchanged.
 * Restricted tools get a scoped variant with a narrowed action enum.
 */
export function buildModeTools({
    mode_id,
}: {
    mode_id: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Record<string, Tool<any, any, any>> {
    const perms = MODE_PERMISSIONS[mode_id]
    if (!perms) {
        throw new Error(`No permissions defined for mode: ${mode_id}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, Tool<any, any, any>> = {}

    for (const [manifest_key, allowed_actions] of Object.entries(perms)) {
        const entry = TOOL_MANIFEST[manifest_key]
        if (!entry) {
            throw new Error(
                `Unknown tool "${manifest_key}" in MODE_PERMISSIONS for mode "${mode_id}". ` +
                    `Registered tools: ${Object.keys(TOOL_MANIFEST).join(', ')}`
            )
        }

        if (allowed_actions === '*') {
            tools[entry.record_key] = entry.tool
        } else {
            tools[entry.record_key] = createScopedTool({
                tool: entry.tool,
                allowed_actions: [...allowed_actions],
            })
        }
    }

    appendLedger('tool-access-granted', {
        mode: mode_id,
        tools: Object.entries(perms).map(([tool, actions]) => ({
            tool,
            actions: actions === '*' ? '*' : [...actions],
        })),
    })

    return tools
}
