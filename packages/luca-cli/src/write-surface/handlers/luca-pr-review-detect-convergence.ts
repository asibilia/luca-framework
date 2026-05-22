import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import {
    detectConvergence,
    type ReviewFinding,
} from '@alecsibilia/luca-core/review-analysis'

const findingSchema = z.object({
    id: z.string(),
    perspective: z.string(),
    path: z.string().optional(),
    line: z.number().optional(),
    severity: z.string(),
    category: z.string().optional(),
    summary: z.string(),
})

const inputSchema = z.object({
    findings: z
        .array(findingSchema)
        .describe(
            'Combined review findings across every perspective (PR comments, claim-verifier, reviewer subagents, CI annotations).'
        ),
    line_tolerance: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
            'Lines within +/- this distance count as the same location (default 2).'
        ),
})

/**
 * Detect cross-perspective convergence: when 2+ independent reviewer
 * perspectives flag the same location, auto-promote weaker findings in
 * that cluster to must-fix. Catches the case where Copilot + a reviewer
 * + claim-verifier each flag the same line as "should-fix" but together
 * it should block approval.
 *
 * Pure read tool — no I/O, no mutation of input findings.
 */
export const lucaPrReviewDetectConvergenceTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_pr_review_detect_convergence',
    description:
        'Group review findings by location and auto-promote severity to must-fix when 2+ distinct perspectives flag the same line. Returns the convergence report plus promoted findings. Read-only.',
    inputSchema,
    async handler(args, _ctx) {
        const report = detectConvergence(args.findings as ReviewFinding[], {
            lineTolerance: args.line_tolerance,
        })

        const summary = {
            counts: {
                input: args.findings.length,
                groups: report.groups.length,
                convergentGroups: report.convergentGroups.length,
                promotions: report.promotions.length,
            },
            report,
        }

        return {
            content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        }
    },
}
