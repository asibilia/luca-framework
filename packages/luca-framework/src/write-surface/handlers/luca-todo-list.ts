import { TODO_CONCEPT_PREFIX, TodoStatus } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { buildMuninnInstruction } from '../helpers/build-muninn-instruction.ts'
import { resolveRepoVault } from '../helpers/resolve-repo-vault.ts'

const inputSchema = z.object({
    status: TodoStatus.optional().describe(
        'Optional status filter. Applied post-recall by the agent (muninn cannot filter on content metadata).'
    ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe('Max todos to recall (range 1–200, default 50).'),
})

/**
 * List todos. Returns a muninn_recall instruction with context phrase
 * `["todo:"]`, scoped to the repo vault. When a status filter is
 * supplied, the instruction text tells the agent to filter the recalled
 * entries client-side (muninn recall doesn't expose metadata filters,
 * but every todo's status lives in its JSON content body).
 */
export const lucaTodoListTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_todo_list',
    description:
        'List todos from MuninnDB. Returns a muninn_recall instruction with context ["todo:"] in the repo vault. Optional status filter is applied by the agent post-recall (recall returns the todo\'s JSON content; the agent filters by content.status).',
    inputSchema,
    async handler(args, ctx) {
        const vault = await resolveRepoVault({ cwd: ctx.cwd })

        const description = args.status
            ? `Recall up to ${args.limit} todos. Parse each result's content JSON and keep only those where content.status === "${args.status}".`
            : `Recall up to ${args.limit} todos. Each result's content is JSON conforming to TodoSchema.`

        const instruction = buildMuninnInstruction({
            tool: 'mcp__muninn__muninn_recall',
            args: {
                vault,
                context: [TODO_CONCEPT_PREFIX],
                mode: 'balanced',
                limit: args.limit,
            },
            description,
        })

        return {
            content: [
                { type: 'text', text: JSON.stringify(instruction, null, 2) },
            ],
        }
    },
}
