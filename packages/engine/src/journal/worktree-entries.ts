import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import { BadTestSchema } from '../agents/role-results'
import { GateCheckSchema, TestRunSchema } from '../gates/gate-schemas'

/**
 * The journal entries of the run's worktrees: made, prepared, their
 * baseline tests, reset, and removed.
 */

/** A git worktree the engine made: where, on which branch, from which commit. */
const WorktreeSchema = z.object({
    branch: z.string().min(1),
    path: z.string().min(1),
    base_sha: z.string().min(1),
})

/**
 * The run branch's worktree. `changesets` is true when the repo had
 * `.changeset/config.json` there, so the engine writes a changeset before
 * the PR (#461).
 */
export const RunBranchCreatedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_branch_created'),
    content: WorktreeSchema.extend({
        changesets: z.boolean().default(false),
    }),
})

export const TicketWorktreeCreatedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_worktree_created'),
    content: WorktreeSchema,
})

/**
 * The config's prepare command (#481), run in a new ticket worktree before
 * its baseline tests. Journaled only with a prepare command. A failed one
 * leaves the baseline tests unrun.
 */
export const BaselinePreparedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('baseline_prepared'),
    content: z.object({ check: GateCheckSchema }),
})

/**
 * New untracked paths a run of the config's prepare command made in a
 * checkout (#486): there after it ran, not before, such as a symlinked
 * tools folder or a build file the repo's `.gitignore` misses. They are not
 * an agent's work, so the engine never commits them or judges them by role
 * rules, in any checkout of the run. Journaled right after the prepare run
 * (at the baseline, the red check, or the gates), only when it made any.
 * `ticket` is the step's, as on its `gates_run`: `null` in the final review.
 *
 * With `outside_links`, the paths are untracked symlinks pointing outside
 * their checkout, found just before a commit rather than around a prepare
 * run (#496): most likely a prepare run's from before the engine noted what
 * prepare made (an older engine's run, resumed). No commit may hold such a
 * link, so the engine leaves them out the same way.
 */
export const PrepareMadeEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('prepare_made'),
    content: z.object({
        /** Worktree-relative, as git lists them (`git ls-files --others`). */
        paths: z.array(z.string()),
        /** `true` when found as outside-pointing links before a commit. */
        outside_links: z.boolean().optional(),
    }),
})

/** The tests as they stood before any agent worked on a ticket. */
export const BaselineTestsEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('baseline_tests'),
    content: TestRunSchema,
})

/**
 * A ticket took another ticket's baseline instead of running the tests
 * again: both worktrees started from the same run-branch commit, `base_sha`.
 */
export const BaselineReusedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('baseline_reused'),
    content: z.object({
        from_ticket: z.number().int().positive(),
        base_sha: z.string().min(1),
    }),
})

/**
 * The engine threw away every uncommitted change in a ticket's worktree, back
 * to `sha`, so a fresh test-writer starts clean after a bad test.
 */
export const WorktreeResetEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('worktree_reset'),
    content: z.object({
        sha: z.string().min(1),
        /**
         * The engine found this mapped test checks nothing (#581); a fresh
         * test-writer replaces it. Left out when the implementer sent a test
         * back.
         */
        bad_test: BadTestSchema.optional(),
    }),
})

/**
 * The engine removed these git worktrees at the end of a run. Their branches
 * and the journal are kept.
 */
export const WorktreesRemovedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('worktrees_removed'),
    content: z.object({ paths: z.array(z.string().min(1)) }),
})
