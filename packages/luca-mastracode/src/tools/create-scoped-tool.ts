import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Create a scoped variant of an action-based tool that only permits
 * the specified actions. Disallowed actions are rejected at schema
 * validation before execution — the LLM only sees the allowed actions
 * in the schema.
 *
 * Supports both flat `z.object({ action: z.enum(...) })` schemas and
 * `z.discriminatedUnion('action', [...])` schemas. For flat schemas,
 * the action enum is narrowed. For discriminated unions, only the
 * variants whose `action` literal matches `allowed_actions` are kept.
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
  const base_schema = tool.inputSchema;

  if (!base_schema) {
    return tool;
  }

  // Determine the scoped inputSchema based on the schema type.
  let scoped_schema: z.ZodTypeAny;

  if (base_schema instanceof z.ZodDiscriminatedUnion) {
    // Filter the union's options to only include allowed action variants.
    const allowed_set = new Set(allowed_actions);
    const filtered_options = base_schema.options.filter(
      (option) => {
        // Each option in a discriminated union is a ZodObject with a shape
        if (option instanceof z.ZodObject && 'shape' in option) {
          const action_field = (option as z.ZodObject<z.ZodRawShape>).shape.action;
          if (action_field instanceof z.ZodLiteral) {
            return allowed_set.has(action_field.value as string);
          }
        }
        return false;
      },
    );

    if (filtered_options.length === 0) {
      return tool;
    }

    scoped_schema = z.discriminatedUnion(
      'action',
      filtered_options as unknown as [z.ZodObject<z.ZodRawShape>, ...z.ZodObject<z.ZodRawShape>[]],
    );
  } else if (base_schema instanceof z.ZodObject) {
    const action_field = base_schema.shape?.action;
    if (!action_field) {
      return tool;
    }
    scoped_schema = base_schema.extend({
      action: z.enum(allowed_actions as [string, ...string[]]),
    });
  } else {
    // Unknown schema type — return as-is
    return tool;
  }

  const scoped = createTool({
    id: id_suffix ? `${tool.id}-${id_suffix}` : tool.id,
    description: description_suffix
      ? `${tool.description} ${description_suffix}`
      : `${tool.description} [Allowed actions: ${allowed_actions.join(', ')}]`,
    inputSchema: scoped_schema,
    outputSchema: tool.outputSchema,
    execute: tool.execute,
  });

  // createTool() returns a new Tool whose generic type params differ from the
  // original tool's (the inputSchema was narrowed). TypeScript can't prove the
  // structural equivalence, so we need the double cast through unknown.
  return scoped as unknown as T;
}
