import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import { LeftoverHitSchema, LeftoverPassSchema } from '../gates/gate-schemas'

/**
 * The journal entries of the engine's commits on a ticket: the leftover
 * scan, dropped changesets, and the commit itself.
 */

/**
 * The commits the engine makes on a ticket: tests first (`red`), then code
 * (`green`), then one per review fix round (`fix`).
 */
export const CommitStageSchema = z.enum(['red', 'green', 'fix'])

export type CommitStage = z.infer<typeof CommitStageSchema>

/**
 * The leftover scan before an engine commit. Any hit blocks the commit.
 * `passed` lists the new markdown it let through and why (#520); left out
 * when there was none, and in journals from before it.
 */
export const LeftoverScanEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('leftover_scan'),
    content: z.object({
        stage: CommitStageSchema,
        hits: z.array(LeftoverHitSchema),
        passed: z.array(LeftoverPassSchema).optional(),
    }),
})

/**
 * Before an engine commit's leftover scan, in a repo with changesets, the
 * engine removed the changesets an agent wrote (new `.changeset/*.md` files
 * other than the README) from the worktree: it writes the run's one itself.
 * No ticket for the final review's fix commit.
 */
export const ChangesetDroppedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('changeset_dropped'),
    content: z.object({ paths: z.array(z.string().min(1)).min(1) }),
})

export const CommitMadeEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('commit_made'),
    content: z.object({
        stage: CommitStageSchema,
        sha: z.string().min(1),
        message: z.string(),
        files: z.array(z.string()),
    }),
})
