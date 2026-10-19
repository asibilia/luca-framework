import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import { TestRunSchema } from '../gates/gate-schemas'

/**
 * The journal entries of a ticket whose work is already on the base branch
 * (#484): the evidence check, the ticket counted done, and its closing.
 */

/**
 * The engine checked a test-writer's `already_done` evidence (#495) in the
 * ticket's worktree, at `base_sha`, the commit it started from: each named
 * commit is on the base, and each named test exists and passes there.
 * `problems` says what did not check out; `tests` is the run of the named
 * test files (`null` if none ran). A failed check is a failed try for the
 * test-writer.
 */
export const AlreadyDoneCheckedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('already_done_checked'),
    content: z.object({
        ok: z.boolean(),
        problems: z.array(z.string()),
        base_sha: z.string(),
        tests: TestRunSchema.nullable(),
    }),
})

/**
 * A ticket whose work is already on the base branch (#484): its
 * test-writer answered `already_done`, and `shas` are the commits that did
 * the work. The ticket counts as done, not stuck, and tickets that wait on
 * it go on. The engine said so on the spec issue, in its comment
 * `comment_id`. The run's PR closes it; with no PR, `ticket_closed` follows.
 */
export const TicketAlreadyDoneEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_already_done'),
    content: z.object({
        shas: z.array(z.string().min(1)),
        comment_id: z.number().int(),
    }),
})

/**
 * The engine closed an already-done ticket itself, as the run opens no PR
 * to close it, after its comment `comment_id` on the ticket said why.
 */
export const TicketClosedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_closed'),
    content: z.object({ comment_id: z.number().int() }),
})
