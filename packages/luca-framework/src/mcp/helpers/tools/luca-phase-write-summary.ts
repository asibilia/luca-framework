import { join } from 'node:path'

import { phasePathFor } from '@alecsibilia/luca-core'

import { loadCurrentState } from '../../../hook/helpers/load-current-state.ts'
import { resolveActiveSlug } from '../resolve-active-slug.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'
import { writeAtomicFile } from '../write-atomic.ts'

const inputSchema = z.object({
    content: z
        .string()
        .min(1)
        .describe(
            'Markdown summary of the executed phase work. Written to .luca/phases/<active-slug>/execute/summary.md.',
        ),
})

export const lucaPhaseWriteSummaryTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_phase_write_summary',
    description:
        'Write the execute-step summary to .luca/phases/<NN-slug>/execute/summary.md. Only callable when pipelineStep is "execute".',
    inputSchema,
    allowedPhases: ['execute'],
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const slug = resolveActiveSlug(state)
        if (!slug.ok) {
            return {
                content: [{ type: 'text', text: slug.error }],
                isError: true,
            }
        }
        const relPath = phasePathFor(slug.slug, 'execute/summary')
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
