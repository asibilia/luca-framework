import type { ToolDescriptor } from '../schemas.ts'
import { lucaBranchGuardTool } from './tools/luca-branch-guard.ts'
import { lucaChecksRunTool } from './tools/luca-checks-run.ts'
import { lucaConfidenceLogTool } from './tools/luca-confidence-log.ts'
import { lucaPhaseCurrentTool } from './tools/luca-phase-current.ts'
import { lucaPhaseWriteAuditTool } from './tools/luca-phase-write-audit.ts'
import { lucaPhaseWriteContextTool } from './tools/luca-phase-write-context.ts'
import { lucaPhaseWriteLearnTool } from './tools/luca-phase-write-learn.ts'
import { lucaPhaseWritePlanReviewTool } from './tools/luca-phase-write-plan-review.ts'
import { lucaPhaseWritePlanTool } from './tools/luca-phase-write-plan.ts'
import { lucaPhaseWriteResearchTool } from './tools/luca-phase-write-research.ts'
import { lucaPhaseWriteSummaryTool } from './tools/luca-phase-write-summary.ts'
import { lucaPhaseWriteVerifyTool } from './tools/luca-phase-write-verify.ts'
import { lucaPhaseWriteWaveTool } from './tools/luca-phase-write-wave.ts'
import { lucaPreferencesReadTool } from './tools/luca-preferences-read.ts'
import { lucaPreferencesWriteTool } from './tools/luca-preferences-write.ts'
import { lucaRoadmapCreateTool } from './tools/luca-roadmap-create.ts'
import { lucaRoadmapReadTool } from './tools/luca-roadmap-read.ts'
import { lucaStateAdvanceTool } from './tools/luca-state-advance.ts'
import { lucaStateReadTool } from './tools/luca-state-read.ts'
import { lucaWorkflowResetTool } from './tools/luca-workflow-reset.ts'

/**
 * Central catalog of every MCP tool the luca server exposes. Importing
 * this module gets you the full set. Phase 5B.1 added 5 phase-write
 * tools (summary, wave, verify, learn, plan-review); Phase 5B.2 added 4
 * workflow + verification tools (branch-guard, confidence-log,
 * workflow-reset, checks-run); Phase 5B.3 adds 4 preferences + roadmap
 * tools.
 */
export const TOOL_REGISTRY: ToolDescriptor[] = [
    // Read tools (available in every phase)
    lucaStateReadTool as ToolDescriptor,
    lucaPhaseCurrentTool as ToolDescriptor,
    lucaBranchGuardTool as ToolDescriptor,
    lucaPreferencesReadTool as ToolDescriptor,
    lucaRoadmapReadTool as ToolDescriptor,
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
