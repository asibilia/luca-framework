import { join } from 'node:path'

import {
    phasePathFor,
    loadCurrentState,
    resolveActiveSlug,
} from '@alecsibilia/luca-core'
import { VerificationResultSchema } from '@alecsibilia/luca-core/verification'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { writeAtomicFile } from '../helpers/write-atomic.ts'

/**
 * Replace ASCII control characters with their `\xNN` escapes so echoed
 * payload fragments cannot inject terminal escape sequences into tool
 * output. Mirrors the convention in `luca-plan-lint.ts`.
 *
 * @param text - Raw text destined for an output line.
 * @returns The text with each control character replaced by its escape.
 */
function sanitizeControlChars(text: string): string {
    return text.replace(
        /[\x00-\x1f\x7f]/g,
        (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`
    )
}

const inputSchema = z.object({
    result: z
        .unknown()
        .describe(
            'Structured verification result validated against VerificationResultSchema: criteria[] (criterionId, met, evidence, optional deferred/deferredFollowUp/probeType), checks[] (name, status, errorCount, warningCount), status (PASS|FAIL|STALLED), recommendation (proceed|fix|escalate), plus timestamp, wave, mode, convergence, errorFingerprints, and optional deliverables[] compliance (shipped|missed|partial). Written to .luca/phases/<active-slug>/verify.json.'
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
        const parsed = VerificationResultSchema.safeParse(args.result)
        if (!parsed.success) {
            const issues = parsed.error.issues
                .map(
                    (issue) =>
                        `  - ${sanitizeControlChars(
                            issue.path.join('.') || '(root)'
                        )}: ${sanitizeControlChars(issue.message)}`
                )
                .join('\n')
            return {
                content: [
                    {
                        type: 'text',
                        text: `luca_phase_write_verify: result does not match VerificationResultSchema — fix the issues below and retry:\n${issues}`,
                    },
                ],
                isError: true,
            }
        }
        const relPath = phasePathFor(slug.slug, 'verify')
        const content = JSON.stringify(parsed.data, null, 2) + '\n'
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
