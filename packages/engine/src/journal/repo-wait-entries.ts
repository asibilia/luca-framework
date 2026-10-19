import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

/**
 * The journal entries of the repo wait (#615): a run started while an
 * earlier run on the same repo is going waits for it, before intake.
 */

/**
 * The run waits for the earlier runs on its repo that are going, named by
 * run id and spec (`null` for a demo). The spec issue was told once.
 */
export const RepoWaitStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('repo_wait_started'),
    content: z.object({
        runs: z.array(
            z.object({
                run_id: z.string().min(1),
                spec: z.number().int().positive().nullable(),
            })
        ),
    }),
})

/** No earlier run on the repo is going anymore: the run goes on to intake. */
export const RepoWaitEndedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('repo_wait_ended'),
    content: z.object({}),
})

/**
 * The run was started with `luca-run --alongside`, so it never waits for
 * another run on its repo. Journaled right after `run_started`.
 */
export const RepoWaitSkippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('repo_wait_skipped'),
    content: z.object({}),
})
