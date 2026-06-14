import {
    slugFromTitle,
    TodoAreaSchema,
    TodoIdSchema,
    TodoPriority,
    TodoSchema,
    todoConceptFor,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { buildMuninnInstruction } from '../helpers/build-muninn-instruction.ts'
import { resolveRepoVault } from '../helpers/resolve-repo-vault.ts'

const inputSchema = z.object({
    title: z
        .string()
        .min(1)
        .max(200)
        .describe(
            'Short imperative description of the todo. Used to derive the id when one is not supplied.'
        ),
    body: z
        .string()
        .max(8192)
        .optional()
        .describe(
            'Optional longer markdown body — context, acceptance criteria, references.'
        ),
    /**
     * Only pending and backlog are allowed at create time. Promoting
     * to `done` happens via luca_todo_update with a verificationRef
     * that points at a met criterion in verify.json.
     */
    status: z.enum(['pending', 'backlog']).default('pending'),
    priority: TodoPriority.optional().describe(
        'Optional triage priority: low | medium | high | critical.'
    ),
    area: TodoAreaSchema.optional().describe(
        'Optional kebab-case area/component tag (e.g. "cli", "mcp-server"); max 60 chars.'
    ),
    source: z
        .string()
        .max(120)
        .optional()
        .describe(
            'Where this todo originated — e.g. "gh-issue-#42", "phase-research", "manual".'
        ),
    metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
            'Arbitrary structured fields the caller wants to record alongside the todo.'
        ),
    id: TodoIdSchema.optional().describe(
        'Optional explicit id (kebab-case). When omitted, derived from the title.'
    ),
})

/**
 * Create a new todo. The luca server validates the shape and emits a
 * `muninn_remember` instruction for the agent to execute — todos live
 * in MuninnDB (delegation pattern; the luca MCP server cannot call
 * other MCP servers directly).
 *
 * Concept naming: `todo:<id>` in the repo vault. Status lives inside
 * the JSON-stringified content body so transitions don't require a
 * concept rename. The latest memory by concept wins on recall.
 */
export const lucaTodoAddTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_todo_add',
    description:
        'Create a new todo. Validates inputs server-side and returns a muninn_remember instruction for the agent to execute (delegation pattern — todos persist in MuninnDB under concept "todo:<id>"). Status defaults to pending; promotion to "done" goes through luca_todo_update.',
    inputSchema,
    async handler(args, ctx) {
        const vault = await resolveRepoVault({ cwd: ctx.cwd })

        let id: string
        try {
            id = args.id ?? slugFromTitle(args.title)
        } catch (err) {
            return {
                content: [{ type: 'text', text: (err as Error).message }],
                isError: true,
            }
        }

        const todo = TodoSchema.parse({
            schemaVersion: 1 as const,
            id,
            title: args.title,
            ...(args.body !== undefined ? { body: args.body } : {}),
            status: args.status,
            ...(args.priority !== undefined
                ? { priority: args.priority }
                : {}),
            ...(args.area !== undefined ? { area: args.area } : {}),
            ...(args.source !== undefined ? { source: args.source } : {}),
            ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
            updatedAt: new Date().toISOString(),
        })

        const instruction = buildMuninnInstruction({
            tool: 'mcp__muninn__muninn_remember',
            args: {
                vault,
                concept: todoConceptFor(id),
                content: JSON.stringify(todo),
            },
            description: `Persist todo "${id}" (status=${todo.status}) to MuninnDB.`,
        })

        return {
            content: [
                { type: 'text', text: JSON.stringify(instruction, null, 2) },
            ],
        }
    },
}
