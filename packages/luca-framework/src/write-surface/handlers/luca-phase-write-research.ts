import { join } from 'node:path'

import { phasePathFor, loadCurrentState } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { resolveActiveSlug } from '../helpers/resolve-active-slug.ts'
import { writeAtomicFile } from '../helpers/write-atomic.ts'

const inputSchema = z.object({
    content: z
        .string()
        .min(1)
        .describe(
            'Markdown content of phase research notes. Written verbatim to .luca/phases/<active-slug>/research.md.'
        ),
})

export const lucaPhaseWriteResearchTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_phase_write_research',
    description:
        'Write phase research notes to .luca/phases/<NN-slug>/research.md. Only callable when pipelineStep is "research".',
    inputSchema,
    allowedPhases: ['research'],
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const slug = resolveActiveSlug(state)
        if (!slug.ok) {
            return {
                content: [{ type: 'text', text: slug.error }],
                isError: true,
            }
        }

        const relPath = phasePathFor(slug.slug, 'research')
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
