import type { PipelineStep } from '@alecsibilia/luca-core'
import { z } from 'zod'

/**
 * Runtime-agnostic context handed to every write-surface handler.
 *
 * `cwd` is the project root; handlers resolve `.luca/` paths relative
 * to it. This is the only environmental dependency a handler receives.
 */
export interface ToolContext {
    cwd: string
}

/**
 * A single text block in a {@link WriteResult}.
 *
 * Structurally identical to the MCP SDK's text content block, so a
 * `WriteResult` is also a valid `CallToolResult` — the MCP transport
 * shell can return one with a no-op cast.
 */
export interface WriteResultContent {
    type: 'text'
    text: string
}

/**
 * Result of a write-surface handler invocation.
 *
 * Local replacement for the former `ToolResult = CallToolResult` alias
 * (v13 plan D4) — this type is defined here so handlers no longer import
 * from `@modelcontextprotocol/sdk`. Its shape is a structural subset of
 * the SDK's `CallToolResult`, so the MCP server can return it directly.
 *
 * @example
 * ```typescript
 * const ok: WriteResult = { content: [{ type: 'text', text: 'wrote plan.md' }] }
 * const fail: WriteResult = { content: [{ type: 'text', text: 'no active phase' }], isError: true }
 * ```
 */
export interface WriteResult {
    content: WriteResultContent[]
    isError?: boolean
}

/**
 * Write-surface tool descriptor — everything needed to register a tool
 * with a transport (the MCP server today) AND enforce phase
 * preconditions before its handler runs.
 *
 * `allowedPhases` is OPTIONAL — it declares a phase restriction, and the
 * caller's guard refuses the tool outside those pipelineSteps. A tool
 * that omits it runs in any phase. Omission covers read-only tools AND
 * intentionally phase-agnostic write tools (e.g. luca_confidence_log,
 * luca_workflow_reset); only phase-restricted tools declare the list.
 *
 * NOTE: the name `ToolDescriptor` is retained from the MCP era to
 * minimise churn during the v13 strangler window; a rename is a later
 * phase.
 */
export interface ToolDescriptor<TArgs = unknown> {
    name: string
    description: string
    inputSchema: z.ZodType<TArgs>
    /** pipelineSteps in which this tool is allowed to run. */
    allowedPhases?: PipelineStep[]
    handler: (args: TArgs, ctx: ToolContext) => Promise<WriteResult>
}

// Re-export Zod for tool definition convenience.
export { z }
