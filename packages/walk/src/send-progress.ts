import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { CommitIdSchema } from './commit-id'
import type { PullRequestRef } from './pull-request-ref'

/**
 * A send in progress (#766): in a repo that isn't yours, no review record
 * line is posted, so a retried send can't find the review GitHub already
 * took by its text. Instead, as soon as the pending review is made, its id
 * and the fingerprints of the drafts it holds are written here, on this
 * computer. A retry reads it back: a review GitHub took is never posted
 * again, and the app's own pending review is known by its id.
 */

export const SendProgressSchema = z.object({
    schema_version: z.literal(1),
    /** The pending review the send made. */
    review_id: z.number().int(),
    /** The commit the review is on. */
    commit: CommitIdSchema,
    /** The fingerprints of its drafts (`draftFingerprint`). */
    sent_drafts: z.array(z.string().min(1)),
})
export type SendProgress = z.infer<typeof SendProgressSchema>

const progressPath = ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): string =>
    join(walk_dir, 'sending', ...ref.repo.split('/'), `pr-${ref.number}.json`)

/**
 * Writes the send in progress of `ref`. Throws when it can't, so the send
 * stops before anything is submitted.
 */
export const saveSendProgress = async ({
    walk_dir,
    ref,
    progress,
}: {
    walk_dir: string
    ref: PullRequestRef
    progress: SendProgress
}): Promise<void> => {
    const path = progressPath({ walk_dir, ref })
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(progress, null, 4)}\n`)
}

/** The send in progress of `ref`; null when there is none or it fails its schema. */
export const readSendProgress = async ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): Promise<SendProgress | null> => {
    const text = await readFile(progressPath({ walk_dir, ref }), 'utf8').catch(
        () => null
    )
    if (text === null) return null
    try {
        const parsed = SendProgressSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

/** Forgets the send in progress of `ref`, once its send is done. */
export const clearSendProgress = async ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): Promise<void> => {
    await rm(progressPath({ walk_dir, ref }), { force: true })
}
