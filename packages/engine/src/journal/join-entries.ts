import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import { BadTestSchema } from '../agents/role-results'

/**
 * The journal entries of joining tickets onto the run branch: the join, a
 * rebase after a clash or failed gates, tests sent back, an undone join,
 * and the push.
 */

/** An approved ticket's commits, replayed onto the run branch (or not). */
export const TicketJoinedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_joined'),
    content: z.discriminatedUnion('ok', [
        z.object({
            ok: z.literal(true),
            /** The new commits on the run branch, oldest first. */
            shas: z.array(z.string().min(1)),
            /**
             * The ticket's size: lines added plus lines removed by its
             * commits, binary files counting 0. `null` in older journals.
             */
            lines_changed: z.number().int().min(0).nullable().default(null),
        }),
        z.object({ ok: z.literal(false), error: z.string() }),
    ]),
})

/**
 * A ticket's join is about to replay its commits onto the run branch, which
 * stands at `run_branch_sha`. A join a crash cut off (no `ticket_joined`
 * after this) is redone from there: the run branch is reset to it first.
 */
export const JoinStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('join_started'),
    content: z.object({ run_branch_sha: z.string().min(1) }),
})

/**
 * Why a joined ticket went back to be fixed on top of the run branch: its
 * commits clashed with it, or the gates failed after it joined.
 */
export const RejoinCauseSchema = z.enum(['clash', 'join_gates'])

export type RejoinCause = z.infer<typeof RejoinCauseSchema>

/**
 * The engine put a ticket's whole change back on top of the run branch, as
 * uncommitted changes in its worktree, after a clash or failed gates after
 * joining. `base_sha` is the run branch commit it now starts from. `tests`
 * and `code` are the files that clashed (conflict markers left in them),
 * split by the config's test file patterns. `undone` are the run branch
 * commits the engine undid first (a join whose gates failed), and
 * `reinstall` says whether the worktree needs its install again. As with
 * `join_undone`, replay clears the join of any other ticket whose joined
 * commits are among `undone` (#519).
 */
export const TicketRebasedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_rebased'),
    content: z.object({
        cause: RejoinCauseSchema,
        base_sha: z.string().min(1),
        tests: z.array(z.string()),
        code: z.array(z.string()),
        undone: z.array(z.string()),
        /**
         * The dependency files (manifests, lockfiles) differ between the
         * worktree's old base and the new one, and the ticket's own change
         * touches no manifest: the worktree gets its frozen install again.
         * (A ticket that changes a manifest gets the install in its gates.)
         */
        reinstall: z.boolean().default(false),
    }),
})

/**
 * After a rebase, the implementer sent one of the ticket's tests back as bad
 * (#489): the tickets that joined the run branch since the ticket's old base
 * made it wrong. The engine sends it to the ticket's test-writer to update,
 * with the implementer's code kept in the worktree. `round` counts these per
 * ticket, from 1. `joined` are the tickets whose commits the run branch got
 * between `from_sha` (the ticket's base before the rebase) and `base_sha`
 * (its base now), and `files` the files the run branch changed between them.
 */
export const TestsSentBackEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('tests_sent_back'),
    content: z.object({
        round: z.number().int().positive(),
        bad_test: BadTestSchema,
        from_sha: z.string().min(1),
        base_sha: z.string().min(1),
        joined: z.array(
            z.object({
                ticket: z.number().int().positive(),
                title: z.string(),
            })
        ),
        files: z.array(z.string()),
    }),
})

/**
 * A stuck ticket's join was undone on the run branch (its commits were
 * never pushed), so no other ticket builds on them. `shas` are every commit
 * the undo took off the run branch, oldest first: the ticket's own join and
 * any later, unpushed joins on top of it (#519). Replay clears the join of
 * every ticket whose joined commits are among them, not only this one's, so
 * those tickets join again on the run branch as it is now.
 */
export const JoinUndoneEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('join_undone'),
    content: z.object({ shas: z.array(z.string()) }),
})

export const RunBranchPushedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_branch_pushed'),
    content: z.object({ branch: z.string(), sha: z.string() }),
})
