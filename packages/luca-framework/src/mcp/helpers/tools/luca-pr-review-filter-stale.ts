import {
    filterStaleComments,
    type PrReviewComment,
} from '../review-analysis/index.ts'
import { z, type ToolDescriptor } from '../../schemas.ts'

const commentSchema = z.object({
    id: z.number(),
    path: z.string(),
    line: z.number().nullable(),
    original_line: z.number().nullable(),
    commit_id: z.string(),
    original_commit_id: z.string(),
    diff_hunk: z.string(),
    body: z.string(),
    in_reply_to_id: z.number().nullable().optional(),
    user: z
        .object({
            login: z.string().optional(),
            type: z.string().optional(),
        })
        .optional(),
})

const inputSchema = z.object({
    comments: z
        .array(commentSchema)
        .describe(
            'PR review comments (gh api pulls/<n>/comments shape). Each is classified against the current working tree.',
        ),
    head_sha: z
        .string()
        .optional()
        .describe(
            'Override HEAD SHA used for stale detection. Defaults to current git HEAD.',
        ),
    max_drift_lines: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
            'Max line drift before a relocated anchor is treated as stale (default 5).',
        ),
})

/**
 * Classify PR review comments against the current working tree: drop
 * comments whose cited code has been rewritten since they were filed.
 * Used by gh-pr-address before categorization so the iteration loop
 * doesn't spend cycles on already-fixed issues.
 *
 * Pure read tool — inspects files + git history, writes nothing.
 */
export const lucaPrReviewFilterStaleTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_pr_review_filter_stale',
    description:
        'Partition PR review comments into actionable / stale / replies / unknown buckets by re-anchoring each comment against the current working tree. Drops comments whose cited code was rewritten. Read-only.',
    inputSchema,
    async handler(args, ctx) {
        const result = filterStaleComments(
            args.comments as PrReviewComment[],
            {
                repoRoot: ctx.cwd,
                headSha: args.head_sha,
                maxDriftLines: args.max_drift_lines,
            },
        )

        const summary = {
            counts: {
                input: args.comments.length,
                actionable: result.actionable.length,
                stale: result.stale.length,
                replies: result.replies.length,
                unknown: result.unknown.length,
            },
            actionable: result.actionable,
            stale: result.stale,
            replies: result.replies,
            unknown: result.unknown,
            verdicts: result.verdicts,
        }

        return {
            content: [
                { type: 'text', text: JSON.stringify(summary, null, 2) },
            ],
        }
    },
}
