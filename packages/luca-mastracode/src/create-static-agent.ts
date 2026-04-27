/**
 * Static agent factory for Luca modes.
 *
 * Returns a single Agent instance with dynamic `instructions` and `model`
 * callbacks. The harness init loop injects memory (for Observational Memory)
 * into static agents — factory agents `(state) => Agent` are skipped, which
 * breaks OM. Using static agents with dynamic callbacks gives us both:
 *   - Dynamic behavior (instructions/model change per-request)
 *   - Proper memory injection from the harness
 *
 * Model resolution uses Mastra Code's `resolveModel` (which handles OAuth,
 * stored API keys, and the Claude Max provider) via the mutable
 * `resolveModelRef`.
 */
import { Agent } from '@mastra/core/agent'

import {
    CORE_OPERATING_RULES,
    getAgentConstraints,
} from './agent-constraints.js'
import { mcpManagerRef, resolveModelRef } from './refs.js'

export function createStaticAgent({
    id,
    name,
    defaultModelId,
    buildInstructions,
    resolveModelFn,
    tools,
}: {
    id: string
    name: string
    defaultModelId: string
    buildInstructions: () => string
    resolveModelFn: () => string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: Record<string, any>
}): Agent {
    return new Agent({
        id,
        name: `Luca ${name}`,
        // Dynamic instructions: called per-request, reads luca-store at call time.
        // CORE_OPERATING_RULES is prepended (primacy zone) and
        // getAgentConstraints() is appended (recency zone) to every mode's instructions.
        instructions: () =>
            CORE_OPERATING_RULES +
            '\n\n' +
            buildInstructions() +
            getAgentConstraints(),
        // Dynamic model: called per-request, resolves via OAuth-aware pipeline
        model: () => {
            const modelId = resolveModelFn() ?? defaultModelId
            if (resolveModelRef.current) {
                return resolveModelRef.current(modelId)
            }
            return modelId
        },
        // Dynamic tools: merge static mode tools + MCP tools at request time.
        // Static tools (from buildModeTools) are preserved; MCP tools (e.g. MuninnDB)
        // are layered on top via mcpManagerRef, mirroring how stock mastracode's
        // codeAgent gets them via createDynamicTools.
        tools: () => {
            const mcpTools = mcpManagerRef.current?.getTools() ?? {}
            return { ...tools, ...mcpTools }
        },
    })
}
