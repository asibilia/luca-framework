import { existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { lucaRootPaths, lucaStateSchema } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../../schemas.ts'
import { writeAtomicFile } from '../write-atomic.ts'

const inputSchema = z.object({
    confirm: z
        .boolean()
        .default(false)
        .describe(
            'Must be true to actually perform the reset. Default false so accidental invocations are refused.',
        ),
})

/**
 * Reset the workflow to a clean idle state. Rewrites .luca/state.json to
 * the schema defaults and removes the pipeline lock if present. Callable
 * in any pipelineStep — destructive but recoverable (no source-tree
 * changes; only resets workflow bookkeeping).
 *
 * Requires confirm=true so a stray tool call cannot wipe the workflow
 * by accident. This is the only "destructive" tool in the registry; all
 * other writes are append-only or single-file replacements.
 */
export const lucaWorkflowResetTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_workflow_reset',
    description:
        'Reset .luca/state.json to schema defaults and remove the pipeline lock. Destructive: requires confirm=true. Use when the workflow is wedged or a session ended mid-step and needs a clean restart.',
    inputSchema,
    async handler(args, ctx) {
        if (!args.confirm) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'luca_workflow_reset refused: confirm=true required (destructive operation).',
                    },
                ],
                isError: true,
            }
        }

        const defaultState = lucaStateSchema.parse({})
        const statePath = join(ctx.cwd, lucaRootPaths.state)
        const lockPath = join(ctx.cwd, lucaRootPaths.lock)

        await writeAtomicFile(
            statePath,
            JSON.stringify(defaultState, null, 2) + '\n',
        )

        if (existsSync(lockPath)) {
            await unlink(lockPath)
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `reset ${lucaRootPaths.state} to defaults; pipeline lock cleared if present.`,
                },
            ],
        }
    },
}
