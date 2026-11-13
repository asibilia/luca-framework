import { diffFileOf, insideHunk, type DiffFile } from './diff-hunks'
import type { DraftComment } from './drafts-file'

import { REPLY_MARKER } from '../../engine/skills/luca-pr-address/scripts/pr-findings'

/**
 * What one review holds (#752, section 11): the line and range comments
 * GitHub accepts, the file threads, and the review's text. No comment is
 * ever lost: one GitHub won't attach to its line is posted as quoted text.
 */

/** A line or range comment as GitHub's create review call takes it. */
export type GitHubLineComment = {
    path: string
    line: number
    side: 'LEFT' | 'RIGHT'
    start_line?: number
    start_side?: 'LEFT' | 'RIGHT'
    body: string
}

export type ReviewPlan = {
    /** The review's text, ending with the review record line, when there is one. */
    body: string
    comments: GitHubLineComment[]
    file_threads: { path: string; body: string }[]
    /** How many comments were posted as quoted text. */
    outside: number
}

/**
 * `text` with every copy of `/luca-pr-address`'s reply marker removed,
 * including one that removing another would make.
 */
export const withoutReplyMarker = (text: string): string => {
    let left = text
    while (left.includes(REPLY_MARKER)) left = left.split(REPLY_MARKER).join('')
    return left
}

/** The lines `start_line` to `end_line` of `path` on `side`, or none. */
export type ReadLines = (read: {
    path: string
    side: 'head' | 'base'
    start_line: number
    end_line: number
}) => Promise<string[]>

/**
 * Plans the review of `comments`, in the order the drafts were made.
 *
 * @param quote_all - Posts every line and range comment as quoted text,
 *   as after GitHub refused the review with HTTP 422.
 */
export const planReview = async ({
    comments,
    files,
    repo,
    head_sha,
    base_sha,
    record_line,
    empty_text,
    quote_all,
    readLines,
}: {
    comments: DraftComment[]
    files: DiffFile[]
    repo: string
    head_sha: string
    base_sha: string
    /** The review record line; null in a repo that isn't yours (#766). */
    record_line: string | null
    /** The text when the review would have none. */
    empty_text: string
    quote_all: boolean
    readLines: ReadLines
}): Promise<ReviewPlan> => {
    // Pull request comments go first, then comments outside the diff.
    const pr_text: string[] = []
    const text: string[] = []
    const accepted: GitHubLineComment[] = []
    const file_threads: { path: string; body: string }[] = []
    let outside = 0

    const blob = ({
        path,
        side,
        anchor,
    }: {
        path: string
        side: 'head' | 'base'
        anchor: string
    }) =>
        `https://github.com/${repo}/blob/${side === 'head' ? head_sha : base_sha}/${path}${anchor}`

    const quoted = async ({
        path,
        side,
        start_line,
        end_line,
        body,
    }: {
        path: string
        side: 'head' | 'base'
        start_line: number
        end_line: number
        body: string
    }) => {
        const one = start_line === end_line
        const where = one
            ? `On line ${start_line} of ${path}`
            : `On lines ${start_line} to ${end_line} of ${path}`
        const anchor = one ? `#L${start_line}` : `#L${start_line}-L${end_line}`
        const first = `${where}, outside this pull request's diff: ${blob({ path, side, anchor })}`
        const lines = (
            await readLines({ path, side, start_line, end_line })
        ).map((line) => (line === '' ? '>' : `> ${line}`))
        return lines.length === 0
            ? [first, '', body].join('\n')
            : [first, '', ...lines, '', body].join('\n')
    }

    for (const comment of comments) {
        const body = withoutReplyMarker(comment.body)
        const { path, side, start_line, end_line } = comment
        if (comment.kind === 'pull_request' || path === null) {
            pr_text.push(body)
            continue
        }
        if (
            comment.kind === 'file' ||
            side === null ||
            start_line === null ||
            end_line === null
        ) {
            const file = diffFileOf({ files, path, side: null })
            if (file !== null) {
                file_threads.push({ path: file.path, body })
            } else {
                outside += 1
                text.push(
                    `On ${path}, outside this pull request's diff: ${blob({ path, side: 'head', anchor: '' })}\n\n${body}`
                )
            }
            continue
        }
        const file = diffFileOf({ files, path, side })
        if (
            file !== null &&
            !quote_all &&
            insideHunk({ file, side, start_line, end_line })
        ) {
            const github_side = side === 'head' ? 'RIGHT' : 'LEFT'
            accepted.push({
                path: file.path,
                line: end_line,
                side: github_side,
                ...(start_line === end_line
                    ? {}
                    : { start_line, start_side: github_side }),
                body,
            })
            continue
        }
        outside += 1
        const quote = withoutReplyMarker(
            await quoted({ path, side, start_line, end_line, body })
        )
        if (file !== null) file_threads.push({ path: file.path, body: quote })
        else text.push(quote)
    }
    const parts = [
        ...pr_text,
        ...text,
        ...(record_line === null ? [] : [record_line]),
    ]
    return {
        body: parts.length === 0 ? empty_text : parts.join('\n\n'),
        comments: accepted,
        file_threads,
        outside,
    }
}
