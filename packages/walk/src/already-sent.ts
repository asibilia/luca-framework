import { createHash } from 'node:crypto'

import type { DraftComment } from './drafts-file'
import { readReviewRecord, type OwnReview } from './review-record'

/**
 * Never posting a review twice (#752, section 11): a send GitHub took but
 * whose answer was lost (gh reported an error, or VS Code stopped before
 * the drafts were cleared) is found again on the next send, by the
 * fingerprints of its drafts in its review record.
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
 * submitted review by the signed-in user (`own_reviews` are theirs), on
 * `head_sha`, whose review record is for `head_sha` and lists the draft's
 * fingerprint. Empty when there is none.
 */
export const alreadySent = ({
    comments,
    own_reviews,
    head_sha,
}: {
    comments: DraftComment[]
    own_reviews: OwnReview[]
    head_sha: string
}): DraftComment[] => {
    const sent = new Set(
        own_reviews
            .filter(
                (review) =>
                    review.state !== 'PENDING' && review.commit_id === head_sha
            )
            .map((review) => readReviewRecord({ text: review.body ?? '' }))
            .filter((record) => record?.commit === head_sha)
            .flatMap((record) => record?.sent_drafts ?? [])
    )
    return comments.filter((comment) => sent.has(draftFingerprint({ comment })))
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
