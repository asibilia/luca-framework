/**
 * Turns what GitHub says about a pull request into one list of findings,
 * for the `/luca-pr-address` skill. A finding is one thing a reviewer or a
 * check said about the PR. They reach a PR through three channels, and no
 * channel contains another:
 *
 * - `review_comment`: a comment on a line or a file. It has a thread.
 * - `review_body`: the text a reviewer wrote on the review as a whole. It
 *   has no thread; it is answered in the summary comment.
 * - `alert`: a check run annotation, the PR's "Alerts" panel. It has no
 *   thread either.
 *
 * Pure: it reads no file and calls nothing. Like every skill script it
 * imports nothing, since it runs from `~/.claude/skills/luca-pr-address/`,
 * where no packages are installed.
 */

/** The hidden line that starts every summary comment this skill posts. */
export const SUMMARY_MARKER = '<!-- luca-pr-address summary'

/**
 * The hidden line that ends every thread reply this skill posts. On your
 * own PR the skill replies as you, so the login can't tell its replies
 * from yours; this line can.
 */
export const REPLY_MARKER = '<!-- luca-pr-address reply -->'

/**
 * The text Luca Walk's review record line starts with: the hidden line at
 * the end of every review Luca Walk sends. It is not a finding. A copy of
 * `REVIEW_RECORD_MARKER` in `packages/walk/src/review-record.ts`, kept as
 * a literal because skill scripts import nothing; a test there fails when
 * the two differ.
 */
export const REVIEW_RECORD_MARKER = '<!-- luca-walk review '

/** A review's text without Luca Walk's review record line. */
const withoutReviewRecord = (body: string): string =>
    body
        .split('\n')
        .filter((line) => !line.trimStart().startsWith(REVIEW_RECORD_MARKER))
        .join('\n')

/** The label a reviewer's "changes wanted" verdict is carried by. */
export const CHANGES_WANTED_LABEL = 'changes-wanted'

/** One finding, whatever channel it came through. */
export type Finding = {
    id: string
    source: 'review_comment' | 'review_body' | 'alert'
    author: string
    /** True when the PR's reviewer-owner wrote it: never declined or deferred. */
    from_owner: boolean
    path: string | null
    /**
     * The line the finding is on: for a range, its **last** line. `null`
     * for a finding on a whole file or a whole PR.
     */
    line: number | null
    /** The first line of a range; `null` when it is one line, a file, or the PR. */
    start_line?: number | null
    /**
     * What a line or file comment is attached to: one `line`, a `range`
     * of lines (`start_line` to `line`), or a whole `file`.
     */
    kind?: 'line' | 'range' | 'file'
    /** GitHub's own word for it: `line` (one line or a range) or `file`. */
    subject_type?: 'line' | 'file'
    /** Which side of the diff: `RIGHT` is the new file, `LEFT` the old. */
    side?: string | null
    start_side?: string | null
    /** True when the comment holds a suggestion block the reviewer wrote. */
    has_suggestion?: boolean
    body: string
    html_url: string
    /** The id to reply to; `null` when the finding has no thread. */
    comment_id: number | null
    /** True when the thread is answered and nobody has spoken since. */
    has_reply: boolean
    /** The replies under a line or file comment, oldest first. */
    thread?: ThreadReply[]
    /** False when the comment was left on an older commit: maybe already fixed. */
    anchored_to_head: boolean | null
    created_at: string | null
    diff_hunk?: string
    review_state?: string
    check?: string
    level?: string
    title?: string
    end_line?: number | null
}

/** One reply in a comment's thread. */
export type ThreadReply = {
    author: string
    body: string
    created_at: string
    /** True when this skill posted it. */
    by_skill: boolean
}

