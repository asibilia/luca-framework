import { coarsePhaseOf, type PipelineStep } from '@alecsibilia/luca-core'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { loadCurrentState } from '../../hook/helpers/load-current-state.ts'
import type { ToolContext, ToolDescriptor, ToolResult } from '../schemas.ts'

export interface CreateServerOptions {
    /** Project root for tool handlers (cwd context). */
    cwd: string
    /** Tools to expose. Pass TOOL_REGISTRY in production. */
    tools: ToolDescriptor[]
    /** Server name + version (for MCP handshake). */
    name?: string
    version?: string
}

/**
 * Build a configured MCP Server that exposes the given tool registry.
 *
 * The server enforces phase preconditions before invoking any tool
 * handler: if a tool declares `allowedPhases` and the current
 * pipelineStep isn't in that set, the call returns an isError result
 * naming the violation instead of running the handler. This is the
 * second-layer enforcement (the first being the stage-gate hook).
 */
export function createLucaMcpServer(opts: CreateServerOptions): Server {
    const server = new Server(
        {
            name: opts.name ?? 'luca',
            version: opts.version ?? '0.1.0',
        },
        {
            capabilities: { tools: {} },
        }
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            // Zod → JSON Schema via z.toJSONSchema is preferable, but the
            // SDK accepts a plain object — use the Zod definition's shape.
            inputSchema: zodToInputSchema(t.inputSchema),
        })),
    }))

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const tool = opts.tools.find((t) => t.name === request.params.name)
        if (!tool) {
            return errorResult(`unknown tool: ${request.params.name}`)
        }

        // Phase precondition check
        if (tool.allowedPhases && tool.allowedPhases.length > 0) {
            const state = await loadCurrentState({ cwd: opts.cwd })
            if (!tool.allowedPhases.includes(state.pipelineStep)) {
                return errorResult(
                    `tool '${tool.name}' is only available in phases [${tool.allowedPhases.join(
                        ', '
                    )}]; current pipelineStep is '${state.pipelineStep}' (phase=${coarsePhaseOf(state.pipelineStep)})`
                )
            }
        }

        // Validate args via the tool's Zod schema.
        const parsed = tool.inputSchema.safeParse(
            request.params.arguments ?? {}
        )
        if (!parsed.success) {
            return errorResult(
                `invalid arguments for '${tool.name}': ${parsed.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; ')}`
            )
        }

        const ctx: ToolContext = { cwd: opts.cwd }
        try {
            return await tool.handler(parsed.data, ctx)
        } catch (err) {
            return errorResult(
                `tool '${tool.name}' threw: ${(err as Error).message}`
            )
        }
    })

    return server
}

function errorResult(message: string): ToolResult {
    return {
        content: [{ type: 'text', text: message }],
        isError: true,
    }
}

/**
 * Best-effort Zod → JSON Schema converter for the MCP inputSchema field.
 *
 * The MCP SDK accepts the shape `{ type: 'object', properties: {...} }`.
 * For Phase 4 we ship a permissive object schema for every tool — the
 * real validation happens server-side via Zod safeParse. A proper Zod
 * → JSON Schema converter (e.g. zod-to-json-schema) can replace this
 * later if the LLM needs richer hints.
 */
function zodToInputSchema(_schema: unknown): {
    type: 'object'
    properties: Record<string, unknown>
} {
    return { type: 'object', properties: {} }
}

// Type re-export so callers don't need a second import.
export type { PipelineStep }
