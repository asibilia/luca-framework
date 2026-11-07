import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

/**
 * The journal entries of warm builds (#721): the build caches cloned into a
 * new ticket worktree, and the ones that weren't. Neither ever stops the
 * ticket.
 */

/** Where a copied cache came from: the run branch's worktree or the repo's checkout. */
export const BuildCacheSourceSchema = z.enum(['run_branch', 'checkout'])

export type BuildCacheSource = z.infer<typeof BuildCacheSourceSchema>

/**
 * The caches cloned into a ticket's new worktree, once per ticket and only
 * when at least one was. `path` is relative to the repo root; `ms` is how
 * long all the copies and renames took.
 */
export const BuildCacheCopiedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('build_cache_copied'),
    content: z.object({
        paths: z.array(
            z.object({
                path: z.string().min(1),
                from: BuildCacheSourceSchema,
            })
        ),
        ms: z.number().int().min(0),
    }),
})

/**
 * Why a cache path wasn't copied: git doesn't ignore it in the ticket's
 * worktree, it is in neither source, the copy or rename failed, or the
 * worktree already had it (a redo after a crash).
 */
export const BuildCacheSkipReasonSchema = z.enum([
    'not_ignored',
    'no_source',
    'copy_failed',
    'already_present',
])

export type BuildCacheSkipReason = z.infer<typeof BuildCacheSkipReasonSchema>

/**
 * One cache path not copied into a ticket's new worktree. `path` is the
 * expanded match, or the config entry for `no_source`; `error` is the
 * copy's error text, only for `copy_failed`.
 */
export const BuildCacheSkippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('build_cache_skipped'),
    content: z.object({
        path: z.string().min(1),
        reason: BuildCacheSkipReasonSchema,
        error: z.string().optional(),
    }),
})
