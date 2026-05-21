import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { phasePathFor } from '@alecsibilia/luca-core'

import { loadCurrentState } from '../../../hook/helpers/load-current-state.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'
import { resolveActiveSlug } from '../resolve-active-slug.ts'

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
        const absPath = join(ctx.cwd, relPath)
        await mkdir(dirname(absPath), { recursive: true })
        const tmp = `${absPath}.tmp`
        await writeFile(tmp, args.content)
        await rename(tmp, absPath)

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
