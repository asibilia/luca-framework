import type { ToolDescriptor } from '../schemas.ts'
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
import { lucaStateAdvanceTool } from './tools/luca-state-advance.ts'
import { lucaStateReadTool } from './tools/luca-state-read.ts'

/**
 * Central catalog of every MCP tool the luca server exposes. Importing
 * this module gets you the full set. Phase 4 shipped 7 tools; Phase 5B
 * adds 5 more phase-write tools (summary, wave, verify, learn,
 * plan-review).
 */
export const TOOL_REGISTRY: ToolDescriptor[] = [
    // Read tools (available in every phase)
    lucaStateReadTool as ToolDescriptor,
    lucaPhaseCurrentTool as ToolDescriptor,
    // State transitions (validated against pipeline-transitions table)
    lucaStateAdvanceTool as ToolDescriptor,
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
]
