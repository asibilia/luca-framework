import type { PipelineStep } from '@alecsibilia/luca-core'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

export interface ToolContext {
    cwd: string
}

// Re-export the SDK's CallToolResult type as our ToolResult so handler
// return values are structurally compatible with what the MCP server
// expects from setRequestHandler(CallToolRequestSchema, ...).
export type ToolResult = CallToolResult

/**
 * MCP tool descriptor — everything needed to register a tool with the
 * MCP server AND enforce phase preconditions before its handler runs.
 *
 * `allowedPhases` is OPTIONAL — it declares a phase restriction, and the
 * server-side guard refuses the tool outside those pipelineSteps. A tool
 * that omits it runs in any phase. Omission covers read-only tools AND
 * intentionally phase-agnostic write tools (e.g. luca_confidence_log,
 * luca_workflow_reset); only phase-restricted tools declare the list.
 */
export interface ToolDescriptor<TArgs = unknown> {
    name: string
    description: string
    inputSchema: z.ZodType<TArgs>
    /** pipelineSteps in which this tool is allowed to run. */
    allowedPhases?: PipelineStep[]
    handler: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>
}

// Re-export Zod for tool definition convenience.
export { z }
