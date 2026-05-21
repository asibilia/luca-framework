import { z, type ToolDescriptor } from '../../schemas.ts'
import {
    checkRegression,
    diffPaths,
    type ReviewFinding,
} from '../review-analysis/index.ts'

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
    before: z
        .array(findingSchema)
        .describe('Findings snapshot taken BEFORE the fix iteration.'),
    after: z
        .array(findingSchema)
        .describe('Findings snapshot taken AFTER the fix iteration.'),
    touched_paths: z
        .array(z.string())
        .default([])
        .describe(
            'Repo-relative paths modified by fix commits in this iteration. If empty and from_sha/to_sha are given, computed via git diff.'
        ),
    from_sha: z
        .string()
        .optional()
        .describe('Iteration-start SHA (used to compute touched paths).'),
    to_sha: z
        .string()
        .optional()
        .describe('Iteration-end SHA (used to compute touched paths).'),
})

/**
 * Detect findings introduced by a fix iteration. Compares before/after
 * finding snapshots and flags anything new on a path the iteration
 * touched, or any same-finding severity escalation. Returns isError
 * when regressions are present so the orchestrator re-enters execute
 * mode before opening another iteration.
 *
 * Read-only — may shell out to git diff to compute touched paths.
 */
export const lucaPrReviewRegressionCheckTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_pr_review_regression_check',
    description:
        'Diff before/after review-finding snapshots to surface regressions introduced by a fix iteration (new findings on touched paths, severity escalations). Returns isError when regressions are found. Read-only.',
    inputSchema,
    async handler(args, ctx) {
        let touchedPaths = args.touched_paths
        if (touchedPaths.length === 0 && args.from_sha && args.to_sha) {
            touchedPaths = diffPaths(ctx.cwd, args.from_sha, args.to_sha)
        }

        const report = checkRegression({
            before: args.before as ReviewFinding[],
            after: args.after as ReviewFinding[],
            touchedPaths,
        })

        const summary = {
            counts: {
                before: args.before.length,
                after: args.after.length,
                touchedPaths: touchedPaths.length,
                regressions: report.regressions.length,
                resolved: report.resolved.length,
                unchanged: report.unchanged.length,
                newButUntouched: report.newButUntouched.length,
            },
            touchedPaths,
            report,
        }

        const hasRegressions = report.regressions.length > 0
        return {
            content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
            isError: hasRegressions,
        }
    },
}
