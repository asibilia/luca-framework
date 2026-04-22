import { createTool, type Tool } from '@mastra/core/tools'
import { z } from 'zod'

/**
 * Create a scoped variant of an action-based tool that only permits
 * the specified actions. Disallowed actions are rejected at schema
 * validation before execution — the LLM only sees the allowed actions
 * in the schema.
 *
 * Expects tools whose inputSchema is a flat `z.object({ action: z.enum(...) })`
 * schema. The action enum is narrowed to only include `allowed_actions`.
 *
 * If the tool has no `action` field in its input schema, it is returned
 * as-is (non-action tools like classifyComplexity or runChecks).
 *
 * Usage:
 *   const readOnlyTodos = createScopedTool({
 *     tool: manageTodosTool,
 *     allowed_actions: ['list', 'read'],
 *   });
 */
export function createScopedTool<T extends Tool>({
    tool,
    allowed_actions,
    id_suffix,
    description_suffix,
}: {
    tool: T
    allowed_actions: string[]
    id_suffix?: string
    description_suffix?: string
}): T {
    const base_schema = tool.inputSchema

    if (!base_schema) {
        return tool
    }

    if (!(base_schema instanceof z.ZodObject)) {
        // Unknown schema type — return as-is
        return tool
    }

    const action_field = base_schema.shape?.action
    if (!action_field) {
        // Non-action tool — return as-is
        return tool
    }

    const scoped_schema = base_schema.extend({
        action: z.enum(allowed_actions as [string, ...string[]]),
    })

    const scoped = createTool({
        id: id_suffix ? `${tool.id}-${id_suffix}` : tool.id,
        description: description_suffix
            ? `${tool.description} ${description_suffix}`
            : `${tool.description} [Allowed actions: ${allowed_actions.join(', ')}]`,
        inputSchema: scoped_schema,
        outputSchema: tool.outputSchema,
        execute: tool.execute,
    })

    // createTool() returns a new Tool whose generic type params differ from the
    // original tool's (the inputSchema was narrowed). TypeScript can't prove the
    // structural equivalence, so we need the double cast through unknown.
    return scoped as unknown as T
}
