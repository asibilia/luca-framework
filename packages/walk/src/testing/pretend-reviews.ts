import { z } from 'zod'

import { apiCall, FieldsSchema, inQuery, type Fields } from './pretend-api-call'
import type { PretendPull, PretendStep } from './pretend-github'

/**
 * The pretend GitHub's reviews and labels (#761): the calls `pretend-github.ts`
 * lists under "Reviews" and "Labels", kept on the same state.
 */

/** A line or range comment on a review, as GitHub keeps it. */
export type PretendLineComment = {
    path: string
    /** The range's last line, or the comment's only line. */
    line: number
    side: 'LEFT' | 'RIGHT'
    /** The range's first line; null for a one-line comment. */
    start_line: number | null
    body: string
}

/** A thread on a whole file (`subjectType: FILE`) added to a review. */
export type PretendFileThread = { path: string; body: string }

export type PretendReview = {
    id: number
    node_id: string
    author: string
    state: 'PENDING' | 'COMMENTED' | 'APPROVED' | 'CHANGES_REQUESTED'
    /** The event it was submitted with; null while pending. */
    event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' | null
    body: string
    commit_id: string
    submitted_at: string | null
    comments: PretendLineComment[]
    file_threads: PretendFileThread[]
}

/** The lines of one diff hunk on one side, both ends included. */
export type PretendHunk = {
    path: string
    side: 'LEFT' | 'RIGHT'
    start: number
    end: number
}

type Answer = { ok: boolean; stdout: string; stderr: string }

const ok = (stdout: string): Answer => ({ ok: true, stdout, stderr: '' })
const no = (stderr: string): Answer => ({ ok: false, stdout: '', stderr })

const EVENT_STATE = {
    COMMENT: 'COMMENTED',
    APPROVE: 'APPROVED',
    REQUEST_CHANGES: 'CHANGES_REQUESTED',
} as const

/** The label names a call adds; none when it names none. */
const NamesSchema = z.array(z.string()).default([])

/** A new review's line comments; none when it has none. */
const CommentsSchema = z.array(FieldsSchema).default([])

const ENDPOINT =
    /^repos\/([^/]+\/[^/]+)\/(pulls|issues|labels)(?:\/([^/]+))?(?:\/(reviews|labels))?(?:\/([^/]+))?(?:\/(events))?$/

/** True when GitHub would attach `comment` to the diff. */
const inDiff = (found: PretendPull, comment: PretendLineComment): boolean => {
    if (found.diff_hunks === undefined) return true
    const first = comment.start_line ?? comment.line
    return found.diff_hunks.some(
        (hunk) =>
            hunk.path === comment.path &&
            hunk.side === comment.side &&
            hunk.start <= first &&
            first <= comment.line &&
            comment.line <= hunk.end
    )
}

const reviewJson = (review: PretendReview) => ({
    id: review.id,
    node_id: review.node_id,
    user: { login: review.author },
    state: review.state,
    body: review.body,
    commit_id: review.commit_id,
    submitted_at: review.submitted_at,
})

const lineComment = (comment: Fields): PretendLineComment => ({
    path: String(comment.path ?? ''),
    line: Number(comment.line),
    side: comment.side === 'LEFT' ? 'LEFT' : 'RIGHT',
    start_line:
        comment.start_line === undefined || comment.start_line === null
            ? null
            : Number(comment.start_line),
    body: String(comment.body ?? ''),
})

/** Submits `review` with `event`; answers a refusal, or null. */
const submit = (
    review: PretendReview,
    event: unknown,
    body: unknown
): Answer | null => {
    if (
        event !== 'COMMENT' &&
        event !== 'APPROVE' &&
        event !== 'REQUEST_CHANGES'
    ) {
        return no(`HTTP 422: Unprocessable Entity (event ${String(event)})`)
    }
    review.event = event
    review.state = EVENT_STATE[event]
    review.submitted_at = new Date().toISOString()
    if (typeof body === 'string' && body !== '') review.body = body
    return null
}

/**
 * The review and label calls on `state`. Each answers null for a call it
 * doesn't know.
 */
