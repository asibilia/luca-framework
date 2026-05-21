import { join } from 'node:path'

import { phasePathFor, loadCurrentState } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { resolveActiveSlug } from '../helpers/resolve-active-slug.ts'
import { writeAtomicFile } from '../helpers/write-atomic.ts'

const inputSchema = z.object({
    result: z
        .record(z.string(), z.unknown())
        .describe(
            'Structured verification result. Common fields: status (pass|fail), typecheck (bool), tests ({passed, failed}), lint (...). Written verbatim to .luca/phases/<active-slug>/verify.json.'
        ),
})

export const lucaPhaseWriteVerifyTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_phase_write_verify',
    description:
        'Write the verifier output to .luca/phases/<NN-slug>/verify.json (structured JSON). Only callable when pipelineStep is "verify".',
    inputSchema,
    allowedPhases: ['verify'],
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const slug = resolveActiveSlug(state)
        if (!slug.ok) {
            return {
                content: [{ type: 'text', text: slug.error }],
                isError: true,
            }
        }
        const relPath = phasePathFor(slug.slug, 'verify')
        const content = JSON.stringify(args.result, null, 2) + '\n'
        await writeAtomicFile(join(ctx.cwd, relPath), content)
        return {
            content: [
                {
                    type: 'text',
                    text: `wrote ${relPath} (${content.length} bytes)`,
                },
            ],
        }
    },
}