/** A check that has not finished: its alerts are not all in yet. */
export type PendingCheck = { name: string; app: string; status: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string =>
    typeof value === 'string' ? value : ''

const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' ? value : null

const objects = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter(isObject) : []

/** The login of the `user` (or the slug of the `app`) inside `value`. */
const loginOf = (value: unknown): string =>
    isObject(value) ? text(value.login) || text(value.slug) : ''

const sameLogin = ({ a, b }: { a: string; b: string }): boolean =>
    a !== '' && a.toLowerCase() === b.toLowerCase()

/**
 * `gh api --paginate --slurp` prints an array of pages. This flattens the
 * pages into their items; `key` names the list inside each page when a
 * page is an object (`check_runs`) and not a list.
 */
export const flattenPages = ({
    pages,
    key,
}: {
    pages: unknown
    key?: string
}): Record<string, unknown>[] =>
    (Array.isArray(pages) ? pages : []).flatMap((page) =>
        objects(key !== undefined && isObject(page) ? page[key] : page)
    )

/**
 * True when a thread needs nothing more: it has a reply, and nobody has
 * written under this skill's last reply. Someone answering the skill's
 * question opens the thread again.
 */
export const isAnswered = (thread: ThreadReply[]): boolean => {
    const last = thread.at(-1)
    if (last === undefined) return false
    return last.by_skill || !thread.some((reply) => reply.by_skill)
}

/** The line and file comments of a PR, as findings. Replies are not findings. */
export const reviewCommentFindings = ({
    comments,
    head_sha,
    owner,
}: {
    comments: Record<string, unknown>[]
    head_sha: string
    owner: string
}): Finding[] => {
    const threads = new Map<number, ThreadReply[]>()
    for (const comment of comments) {
        const root_id = numberOrNull(comment.in_reply_to_id)
        if (root_id === null) continue
        const body = text(comment.body)
        threads.set(root_id, [
            ...(threads.get(root_id) ?? []),
            {
                author: loginOf(comment.user),
                body: body.replace(REPLY_MARKER, '').trim(),
                created_at: text(comment.created_at),
                by_skill: body.includes(REPLY_MARKER),
            },
        ])
    }
    return comments
        .filter((comment) => numberOrNull(comment.in_reply_to_id) === null)
        .flatMap((comment) => {
            const comment_id = numberOrNull(comment.id)
            if (comment_id === null) return []
            const author = loginOf(comment.user)
            const thread = (threads.get(comment_id) ?? []).toSorted((a, b) =>
                a.created_at.localeCompare(b.created_at)
            )
            // GitHub gives a whole-file comment `line: 1`. It is on no line.
            const on_file = text(comment.subject_type) === 'file'
            const line = on_file
                ? null
                : (numberOrNull(comment.line) ??
                  numberOrNull(comment.original_line))
            const start_line = on_file
                ? null
                : (numberOrNull(comment.start_line) ??
                  numberOrNull(comment.original_start_line))
            const is_range = start_line !== null && start_line !== line
            return [
                {
                    id: `rc-${comment_id}`,
                    source: 'review_comment' as const,
                    author,
                    from_owner: sameLogin({ a: author, b: owner }),
                    path: text(comment.path) || null,
                    line,
                    start_line: is_range ? start_line : null,
                    kind: on_file
                        ? ('file' as const)
                        : is_range
                          ? ('range' as const)
                          : ('line' as const),
                    subject_type: on_file
                        ? ('file' as const)
                        : ('line' as const),
                    side: text(comment.side) || null,
                    start_side: is_range
                        ? text(comment.start_side) || null
                        : null,
                    has_suggestion: /^```suggestion\b/m.test(
                        text(comment.body)
                    ),
                    body: text(comment.body),
                    html_url: text(comment.html_url),
                    comment_id,
                    has_reply: isAnswered(thread),
                    thread,
                    anchored_to_head: text(comment.commit_id) === head_sha,
                    created_at: text(comment.created_at) || null,
                    diff_hunk: text(comment.diff_hunk),
                },
            ]
        })
}

/**
 * The reviews that say something in their own text, as findings. A review
 * with an empty body is only a wrapper for its line comments. One counts
 * as answered when a summary comment lists its id (see
 * `summary-cover.ts`), never just because a summary came after it: a
 * review that arrives while a run is working was not read by that run.
 * `cover.legacy_at` keeps the old "posted after it" rule for summaries
 * from before the list existed.
 */
export const reviewBodyFindings = ({
    reviews,
    owner,
    cover,
}: {
    reviews: Record<string, unknown>[]
    owner: string
    cover: { ids: Set<string>; legacy_at: string }
}): Finding[] =>
    reviews.flatMap((review) => {
        const review_id = numberOrNull(review.id)
        const body = withoutReviewRecord(text(review.body)).trim()
        const state = text(review.state)
        if (review_id === null || body === '' || state === 'PENDING') return []
        const author = loginOf(review.user)
        const submitted_at = text(review.submitted_at)
        const id = `rv-${review_id}`
        return [
            {
                id,
                source: 'review_body' as const,
                author,
                from_owner: sameLogin({ a: author, b: owner }),
                path: null,
                line: null,
                body,
                html_url: text(review.html_url),
                comment_id: null,
                has_reply:
                    cover.ids.has(id) ||
                    (cover.legacy_at !== '' && submitted_at <= cover.legacy_at),
                anchored_to_head: null,
                created_at: submitted_at || null,
                review_state: state,
            },
        ]
    })

/** The checks on the head commit that have not finished. */
export const pendingChecks = (
    runs: Record<string, unknown>[]
): PendingCheck[] =>
    runs
        .filter((run) => text(run.status) !== 'completed')
        .map((run) => ({
            name: text(run.name),
            app: loginOf(run.app),
            status: text(run.status),
        }))

/** The ids of the check runs that carry annotations, whatever they concluded. */
export const runsWithAnnotations = (
    runs: Record<string, unknown>[]
): number[] =>
    runs.flatMap((run) => {
        const id = numberOrNull(run.id)
        const count = isObject(run.output)
            ? numberOrNull(run.output.annotations_count)
            : null
        return id !== null && count !== null && count > 0 ? [id] : []
    })

/**
 * One check run's annotations, as findings. A check has no login to be the
 * owner. Alerts have no thread, so a summary is their answer: one is
 * answered when a summary lists its id, or when `legacy_answered` is true
 * (a summary from before the list existed was posted for this head).
 */
export const alertFindings = ({
    run,
    annotations,
    covered_ids,
    legacy_answered,
}: {
    run: Record<string, unknown>
    annotations: Record<string, unknown>[]
    covered_ids: Set<string>
    legacy_answered: boolean
}): Finding[] =>
    annotations.map((annotation) => {
        const path = text(annotation.path)
        const start_line = numberOrNull(annotation.start_line)
        const id = `alert-${String(run.id)}-${path}-${String(start_line)}`
        return {
            id,
            source: 'alert' as const,
            author: loginOf(run.app),
            from_owner: false,
            path: path || null,
            line: start_line,
            end_line: numberOrNull(annotation.end_line),
            body: text(annotation.message),
            html_url: text(annotation.blob_href),
            comment_id: null,
            has_reply: legacy_answered || covered_ids.has(id),
            anchored_to_head: true,
            created_at: text(run.completed_at) || null,
            check: text(run.name),
            level: text(annotation.annotation_level),
            title: text(annotation.title),
        }
    })

/**
 * A `notice` is a CI run's own summary, and a `.github` path comes from
 * the workflow runner, not the diff. Both are real, but neither has a line
 * in the PR to fix, so they are counted and kept apart.
 */
export const isCiNotice = (finding: Finding): boolean =>
    finding.source === 'alert' &&
    (finding.level === 'notice' || finding.path === '.github')

/** True when `only` is part of the finding's author or check name. */
export const matchesOnly = ({
    finding,
    only,
}: {
    finding: Finding
    only: string
}): boolean => {
    const wanted = only.toLowerCase()
    return (
        finding.author.toLowerCase().includes(wanted) ||
        (finding.check ?? '').toLowerCase().includes(wanted)
    )
}

const count = <T>(list: T[], keep: (item: T) => boolean): number =>
    list.filter(keep).length

/** The headline counts of a fetch. */
export const findingStats = ({
    findings,
    ci_notices,
}: {
    findings: Finding[]
    ci_notices: Finding[]
}) => ({
    total: findings.length,
    review_comments: count(findings, (f) => f.source === 'review_comment'),
    review_bodies: count(findings, (f) => f.source === 'review_body'),
    alerts: count(findings, (f) => f.source === 'alert'),
    from_owner: count(findings, (f) => f.from_owner),
    already_replied: count(findings, (f) => f.has_reply),
    unanswered: count(findings, (f) => !f.has_reply),
    off_head: count(findings, (f) => f.anchored_to_head === false),
    ci_notices: ci_notices.length,
    files: new Set(findings.flatMap((f) => (f.path === null ? [] : [f.path])))
        .size,
})

/** The state of a PR in one word: `MERGED`, `DRAFT`, `OPEN` or `CLOSED`. */
export const prState = (pull: Record<string, unknown>): string => {
    if (pull.merged === true) return 'MERGED'
    if (pull.draft === true && text(pull.state) === 'open') return 'DRAFT'
    return text(pull.state).toUpperCase()
}

/** The names of a PR's labels. */
export const labelNames = (pull: Record<string, unknown>): string[] =>
    objects(pull.labels)
        .map((label) => text(label.name))
        .filter((name) => name !== '')
