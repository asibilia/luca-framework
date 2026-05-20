import type { ToolDescriptor } from '../schemas.ts'
import { lucaPhaseCurrentTool } from './tools/luca-phase-current.ts'
import { lucaPhaseWriteAuditTool } from './tools/luca-phase-write-audit.ts'
import { lucaPhaseWriteContextTool } from './tools/luca-phase-write-context.ts'
import { lucaPhaseWritePlanTool } from './tools/luca-phase-write-plan.ts'
import { lucaPhaseWriteResearchTool } from './tools/luca-phase-write-research.ts'
import { lucaStateAdvanceTool } from './tools/luca-state-advance.ts'
import { lucaStateReadTool } from './tools/luca-state-read.ts'

/**
 * Central catalog of every MCP tool the luca server exposes. Importing
 * this module gets you the full set. Phase 4 ships 7 tools — Phase 5+
 * will add todo/milestone/telemetry tools as the workflow needs them.
 */
export const TOOL_REGISTRY: ToolDescriptor[] = [
    // Read tools (available in every phase)
    lucaStateReadTool as ToolDescriptor,
    lucaPhaseCurrentTool as ToolDescriptor,
    // State transitions (validated against pipeline-transitions table)
    lucaStateAdvanceTool as ToolDescriptor,
    // Write tools (each guarded by allowedPhases — single-step strict)
    lucaPhaseWritePlanTool as ToolDescriptor,
    lucaPhaseWriteResearchTool as ToolDescriptor,
    lucaPhaseWriteContextTool as ToolDescriptor,
    lucaPhaseWriteAuditTool as ToolDescriptor,
]
