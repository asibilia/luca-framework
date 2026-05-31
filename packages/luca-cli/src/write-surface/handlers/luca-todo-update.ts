import {
    TodoIdSchema,
    TodoSchema,
    TodoStatus,
    todoConceptFor,
    VerificationRefSchema,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { buildMuninnInstruction } from '../helpers/build-muninn-instruction.ts'
import { resolveRepoVault } from '../helpers/resolve-repo-vault.ts'
import { validateVerificationRef } from '../helpers/validate-verification-ref.ts'

const inputSchema = z.object({
    id: TodoIdSchema.describe(
        'Existing todo id (kebab-case). Used as the muninn concept suffix: todo:<id>.'
    ),
    title: z
        .string()
        .min(1)
        .max(200)
        .describe(
            'Full title of the todo. Pass the existing title unchanged unless renaming.'
        ),
    body: z.string().max(8192).optional(),
    status: TodoStatus.describe(
        'New status. Promoting to "done" requires verificationRef pointing at a met PASS criterion in the active phase\'s verify.json.'
    ),
    source: z.string().max(120).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    verificationRef: VerificationRefSchema.optional().describe(
        'Required when status === "done". Points at a criterionId in the active phase\'s verify.json that is met=true with non-empty evidence and parent status=PASS.'
    ),
})

/**
 * Update a todo. Validates the new shape, enforces the verification-ref
 * guard when transitioning to `done`, and returns a `muninn_remember`
 * instruction the agent should execute. The new memory is stored under
 * the same concept (`todo:<id>`) so recall returns the latest state.
 *
 * The verification-ref guard reads the active phase's verify.json
 * server-side and refuses to emit the instruction unless the criterion
 * is met, has evidence, and the overall verification status is PASS.
 * This preserves the safety property from the legacy manageTodos tool:
 * an agent cannot mark work "done" without machine-checkable evidence.
 */
export const lucaTodoUpdateTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_todo_update',
    description:
        'Update a todo\'s state. Returns a muninn_remember instruction the agent executes (delegation pattern). Server-side verification-ref guard: transitioning to status="done" requires a verificationRef pointing at a met PASS criterion in the active phase\'s verify.json.',
    inputSchema,
    async handler(args, ctx) {
        if (args.status === 'done') {
            if (!args.verificationRef) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'luca_todo_update: verificationRef is required when status === "done". Provide { criterionId } pointing at a met PASS criterion in the active phase\'s verify.json.',
                        },
                    ],
                    isError: true,
                }
            }
            const err = await validateVerificationRef({
                cwd: ctx.cwd,
                ref: args.verificationRef,
            })
            if (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `luca_todo_update: ${err.code} — ${err.message}`,
                        },
                    ],
                    isError: true,
                }
            }
        }

        const todo = TodoSchema.parse({
            schemaVersion: 1 as const,
            id: args.id,
            title: args.title,
            ...(args.body !== undefined ? { body: args.body } : {}),
            status: args.status,
            ...(args.source !== undefined ? { source: args.source } : {}),
            ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
            updatedAt: new Date().toISOString(),
            ...(args.verificationRef !== undefined
                ? { verificationRef: args.verificationRef }
                : {}),
        })

        const vault = await resolveRepoVault({ cwd: ctx.cwd })
        const instruction = buildMuninnInstruction({
            tool: 'mcp__muninn__muninn_remember',
            args: {
                vault,
                concept: todoConceptFor(args.id),
                content: JSON.stringify(todo),
            },
            description: `Update todo "${args.id}" (status=${todo.status}).`,
        })

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(instruction, null, 2),
                },
            ],
        }
    },
}
