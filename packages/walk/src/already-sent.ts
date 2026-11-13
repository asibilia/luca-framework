import { createHash } from 'node:crypto'

import type { DraftComment } from './drafts-file'
import { readReviewRecord, type OwnReview } from './review-record'
import type { SendInProgress } from './send-progress'

/**
 * Never posting a review twice (#752, section 11): a send GitHub took but
 * whose answer was lost (gh reported an error, or VS Code stopped before
 * the drafts were cleared) is found again on the next send, by the
 * fingerprints of its drafts in its review record, or, in a repo that
 * isn't yours (#766), in the send in progress kept on this computer.
 */

/**
 * A draft's fingerprint: its id, where it is, and its text, hashed. A
 * draft edited after a send has another fingerprint, so it is never taken
 * for one that was sent.
 *
 * @example
 * draftFingerprint({ comment }) // '3f9a0c1d2b4e5f60'
 */
export const draftFingerprint = ({
    comment,
}: {
    comment: DraftComment
}): string =>
    createHash('sha256')
        .update(
            JSON.stringify([
                comment.id,
                comment.kind,
                comment.path,
                comment.side,
                comment.start_line,
                comment.end_line,
                comment.body,
            ])
        )
        .digest('hex')
        .slice(0, 16)

/**
 * The drafts in `comments` that a review GitHub already took holds: a
 * submitted review by the signed-in user (`own_reviews` are theirs) whose
 * review record (in its text, or in `progress`, the sends in progress
 * kept on this computer) is for the commit the review is on, that
 * commit is the one the draft was written at (`head_sha` when that is
 * unknown), and the record lists the draft's fingerprint. Empty when
 * there is none.
 */
export const alreadySent = ({
    comments,
    own_reviews,
    head_sha,
    progress,
}: {
    comments: DraftComment[]
    own_reviews: OwnReview[]
    head_sha: string
    progress: SendInProgress[]
}): DraftComment[] => {
    const taken = own_reviews.flatMap((review) => {
        if (review.state === 'PENDING') return []
        const record =
            progress.find(({ review_id }) => review_id === review.id) ??
            readReviewRecord({ text: review.body ?? '' })
        if (record === null || record.commit !== review.commit_id) return []
        return [{ commit: record.commit, sent: record.sent_drafts ?? [] }]
    })
    return comments.filter((comment) => {
        const commit = comment.commit ?? head_sha
        const fingerprint = draftFingerprint({ comment })
        return taken.some(
            (review) =>
                review.commit === commit && review.sent.includes(fingerprint)
        )
    })
}

/**
 * What to tell the owner after finding drafts already sent; `left` is how
 * many were not in that review.
 *
 * @example
 * alreadySentNote({ number: 12, left: 0 }) // 'This review was already sent to #12. Your drafts are cleared.'
 */
export const alreadySentNote = ({
    number,
    left,
}: {
    number: number
    left: number
}): string =>
    left === 0
        ? `This review was already sent to #${number}. Your drafts are cleared.`
        : `This review was already sent to #${number}, so the comments in it are cleared. ${
              left === 1
                  ? '1 comment was not in it and is still saved: send again to send it.'
                  : `${left} comments were not in it and are still saved: send again to send them.`
          }`
