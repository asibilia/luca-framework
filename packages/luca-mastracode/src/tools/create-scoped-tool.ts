import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Create a scoped variant of an action-based tool that only permits
 * the specified actions. Disallowed actions are rejected at schema
 * validation before execution — the LLM only sees the allowed actions
 * in the schema.
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
  tool: T;
  allowed_actions: string[];
  id_suffix?: string;
  description_suffix?: string;
}): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base_schema = tool.inputSchema as z.ZodObject<any> | undefined;
  const action_field = base_schema?.shape?.action;

  if (!action_field) {
    // Tool doesn't have an action field — return as-is
    return tool;
  }

  const scoped = createTool({
    id: id_suffix ? `${tool.id}-${id_suffix}` : tool.id,
    description: description_suffix
      ? `${tool.description} ${description_suffix}`
      : `${tool.description} [Allowed actions: ${allowed_actions.join(', ')}]`,
    inputSchema: base_schema.extend({
      action: z.enum(allowed_actions as [string, ...string[]]),
    }),
    outputSchema: tool.outputSchema,
    execute: tool.execute,
  });

  return scoped as unknown as T;
}
