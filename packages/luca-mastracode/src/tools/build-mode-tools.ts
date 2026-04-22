import type { Tool } from '@mastra/core/tools'

import { classifyComplexityTool } from './classify-complexity.js'
import { confidenceJournalTool } from './confidence-journal.js'
import { createScopedTool } from './create-scoped-tool.js'
import { manageRoadmapTool } from './manage-roadmap.js'
import { manageTodosTool } from './manage-todos.js'
import { MODE_PERMISSIONS } from './mode-permissions.js'
import { pipelineLockTool } from './pipeline-lock.js'
import { repoCleanupTool } from './repo-cleanup.js'
import { runChecksTool } from './run-checks.js'
import { sessionLedgerTool } from './session-ledger.js'
import { verificationResultTool } from './verification-result.js'
import { workflowStateTool } from './workflow-state.js'
import { writePlanningFileTool } from './write-planning-file.js'

import { appendLedger } from '../session-ledger.js'

// ---------------------------------------------------------------------------
// Tool registry — maps snake_case manifest keys to tool instances and
// camelCase record keys expected by Mastra Agent.
// ---------------------------------------------------------------------------

interface ToolEntry {
    /** The actual Mastra Tool instance. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tool: Tool<any, any, any>
    /** The camelCase key used in the Agent tools record. */
    record_key: string
}

const TOOL_REGISTRY: Record<string, ToolEntry> = {
    classify_complexity: {
        tool: classifyComplexityTool,
        record_key: 'classifyComplexity',
    },
    manage_todos: { tool: manageTodosTool, record_key: 'manageTodos' },
    manage_roadmap: { tool: manageRoadmapTool, record_key: 'manageRoadmap' },
    workflow_state: { tool: workflowStateTool, record_key: 'workflowState' },
    pipeline_lock: { tool: pipelineLockTool, record_key: 'pipelineLock' },
    run_checks: { tool: runChecksTool, record_key: 'runChecks' },
    session_ledger: { tool: sessionLedgerTool, record_key: 'sessionLedger' },
    verification_result: {
        tool: verificationResultTool,
        record_key: 'verificationResult',
    },
    repo_cleanup: { tool: repoCleanupTool, record_key: 'repoCleanup' },
    write_planning_file: {
        tool: writePlanningFileTool,
        record_key: 'writePlanningFile',
    },
    confidence_journal: {
        tool: confidenceJournalTool,
        record_key: 'confidenceJournal',
    },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the tool set for a specific mode, applying action restrictions
 * from the permission manifest.
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
}): Record<string, Tool<any, any, any>> {
    const perms = MODE_PERMISSIONS[mode_id]
    if (!perms) {
        throw new Error(`No permissions defined for mode: ${mode_id}`)
    }

    const tools: Record<string, Tool<any, any, any>> = {}

    for (const [manifest_key, allowed_actions] of Object.entries(perms)) {
        const entry = TOOL_REGISTRY[manifest_key]
        if (!entry) {
            throw new Error(
                `Unknown tool "${manifest_key}" in MODE_PERMISSIONS for mode "${mode_id}". ` +
                    `Registered tools: ${Object.keys(TOOL_REGISTRY).join(', ')}`
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
