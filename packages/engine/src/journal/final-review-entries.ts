import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'
import { StuckReasonSchema } from './stuck-entries'

import { LensNameSchema } from '../agents/role-results'

/**
 * The journal entries of the final review: its rounds, each lens's
 * reviewer, fix rounds, and how it ends (stuck, retried, passed, shipped).
 */

/**
 * A final review round started: the run branch is reviewed from `from_sha`
 * (round 1 and the fresh pass: where the run branch started; later rounds:
 * the previous round's `head_sha`) to `head_sha`, its HEAD now. `lenses` are
 * the lenses due this round (every lens in round 1 and the fresh pass, then
 * only those that had blocking findings), `files` the files that diff changes, and `rules` the rule files
 * of the engine config, read by the engine word for word (`text` is `null`
 * for a file it could not read), for the rules lens. Written with
 * `ticket: null`.
 */
export const FinalReviewStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_started'),
    content: z.object({
        round: z.number().int().min(1),
        from_sha: z.string().min(1),
        head_sha: z.string().min(1),
        lenses: z.array(LensNameSchema),
        files: z.array(z.string()).default([]),
        rules: z.array(
            z.object({ path: z.string(), text: z.string().nullable() })
        ),
        /**
         * Round 1 with a slow test command: its slow tests are due once its
         * lenses are in (#563). An older engine's record has none.
         */
        slow_due: z.boolean().optional(),
        /**
         * The fresh pass (#548): every lens reads the whole run branch again,
         * without earlier findings, after the last fix round. `false` for
         * any other round, and in older journals.
         */
        fresh: z.boolean().default(false),
    }),
})

/** A lens's reviewer is about to start, right before its `agent_started`. */
export const LensStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('lens_started'),
    content: z.object({
        lens: LensNameSchema,
        round: z.number().int().min(1),
    }),
})

/**
 * A lens's reviewer finished, right after its `agent_finished`: its findings
 * counted by severity. Not written for a failed turn.
 */
export const LensFinishedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('lens_finished'),
    content: z.object({
        lens: LensNameSchema,
        round: z.number().int().min(1),
        findings: z.object({
            blocker: z.number().int().min(0),
            should_fix: z.number().int().min(0),
            nit: z.number().int().min(0),
        }),
    }),
})

/** A final review fix round starts, before its first fixer. */
export const FinalReviewFixingEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_fixing'),
    content: z.object({ round: z.number().int().min(1) }),
})

/** The final review is stuck: the PR waits for a person's reply (#366). */
export const FinalReviewStuckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_stuck'),
    content: z.object({ reason: StuckReasonSchema, detail: z.string() }),
})

/**
 * The owner replied `retry` to the stuck final review: its open fix round
 * starts over as round 1 with fresh fixers and fresh counts, keeping any
 * edits the owner made in the run branch's worktree.
 */
export const FinalReviewRetriedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_retried'),
    content: z.object({}),
})

/** Every lens due in the latest round approved; the PR opens next. */
export const FinalReviewPassedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_passed'),
    content: z.object({}),
})

/**
 * The person replied `ship` to the stuck final review: the PR opens with the
 * findings still open listed at the top. Appended by the reply reader (#366)
 * through `shipFinalReview`. `commit` is the commit of the edits left
 * uncommitted in the run branch's worktree at ship time (#509), listed in
 * the PR as not reviewed; with none, it is left out.
 */
export const FinalReviewShippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_shipped'),
    content: z.object({
        commit: z
            .object({
                sha: z.string(),
                message: z.string(),
                files: z.array(z.string()),
            })
            .optional(),
    }),
})
