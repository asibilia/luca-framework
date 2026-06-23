import { TodoAreaSchema, TodoPriority, TodoStatus } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { buildMuninnProcedure } from '../helpers/build-muninn-instruction.ts'
import { resolveBacklogRoot } from '../helpers/resolve-backlog-root.ts'

const inputSchema = z.object({
    status: TodoStatus.optional().describe(
        'Optional status filter. Applied post-recall by the agent (muninn cannot filter on content metadata).'
    ),
    priority: TodoPriority.optional().describe(
        'Optional priority filter (low | medium | high | critical). Applied post-recall by the agent.'
    ),
    area: TodoAreaSchema.optional().describe(
        'Optional kebab-case area/component filter (e.g. "cli"). Applied post-recall by the agent.'
    ),
    limit: z
        .number()
        .int()
        .min(0)
        .max(200)
        .default(0)
        .describe(
            'Max todo children to return per tree level. 0 (the default) ' +
                'means NO cap — complete enumeration. Set a positive value ' +
                'only to deliberately truncate a very large backlog.'
        ),
})

/**
 * List todos with **complete, deterministic enumeration**.
 *
 * The backlog is a MuninnDB tree (see {@link TODO_BACKLOG_ROOT_CONCEPT}).
 * Listing resolves the backlog root by its CACHED ULID
 * (`.luca/config.json#muninn.todoBacklog`, never by concept — MuninnDB has
 * no concept lookup), then walks the subtree with `muninn_recall_tree`.
 * That walk follows `is_part_of` edges structurally, so it returns EVERY
 * todo regardless of vault size, recency, or embedding similarity — unlike
 * the previous `muninn_recall` approach, which ranked by semantic distance
 * to the literal `"todo:"` and silently dropped the long tail. When no root
 * is cached for the vault the backlog is uninitialized and a plain notice is
 * returned instead of a doomed query.
 *
 * `recall_tree` returns node structure (id/concept/state) but NOT content,
 * so the agent `muninn_read`s each non-deleted child to get the Todo JSON.
 * Optional status/priority/area filters are then applied post-read: filtering
 * keys off `content.id` / `content.status`, and soft-deleted children
 * (state "deleted"/"soft_deleted") are skipped.
 */
export const lucaTodoListTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_todo_list',
    description:
        'List todos from MuninnDB with COMPLETE enumeration. Resolves the backlog root by its cached ULID (never by concept), then muninn_recall_tree walks every is_part_of child; the agent muninn_reads each non-deleted child for its content. This returns all todos regardless of vault size (the old semantic muninn_recall dropped the tail). Optional status/priority/area filters are applied post-read against each todo\'s JSON content. Uninitialized backlog → a plain notice, not a query.',
    inputSchema,
    async handler(args, ctx) {
        const { vault, rootId } = await resolveBacklogRoot({ cwd: ctx.cwd })

        // No root cached for this vault → the backlog is empty/uninitialized.
        // Don't emit a doomed query; tell the caller plainly.
        if (!rootId) {
            return {
                content: [
                    {
                        type: 'text',
                        text:
                            `No todos in the backlog for vault "${vault}" yet ` +
                            '(backlog not initialized). Create one with ' +
                            '`luca todo add`, or pull in legacy flat todos with ' +
                            '`luca todo migrate`.',
                    },
                ],
            }
        }

        const filters: string[] = []
        if (args.status) {
            filters.push(`content.status === "${args.status}"`)
        }
        if (args.priority) {
            filters.push(`content.priority === "${args.priority}"`)
        }
        if (args.area) {
            // JSON.stringify quotes the value so it cannot break out of
            // the literal in the emitted instruction text (defense-in-
            // depth on top of the TodoAreaSchema kebab charset).
            filters.push(`content.area === ${JSON.stringify(args.area)}`)
        }

        const filterText =
            filters.length > 0
                ? `Keep only todos where ${filters.join(' && ')}. `
                : ''

        const procedure = buildMuninnProcedure({
            steps: [
                {
                    tool: 'mcp__muninn__muninn_recall_tree',
                    args: {
                        vault,
                        root_id: rootId,
                        include_completed: true,
                        max_depth: 1,
                        limit: args.limit,
                    },
                    description:
                        'Enumerate ALL todo children of the backlog root ' +
                        'deterministically (structural is_part_of walk — not ' +
                        'semantic recall, so nothing is missed regardless of ' +
                        'vault size). The root_id is already filled in.',
                },
            ],
            instructionForAgent:
                'List todos from the MuninnDB backlog (delegation pattern, ' +
                'COMPLETE enumeration). Step 1 returns the backlog root and its ' +
                'child nodes (id, concept, state) but NOT their content. For ' +
                'each child whose state is NOT "deleted"/"soft_deleted", call ' +
                'mcp__muninn__muninn_read with its id to fetch the content; ' +
                'parse that JSON as a Todo and key off content.id (its concept ' +
                'is "todo:<id>"). Skip the root container node and any node ' +
                `whose content does not parse as a valid Todo. ${filterText}` +
                "Parse the step's args via JSON.parse(argsJson).",
        })

        return {
            content: [
                { type: 'text', text: JSON.stringify(procedure, null, 2) },
            ],
        }
    },
}
