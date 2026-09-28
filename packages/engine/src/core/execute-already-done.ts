import type { AlreadyDoneAction } from './already-done'

import type { Journal } from '../journal/journal'
import { postCommentOnce, type CommentStep } from '../tracker/post-comment-once'
import type { Tracker } from '../tracker/tracker'

/**
 * Carries out the tracker steps of a ticket whose work was already on the
 * base branch (#484), then journals what happened: telling the spec issue
 * (`ticket_already_done`), and closing the ticket with a comment in a run
 * with no PR (`ticket_closed`). Comments are posted once
 * (`postCommentOnce`), and closing a closed issue does nothing, so a redo
 * after a crash repeats neither.
 *
 * @example
 * await executeAlreadyDoneAction({ action, journal, tracker, step })
 */
export const executeAlreadyDoneAction = async ({
    action,
    journal,
    tracker,
    step,
}: {
    action: Exclude<AlreadyDoneAction, { type: 'finish_nothing_to_do' }>
    journal: Journal
    tracker: Tracker
    /** Which try of its step this is, for its comment's marker. */
    step: CommentStep
}): Promise<void> => {
    switch (action.type) {
        case 'mark_already_done': {
            const { id } = await postCommentOnce({
                tracker,
                number: action.spec_number,
                body: action.body,
                step,
                n: 0,
            })
            journal.append({
                kind: 'ticket_already_done',
                ticket: action.ticket,
                role: null,
                content: { shas: action.shas, comment_id: id },
            })
            return
        }
        case 'close_ticket': {
            const { id } = await postCommentOnce({
                tracker,
                number: action.ticket,
                body: action.body,
                step,
                n: 0,
            })
            await tracker.closeIssue({ number: action.ticket })
            journal.append({
                kind: 'ticket_closed',
                ticket: action.ticket,
                role: null,
                content: { comment_id: id },
            })
            return
        }
    }
}
