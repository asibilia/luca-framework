import {
    lucaBranchGuardTool,
    lucaChecksRunTool,
    lucaConfidenceLogTool,
    lucaPhaseCurrentTool,
    lucaPhaseWriteAuditTool,
    lucaPhaseWriteContextTool,
    lucaPhaseWriteLearnTool,
    lucaPhaseWritePlanReviewTool,
    lucaPhaseWritePlanTool,
    lucaPhaseWriteResearchTool,
    lucaPhaseWriteSummaryTool,
    lucaPhaseWriteVerifyTool,
    lucaPhaseWriteWaveTool,
    lucaPreferencesReadTool,
    lucaPreferencesWriteTool,
    lucaPrReviewDetectConvergenceTool,
    lucaPrReviewFilterStaleTool,
    lucaPrReviewRegressionCheckTool,
    lucaRepoCleanupApplyTool,
    lucaRoadmapCreateTool,
    lucaRoadmapReadTool,
    lucaStateAdvanceTool,
    lucaStateReadTool,
    lucaTodoAddTool,
    lucaTodoListTool,
    lucaTodoUpdateTool,
    lucaWorkflowResetTool,
} from '../../write-surface/index.ts'

import type { ToolDescriptor } from '../schemas.ts'

/**
 * Central catalog of every MCP tool the luca server exposes. Importing
 * this module gets you the full set. The tool handlers themselves now
 * live in the runtime-agnostic src/write-surface/ domain (v13 plan,
 * Phase A); this registry is the MCP-transport view over them.
 *
 * Phase 5B.1 added 5 phase-write tools (summary, wave, verify, learn,
 * plan-review); Phase 5B.2 added 4 workflow + verification tools
 * (branch-guard, confidence-log, workflow-reset, checks-run); Phase
 * 5B.3 added 4 preferences + roadmap tools; Phase 5B.4 added 3 todo
 * delegation tools (add, list, update) that emit
 * muninn_remember/recall instructions for the agent to run; Phase 5B.5
 * adds 3 PR-review hardening tools + 1 repo-cleanup apply tool (the
 * write half of the read-only shadow-scanner subagent).
 */
export const TOOL_REGISTRY: ToolDescriptor[] = [
    // Read tools (available in every phase)
    lucaStateReadTool as ToolDescriptor,
    lucaPhaseCurrentTool as ToolDescriptor,
    lucaBranchGuardTool as ToolDescriptor,
    lucaPreferencesReadTool as ToolDescriptor,
    lucaRoadmapReadTool as ToolDescriptor,
    // PR-review hardening (read-only analysis)
    lucaPrReviewFilterStaleTool as ToolDescriptor,
    lucaPrReviewDetectConvergenceTool as ToolDescriptor,
    lucaPrReviewRegressionCheckTool as ToolDescriptor,
    // Todo delegation (emit muninn_* instructions; no allowedPhases)
    lucaTodoAddTool as ToolDescriptor,
    lucaTodoListTool as ToolDescriptor,
    lucaTodoUpdateTool as ToolDescriptor,
    // Repo cleanup (destructive apply, confirm-gated)
    lucaRepoCleanupApplyTool as ToolDescriptor,
    // State transitions (validated against pipeline-transitions table)
    lucaStateAdvanceTool as ToolDescriptor,
    // Workflow lifecycle (destructive, allowed in any phase)
    lucaWorkflowResetTool as ToolDescriptor,
    // Preferences write (validated through ProjectPreferencesSchema)
    lucaPreferencesWriteTool as ToolDescriptor,
    // Roadmap write (restricted to idle/triage)
    lucaRoadmapCreateTool as ToolDescriptor,
    // Verification (spawns subprocesses, restricted to execute/checks)
    lucaChecksRunTool as ToolDescriptor,
    // Write tools (each guarded by allowedPhases — single-step strict)
    lucaPhaseWriteResearchTool as ToolDescriptor,
    lucaPhaseWriteContextTool as ToolDescriptor,
    lucaPhaseWritePlanTool as ToolDescriptor,
    lucaPhaseWritePlanReviewTool as ToolDescriptor,
    lucaPhaseWriteSummaryTool as ToolDescriptor,
    lucaPhaseWriteWaveTool as ToolDescriptor,
    lucaPhaseWriteVerifyTool as ToolDescriptor,
    lucaPhaseWriteAuditTool as ToolDescriptor,
    lucaPhaseWriteLearnTool as ToolDescriptor,
    lucaConfidenceLogTool as ToolDescriptor,
]
