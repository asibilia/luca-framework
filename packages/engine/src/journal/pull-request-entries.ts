import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

/** The journal entries of the run's pull request: its changeset, and the PR. */

/** A changeset's bump: from the spec's `release:*` label, patch with none. */
export const ChangesetBumpSchema = z.enum(['patch', 'minor', 'major', 'none'])

export type ChangesetBump = z.infer<typeof ChangesetBumpSchema>

/**
 * The engine committed the run's one changeset (#461) at `path` on the run
 * branch and pushed it (`sha` is the run branch's HEAD after). `packages`
 * are the ones it names. `path` is `null` when nothing was written: the
 * spec is `release:none` (#476), or the repo no longer had a changesets
 * config.
 */
export const ChangesetWrittenEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('changeset_written'),
    content: z.object({
        path: z.string().nullable(),
        bump: ChangesetBumpSchema,
        packages: z.array(z.string()),
        sha: z.string(),
    }),
})

export const PullRequestOpenedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('pull_request_opened'),
    content: z.object({
        number: z.number().int().positive(),
        url: z.string(),
        head: z.string(),
        base: z.string(),
        title: z.string(),
        body: z.string(),
    }),
})
