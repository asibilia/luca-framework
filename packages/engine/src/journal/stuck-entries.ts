import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

/**
 * The journal entries of stuck work and the spec owner's replies: stuck
 * tickets and runs, the report, comments read, replies taken or ignored,
 * and tickets retried or skipped.
 */

/**
 * Why a ticket (or the final review) is stuck. A failed red check or gate is only stuck once its
 * fix loop reaches its cap, and a bad test only on its second bounce.
 * `undo_refused`: undoing its join would have rewound the run branch over
 * other work, so the engine left the run branch alone (#519).
 * `environment_failed`: a writer said a failure was not its ticket's fault,
 * and the rerun failed the same way, or its reruns ran out (#613).
 */
export const StuckReasonSchema = z.enum([
    'agent_failed',
    'red_check_failed',
    'nothing_new_to_test',
    'leftovers_found',
    'gates_failed',
    'bad_test',
    'changes_requested',
    'join_failed',
    'join_gates_failed',
    'install_failed',
    'prepare_failed',
    'setup_change_needed',
    'crashed',
    'undo_refused',
    'environment_failed',
])

export type StuckReason = z.infer<typeof StuckReasonSchema>

export const TicketStuckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_stuck'),
    content: z.object({ reason: StuckReasonSchema, detail: z.string() }),
})

/**
 * Why the whole run is stuck: it used up its run budget of tokens, its
 * pull request didn't open (`gh pr create` failed, #508), or its repo wait
 * lasted 24 hours (`repo_busy`, #615).
 */
export const RunStuckReasonSchema = z.enum([
    'run_budget',
    'pull_request_failed',
    'repo_busy',
])

export type RunStuckReason = z.infer<typeof RunStuckReasonSchema>

/**
 * The whole run is stuck (`ticket: null`): nothing new starts until the
 * spec owner replies `retry` (one more full run budget, another try at
 * the PR, or another repo wait) or `stop`.
 */
export const RunStuckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_stuck'),
    content: z.object({ reason: RunStuckReasonSchema, detail: z.string() }),
})

/**
 * The engine told the spec issue that a ticket (or, with `ticket: null`,
 * the stuck run, else the final review) is stuck, in its comment
 * `comment_id`, and now waits for the spec owner's reply.
 */
export const StuckReportedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('stuck_reported'),
    content: z.object({
        comment_id: z.number().int(),
        body: z.string(),
    }),
})

/**
 * A comment the engine read on the spec issue while it waited for a reply,
 * word for word, whoever wrote it. Only the spec owner's count as replies.
 */
export const CommentReadEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('comment_read'),
    content: z.object({
        comment_id: z.number().int(),
        author: z.string(),
        body: z.string(),
    }),
})

/**
 * The one-word replies the spec owner can give to stuck work: `retry`,
 * `skip`, and `stop` for a ticket; `retry`, `stop`, and `ship` for the
 * final review.
 */
export const ReplyWordSchema = z.enum(['retry', 'skip', 'stop', 'ship'])

export type ReplyWord = z.infer<typeof ReplyWordSchema>

/**
 * The engine took the spec owner's reply: `retry` or `skip` for `ticket`,
 * `stop` for the whole run, `retry` for the run stuck on its budget, or
 * `retry` or `ship` for the stuck final review (`ticket` is `null` for
 * these).
 */
export const ReplyReceivedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('reply_received'),
    content: z.object({
        word: ReplyWordSchema,
        ticket: z.number().int().positive().nullable(),
        comment_id: z.number().int(),
        author: z.string(),
    }),
})

/**
 * Why the spec owner's reply could not be used: it named no ticket while
 * more than one is stuck, named a ticket that isn't stuck, or was `ship`
 * (the final review's word) while no final review is stuck, or was `skip`
 * for the final review, which can't be skipped.
 */
export const ReplyProblemSchema = z.enum([
    'no_ticket_named',
    'not_stuck',
    'nothing_stuck',
    'ship_needs_final_review',
    'skip_not_for_final_review',
])

export type ReplyProblem = z.infer<typeof ReplyProblemSchema>

/**
 * The spec owner's reply could not be used; the engine said why on the spec
 * issue, in its comment `answer_id`.
 */
export const ReplyIgnoredEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('reply_ignored'),
    content: z.object({
        comment_id: z.number().int(),
        reason: ReplyProblemSchema,
        answer_id: z.number().int().nullable(),
    }),
})

/**
 * How a `retry` went:
 * - `resume`: the ticket's text and labels are unchanged, so it picks up
 *   where it stopped, with a fresh agent and fresh counts, keeping any
 *   code the user changed in its worktree.
 * - `restart`: the ticket's text or labels changed, so its new copy (a
 *   `ticket_snapshot` just before) is built from scratch, in its worktree
 *   reset to the run branch's tip `base_sha`.
 * - `refused`: the changed ticket is not ready to build (`problems`); the
 *   engine said so on the spec issue (`answer_id`), and it stays stuck.
 */
export const TicketRetriedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_retried'),
    content: z.object({
        mode: z.enum(['resume', 'restart', 'refused']),
        base_sha: z.string().nullable(),
        problems: z.array(z.string()),
        answer_id: z.number().int().nullable(),
    }),
})

/**
 * A ticket left out of the run: the stuck ticket the owner skipped
 * (`because` is `null`), or one that waits on a skipped ticket. It stays
 * open, with a comment saying why.
 */
export const TicketSkippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_skipped'),
    content: z.object({
        because: z.number().int().positive().nullable(),
    }),
})
