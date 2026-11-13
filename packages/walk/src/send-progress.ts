import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { CommitIdSchema } from './commit-id'
import type { PullRequestRef } from './pull-request-ref'

/**
 * The sends in progress (#766): in a repo that isn't yours, no review
 * record line is posted, so a retried send can't find the review GitHub
 * already took by its text. Instead, as soon as the pending review is
 * made, its id, the fingerprints of the drafts it holds and the verdict
 * are written here, on this computer, in every repo (a verdict with no
 * comments has no fingerprint to find it by, in any repo). A retry reads them back: a review GitHub took is
 * never posted again, and the app's own pending review is known by its
 * id. The file is kept after a send completes, and holds the last
 * `KEPT_SENDS` sends, newest first, so a second window still holding
 * drafts an earlier send took (its drafts are read once, when it opens)
 * never posts them again.
 */

/** How many sends the file remembers. */
export const KEPT_SENDS = 20

/** The verdict picked at `Send the review`. */
export const VerdictKeySchema = z.enum([
    'signed_off',
    'changes_wanted',
    'just_comments',
])
export type VerdictKey = z.infer<typeof VerdictKeySchema>

export const SendInProgressSchema = z.object({
    /** The pending review the send made. */
    review_id: z.number().int(),
    /** The commit the review is on. */
    commit: CommitIdSchema,
    /** The fingerprints of its drafts (`draftFingerprint`). */
    sent_drafts: z.array(z.string().min(1)),
    /** The verdict picked for it, so a retried verdict with no comments is known. */
    verdict: VerdictKeySchema,
})
export type SendInProgress = z.infer<typeof SendInProgressSchema>

export const SendProgressSchema = z.object({
    schema_version: z.literal(1),
    /** The last sends, newest first. */
    sends: z.array(SendInProgressSchema),
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

/** The sends in progress of `ref`, newest first; none when there is no file or it fails its schema. */
export const readSendProgress = async ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): Promise<SendInProgress[]> => {
    const text = await readFile(progressPath({ walk_dir, ref }), 'utf8').catch(
        () => null
    )
    if (text === null) return []
    try {
        const parsed = SendProgressSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data.sends : []
    } catch {
        return []
    }
}

/**
 * Adds `send` to the sends in progress of `ref`, first, keeping the last
 * `KEPT_SENDS`. Throws when it can't be written, so the send stops before
 * anything is submitted.
 */
export const saveSendProgress = async ({
    walk_dir,
    ref,
    send,
}: {
    walk_dir: string
    ref: PullRequestRef
    send: SendInProgress
}): Promise<void> => {
    const path = progressPath({ walk_dir, ref })
    const earlier = await readSendProgress({ walk_dir, ref })
    const progress: SendProgress = {
        schema_version: 1,
        sends: [send, ...earlier].slice(0, KEPT_SENDS),
    }
    // Through a temporary file, so another window never reads half of it.
    const temporary = `${path}.${process.pid}.tmp`
    await mkdir(dirname(path), { recursive: true })
    await writeFile(temporary, `${JSON.stringify(progress, null, 4)}\n`)
    await rename(temporary, path)
}