export const createReviewCalls = ({
    state,
    find,
    failed,
}: {
    state: {
        login: string
        pulls: PretendPull[]
        labels: Record<string, string[]>
    }
    find: (where: { repo: string; number: number }) => PretendPull | null
    failed: (step: PretendStep, stage?: 'before' | 'after') => Answer | null
}) => {
    let next_id = 1000

    const repoLabels = (repo: string): string[] => {
        state.labels[repo] = state.labels[repo] ?? []
        return state.labels[repo]
    }

    const addLabel = (found: PretendPull, name: string): Answer | null => {
        if (!repoLabels(found.repo).includes(name)) {
            return no(`could not add label: '${name}' not found`)
        }
        if (!found.labels.includes(name)) found.labels.push(name)
        return null
    }

    const createLabel = (repo: string, name: string): Answer => {
        if (repoLabels(repo).includes(name)) {
            return no(
                `label with name "${name}" already exists; use \`--force\` to update its color and description`
            )
        }
        repoLabels(repo).push(name)
        return ok(JSON.stringify({ name }))
    }

    const reviewsOf = (found: PretendPull): PretendReview[] => {
        found.reviews = found.reviews ?? []
        return found.reviews
    }

    const fileThread = (fields: Fields): Answer | null => {
        const query = String(fields.query ?? '')
        if (!query.includes('addPullRequestReviewThread')) return null
        const failure = failed('add_file_thread')
        if (failure !== null) return failure
        const variables = {
            ...fields,
            ...(FieldsSchema.safeParse(fields.variables).data ?? {}),
        }
        const read = (name: string) => {
            const value = variables[name]
            return typeof value === 'string' ? value : inQuery(query, name)
        }
        if (
            variables.subjectType !== 'FILE' &&
            !/subjectType\s*:\s*FILE/.test(query)
        ) {
            return no('pretend GitHub: only FILE threads are known')
        }
        const review_id = read('pullRequestReviewId')
        const review = state.pulls
            .flatMap((each) => each.reviews ?? [])
            .find((each) => each.node_id === review_id)
        if (review === undefined || review.state !== 'PENDING') {
            return no(
                `GraphQL: Could not resolve to a node with the global id of '${review_id}'`
            )
        }
        review.file_threads.push({
            path: read('path') ?? '',
            body: read('body') ?? '',
        })
        next_id += 1
        return ok(
            JSON.stringify({
                data: {
                    addPullRequestReviewThread: {
                        thread: { id: `PRRT_${next_id}` },
                    },
                },
            })
        )
    }

    const issueLabels = (
        found: PretendPull,
        method: string,
        fields: Fields,
        item: string | undefined
    ): Answer | null => {
        const failure = failed('change_labels')
        if (failure !== null) return failure
        const listed = () =>
            ok(JSON.stringify(found.labels.map((name) => ({ name }))))
        if (method === 'POST' && item === undefined) {
            const names = NamesSchema.safeParse(fields.labels)
            if (!names.success) {
                return no('HTTP 422: Unprocessable Entity (labels)')
            }
            for (const name of names.data) {
                const refused = addLabel(found, name)
                if (refused !== null) return refused
            }
            return listed()
        }
        if (method === 'DELETE' && item !== undefined) {
            const name = decodeURIComponent(item)
            if (!found.labels.includes(name)) {
                return no('HTTP 404: Label does not exist')
            }
            found.labels = found.labels.filter((each) => each !== name)
            return listed()
        }
        return null
    }

    const createReview = (found: PretendPull, fields: Fields): Answer => {
        const failure = failed('create_review')
        if (failure !== null) return failure
        const sent = CommentsSchema.safeParse(fields.comments)
        if (!sent.success) {
            return no('HTTP 422: Unprocessable Entity (comments)')
        }
        const comments = sent.data.map(lineComment)
        if (comments.some((comment) => !inDiff(found, comment))) {
            return no(
                'HTTP 422: Unprocessable Entity (Pull request review thread line must be part of the diff)'
            )
        }
        next_id += 1
        const review: PretendReview = {
            id: next_id,
            node_id: `PRR_${next_id}`,
            author: state.login,
            state: 'PENDING',
            event: null,
            body: String(fields.body ?? ''),
            commit_id: String(fields.commit_id ?? found.head_sha),
            submitted_at: null,
            comments,
            file_threads: [],
        }
        if (fields.event !== undefined && fields.event !== null) {
            const refused = submit(review, fields.event, undefined)
            if (refused !== null) return refused
        }
        reviewsOf(found).push(review)
        return ok(JSON.stringify(reviewJson(review)))
    }

    const oneReview = (
        found: PretendPull,
        method: string,
        fields: Fields,
        item: string,
        events: string | undefined
    ): Answer | null => {
        const reviews = reviewsOf(found)
        const review = reviews.find((each) => String(each.id) === item)
        if (review === undefined) return no('HTTP 404: Not Found')
        if (method === 'DELETE' && events === undefined) {
            if (review.state !== 'PENDING') {
                return no(
                    'HTTP 422: Unprocessable Entity (Can not delete a non-pending pull request review)'
                )
            }
            reviews.splice(reviews.indexOf(review), 1)
            return ok(JSON.stringify(reviewJson(review)))
        }
        if (method === 'POST' && events !== undefined) {
            const failure = failed('submit_review')
            if (failure !== null) return failure
            if (review.state !== 'PENDING') {
                return no('HTTP 422: Unprocessable Entity (already submitted)')
            }
            const refused = submit(review, fields.event, fields.body)
            if (refused !== null) return refused
            return (
                failed('submit_review', 'after') ??
                ok(JSON.stringify(reviewJson(review)))
            )
        }
        return null
    }

    /** A `gh api` call about reviews or labels. */
    const api = (call: { args: string[]; input?: string }): Answer | null => {
        const { method, endpoint, fields, slurp } = apiCall(call)
        const path = endpoint.split('?')[0] ?? ''
        if (path === 'graphql') return fileThread(fields)
        const parts = ENDPOINT.exec(path)
        if (parts === null) return null
        const [, repo = '', kind, which, sub, item, events] = parts
        if (kind === 'labels') {
            if (which === undefined && method === 'POST') {
                return createLabel(repo, String(fields.name ?? ''))
            }
            if (which === undefined || method !== 'GET') return null
            const name = decodeURIComponent(which)
            return repoLabels(repo).includes(name)
                ? ok(JSON.stringify({ name }))
                : no('HTTP 404: Not Found')
        }
        const found = find({ repo, number: Number(which) })
        if (found === null) return no('HTTP 404: Not Found')
        if (kind === 'issues' && sub === 'labels') {
            return issueLabels(found, method, fields, item)
        }
        if (kind !== 'pulls' || sub !== 'reviews') return null
        if (item === undefined && method === 'GET') {
            const listed = reviewsOf(found).map(reviewJson)
            return ok(JSON.stringify(slurp ? [listed] : listed))
        }
        if (item === undefined && method === 'POST') {
            return createReview(found, fields)
        }
        if (item === undefined) return null
        return oneReview(found, method, fields, item, events)
    }

    /** `gh label list` and `gh label create`. */
    const label = (args: string[]): Answer | null => {
        const repo = args[args.indexOf('--repo') + 1] ?? ''
        if (args[1] === 'list') {
            return ok(
                JSON.stringify(repoLabels(repo).map((name) => ({ name })))
            )
        }
        if (args[1] === 'create') return createLabel(repo, args[2] ?? '')
        return null
    }

    /** `gh pr edit` with `--add-label` or `--remove-label`. */
    const editLabels = (args: string[]): Answer | null => {
        const flagged = (flag: string) =>
            args.flatMap((arg, at) =>
                arg === flag ? (args[at + 1] ?? '').split(',') : []
            )
        const adds = flagged('--add-label')
        const removes = flagged('--remove-label')
        if (adds.length === 0 && removes.length === 0) return null
        const repo = args[args.indexOf('--repo') + 1] ?? ''
        const found = find({ repo, number: Number(args[2]) })
        if (found === null) return no('HTTP 404: Not Found')
        const failure = failed('change_labels')
        if (failure !== null) return failure
        for (const name of adds) {
            const refused = addLabel(found, name)
            if (refused !== null) return refused
        }
        found.labels = found.labels.filter((name) => !removes.includes(name))
        return ok(`https://github.com/${found.repo}/pull/${found.number}\n`)
    }

    return { api, label, editLabels, reviewsOf }
}
