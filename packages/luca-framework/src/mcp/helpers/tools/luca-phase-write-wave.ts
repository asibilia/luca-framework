import { join } from 'node:path'

import { wavePathFor } from '@alecsibilia/luca-core'

import { loadCurrentState } from '../../../hook/helpers/load-current-state.ts'
import { resolveActiveSlug } from '../resolve-active-slug.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'
import { writeAtomicFile } from '../write-atomic.ts'

const inputSchema = z.object({
    waveNumber: z
        .number()
        .int()
        .min(0)
        .max(99)
        .describe(
            'Wave number (0–99). Zero-padded to two digits in the filename (e.g. wave 3 → 03.md).',
        ),
    content: z
        .string()
        .min(1)
        .describe(
            'Markdown content for this wave. Written to .luca/phases/<active-slug>/execute/waves/NN.md.',
        ),
})

export const lucaPhaseWriteWaveTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_phase_write_wave',
    description:
        'Write a wave detail file to .luca/phases/<NN-slug>/execute/waves/<waveNumber>.md. Only callable when pipelineStep is "execute".',
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
        const relPath = wavePathFor(slug.slug, args.waveNumber)
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
