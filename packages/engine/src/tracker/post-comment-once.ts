import type { Tracker } from './tracker'

/**
 * The step an engine comment belongs to: the run (its journal's folder
 * name), the seq of the step's first try, and whether this try is a redo
 * after a crash.
 */
export type CommentStep = { run_id: string; first_seq: number; redo: boolean }

/** Any engine comment's marker, from any run. */
const MARKER = /<!-- luca:[^\s:]+:\d+:\d+ -->/

/**
 * The invisible marker an engine comment carries: its run, its step's first
 * try, and its index `n` among the step's comments. Markdown hides it.
 *
 * @example
 * commentMarker({ run_id: 'run-1', first_seq: 42, n: 0 }) // '<!-- luca:run-1:42:0 -->'
 */
export const commentMarker = ({
    run_id,
    first_seq,
    n,
}: {
    run_id: string
    first_seq: number
    n: number
}): string => `<!-- luca:${run_id}:${first_seq}:${n} -->`

/** Whether a comment is the engine's own: it carries a luca marker. */
export const hasLucaMarker = (body: string): boolean => MARKER.test(body)

/**
 * Posts an engine comment with its marker, once. On a redo after a crash,
 * the issue's comments are read first, and one with the same marker (its
 * first try posted it, then the engine died before journaling it) is
 * adopted instead of posting again.
 *
 * @param n - The comment's index among its step's comments, from 0.
 * @returns The id of the comment posted or adopted.
 *
 * @example
 * const { id } = await postCommentOnce({ tracker, number: 10, body, step, n: 0 })
 */
export const postCommentOnce = async ({
    tracker,
    number,
    body,
    step,
    n,
}: {
    tracker: Tracker
    number: number
    body: string
    step: CommentStep
    n: number
}): Promise<{ id: number }> => {
    const marker = commentMarker({
        run_id: step.run_id,
        first_seq: step.first_seq,
        n,
    })
    if (step.redo) {
        const comments = await tracker.listComments({ number, since_id: 0 })
        const posted = comments.find((comment) => comment.body.includes(marker))
        if (posted !== undefined) return { id: posted.id }
    }
    return tracker.comment({ number, body: `${body}\n\n${marker}` })
}
