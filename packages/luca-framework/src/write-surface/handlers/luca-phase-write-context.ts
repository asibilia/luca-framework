import { join } from 'node:path'

import {
    phasePathFor,
    loadCurrentState,
    resolveActiveSlug,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { writeAtomicFile } from '../helpers/write-atomic.ts'

const inputSchema = z.object({
    content: z
        .string()
        .min(1)
        .describe(
            'Markdown content capturing user decisions from /phase-discuss. Written verbatim to .luca/phases/<active-slug>/context.md.'
        ),
})

export const lucaPhaseWriteContextTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_phase_write_context',
    description:
        'Write phase context (user decisions from discussion) to .luca/phases/<NN-slug>/context.md. Only callable when pipelineStep is "discuss".',
    inputSchema,
    allowedPhases: ['discuss'],
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const slug = resolveActiveSlug(state)
        if (!slug.ok) {
            return {
                content: [{ type: 'text', text: slug.error }],
                isError: true,
            }
        }

        const relPath = phasePathFor(slug.slug, 'context')
        await writeAtomicFile(join(ctx.cwd, relPath), args.content)

        return {
            content: [
                {
                    type: 'text',
                    text: `wrote ${relPath} (${args.content.length} bytes)`,
                },
            ],
        }
    },
}
