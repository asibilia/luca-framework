import {
    loadCurrentState,
    phasePathFor,
    resolveActiveSlug,
} from '@alecsibilia/luca-core'
import {
    VerificationResultSchema,
    writeVerificationResult,
} from '@alecsibilia/luca-core/verification'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { sanitizeControlChars } from '../helpers/sanitize-control-chars.ts'

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
        // Route through the core writer so the atomic tmp+rename and runId
        // stamping live in one place. runId comes from the loaded run's
        // sessionId when present; omitted otherwise (the writer prefers an
        // existing result.runId and tolerates legacy no-runId results).
        const runId =
            typeof state.sessionId === 'string' && state.sessionId.length > 0
                ? state.sessionId
                : undefined
        writeVerificationResult({
            cwd: ctx.cwd,
            slug: slug.slug,
            result: parsed.data,
            runId,
        })
        const relPath = phasePathFor(slug.slug, 'verify')
        return {
            content: [
                {
                    type: 'text',
                    text: `wrote ${relPath}`,
                },
            ],
        }
    },
}
