import { join } from 'node:path'

import { auditPathFor, loadCurrentState } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { resolveActiveSlug } from '../helpers/resolve-active-slug.ts'
import { writeAtomicFile } from '../helpers/write-atomic.ts'

const inputSchema = z.object({
    reviewer: z
        .string()
        .regex(/^[a-z][a-z0-9-]*[a-z0-9]?$/, {
            message:
                'reviewer must be kebab-case (e.g. "code-review", "security")',
        })
        .describe(
            'Reviewer name (kebab-case). Examples: "code-review", "security", "architect", "ux".'
        ),
    content: z
        .string()
        .min(1)
        .describe(
            'Markdown audit content. Written to .luca/phases/<active-slug>/audits/<reviewer>.md.'
        ),
})

export const lucaPhaseWriteAuditTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_phase_write_audit',
    description:
        'Write a reviewer audit to .luca/phases/<NN-slug>/audits/<reviewer>.md. Only callable when pipelineStep is "review". Reviewers MUST use this tool — direct Edit/Write on audit files is blocked by the stage-gate hook anyway.',
    inputSchema,
    allowedPhases: ['review'],
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const slug = resolveActiveSlug(state)
        if (!slug.ok) {
            return {
                content: [{ type: 'text', text: slug.error }],
                isError: true,
            }
        }

        const relPath = auditPathFor(slug.slug, args.reviewer)
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
