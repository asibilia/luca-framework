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
 * Tools without an `allowedPhases` list run regardless of pipelineStep
 * (read-only tools usually). Write tools MUST declare allowedPhases so
 * the server-side guard layer can refuse calls outside the right phase.
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
