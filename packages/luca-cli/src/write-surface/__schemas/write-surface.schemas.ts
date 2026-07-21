import type { PipelineStep } from '@alecsibilia/luca-core'
import { z } from 'zod'

/**
 * Runtime-agnostic context handed to every write-surface handler.
 *
 * `cwd` is the project root; handlers resolve `.luca/` paths relative
 * to it.
 *
 * `homedir` is an OPTIONAL test seam for handlers that address the
 * machine-global handoff mailbox at `<homedir>/.luca/handoff/`. It is
 * deliberately part of the CONTEXT and NOT a tool input: `runWriteHandler`
 * never sets it, so there is no `--homedir` CLI flag and no way for an
 * agent to redirect the mailbox. Tests (and only tests) pass a temp dir so
 * a probe never writes into the developer's real `~/.luca/handoff/`.
 */
export interface ToolContext {
    cwd: string
    homedir?: string
}

/**
 * A single text block in a {@link WriteResult}.
 */
export interface WriteResultContent {
    type: 'text'
    text: string
}

/**
 * Result of a write-surface handler invocation.
 *
 * Local result type (v13 plan D4) — defined here so handlers depend
 * only on runtime-neutral code. Consumed by the `luca` CLI commands
 * that front the write-surface handlers.
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
