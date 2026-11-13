import type { DraftComment } from './drafts-file'
import { readPullView } from './load-pull-request'
import type { PullRequestRef } from './pull-request-ref'

import type { Gh } from '../../engine/src/story/story-github'

/**
 * Before a review is posted (#752, sections 11 and 12): GitHub's head is
 * read again, and every line comment must have been written at that
 * head, so no review goes out against an old commit, and no comment is
 * posted at line numbers that may have moved. Nothing here is lost: a
 * stopped send keeps every draft.
 */

const KEPT = 'Your comments are still saved.'

/**
 * Why the send of `comments` at `head_sha` must stop; null when it can
 * go. Throws gh's error when the pull request can't be read.
 *
 * @example
 * await sendStopper({ gh, ref, head_sha, comments })
 * // '#12 has new commits on GitHub since you opened it. Reload the pull request, check your comments, then send again. Your comments are still saved.'
 */
export const sendStopper = async ({
    gh,
    ref,
    head_sha,
    comments,
}: {
    gh: Gh
    ref: PullRequestRef
    head_sha: string
    comments: DraftComment[]
}): Promise<string | null> => {
    const now = await readPullView({ gh, ref })
    if (now.headRefOid !== head_sha) {
        return `#${ref.number} has new commits on GitHub since you opened it. Reload the pull request, check your comments, then send again. ${KEPT}`
    }
    // A draft with no commit is from an older drafts file: unknown, so
    // checked like one written at another head.
    const stale = comments.filter(
        (comment) => comment.kind === 'line' && comment.commit !== head_sha
    ).length
    if (stale === 0) return null
    return stale === 1
        ? `#${ref.number} has new commits since you wrote 1 of your comments, so its lines may have moved. Check it where it is shown now and edit or delete it, then send again. ${KEPT}`
        : `#${ref.number} has new commits since you wrote ${stale} of your comments, so their lines may have moved. Check each of them where it is shown now and edit or delete it, then send again. ${KEPT}`
}
