import { join } from 'node:path'

import { phasePathFor } from '@alecsibilia/luca-core'

import { loadCurrentState } from '../../../hook/helpers/load-current-state.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'
import { resolveActiveSlug } from '../resolve-active-slug.ts'
import { writeAtomicFile } from '../write-atomic.ts'

const inputSchema = z.object({
    content: z
        .string()
        .min(1)
        .describe(
            'Markdown plan-review output (APPROVED | NEEDS_REVISION | ESCALATE + findings). Written to .luca/phases/<active-slug>/plan-review.md.'
        ),
})

export const lucaPhaseWritePlanReviewTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_phase_write_plan_review',
    description:
        'Write the plan-reviewer output to .luca/phases/<NN-slug>/plan-review.md. Only callable when pipelineStep is "plan-review".',
    inputSchema,
    allowedPhases: ['plan-review'],
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const slug = resolveActiveSlug(state)
        if (!slug.ok) {
            return {
                content: [{ type: 'text', text: slug.error }],
                isError: true,
            }
        }
        const relPath = phasePathFor(slug.slug, 'plan-review')
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
