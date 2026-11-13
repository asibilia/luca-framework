import {
    createReviewCalls,
    type PretendHunk,
    type PretendReview,
} from './pretend-reviews'

import type { Gh } from '../../../engine/src/story/story-github'

export type {
    PretendFileThread,
    PretendHunk,
    PretendLineComment,
    PretendReview,
} from './pretend-reviews'

/**
 * A pretend GitHub for tests (#752, section 2): a `Gh` that keeps state
 * and answers the `gh` calls Luca Walk makes. Tests read the state back,
 * and change it (a pull request's head, its comments) between calls.
 *
 * It answers:
 *
 * - `gh api user --jq .login`;
 * - `gh pr view <number> --repo <repo> --json ...` (every field it knows,
 *   whatever `--json` asks for: a reader's schema drops the rest);
 * - `gh search prs --state S --label L ...` (answers `number`, `title`,
 *   `state`, `author`, `url` and `repository`; honors only `--state` and
 *   `--label`, so `--involves` is the app's to send);
 * - `gh api repos/<repo>/issues/<number>/comments?per_page=100 --paginate --slurp`.
 *
 * Reviews (#761, in `pretend-reviews.ts`), through `gh api` (a JSON body
 * by `--input -`, or `-f`/`-F` fields; `-X`/`--method` for the method):
 *
 * - `GET repos/<repo>/pulls/<number>/reviews` (with `--slurp`, one page);
 * - `POST repos/<repo>/pulls/<number>/reviews` with `commit_id`, `body`,
 *   `comments` (`path`, `line`, `side`, `start_line`, `start_side`,
 *   `body`) and no `event`: a `PENDING` review. With an `event`, it is
 *   submitted at once. A comment outside `diff_hunks` is refused with
 *   `HTTP 422: Unprocessable Entity` (step `create_review`);
 * - `DELETE repos/<repo>/pulls/<number>/reviews/<id>` (a pending one);
 * - `POST repos/<repo>/pulls/<number>/reviews/<id>/events` with `event`
 *   and an optional `body` (step `submit_review`);
 * - `graphql` with `addPullRequestReviewThread` and `subjectType: FILE`,
 *   its `pullRequestReviewId` (the review's `node_id`), `path` and `body`
 *   as variables (`--input -` with `{ query, variables }`, or `-f`/`-F`
 *   fields) or written in the query (step `add_file_thread`).
 *
 * Labels: `gh label list --repo <repo> --json name`, `gh label create
 * <name> --repo <repo>`, `GET repos/<repo>/labels/<name>`,
 * `POST repos/<repo>/labels`; and changing a pull request's labels (step
 * `change_labels`): `gh pr edit <number> --repo <repo> --add-label` /
 * `--remove-label`, `POST repos/<repo>/issues/<number>/labels` and
 * `DELETE repos/<repo>/issues/<number>/labels/<name>` (404 when the pull
 * request lacks it). Adding a label the repo lacks fails.
 *
 * Any other call fails with `pretend GitHub does not know: <call>`.
 */

/** One step `failNext` can make fail once. Later tickets add theirs. */
export type PretendStep =
    | 'read_comments'
    | 'create_review'
    | 'add_file_thread'
    | 'submit_review'
    | 'change_labels'

export type PretendComment = { id: number; body: string; author?: string }

/** One comment in a review thread. */
export type PretendThreadComment = { author: string; body: string }

/**
 * A review thread on a pull request. `line` is null for a file thread or
 * when the line is gone; `side` is GitHub's `diffSide`.
 */
export type PretendThread = {
    path: string
    subject_type: 'LINE' | 'FILE'
    line: number | null
    side: 'LEFT' | 'RIGHT'
    comments: PretendThreadComment[]
}

export type PretendPull = {
    /** The pull request's review threads. None when left out. */
    threads?: PretendThread[]
    repo: string
    number: number
    title: string
    author: string
    base_ref: string
    head_sha: string
    state: 'OPEN' | 'CLOSED' | 'MERGED'
    labels: string[]
    /** The pull request's conversation (issue) comments, oldest first. */
    comments: PretendComment[]
    /** Its reviews, oldest first (none when left out). */
    reviews?: PretendReview[]
    /**
     * The diff's hunks GitHub attaches line comments to. Left out, every
     * line is in the diff.
     */
    diff_hunks?: PretendHunk[]
}

export type PretendGitHub = {
    gh: Gh
    state: {
        login: string
        pulls: PretendPull[]
        /** Each repo's labels, by `owner/name`. */
        labels: Record<string, string[]>
        calls: string[]
    }
    /** The pull request, to read or change. Throws when there is none. */
    pull: (where: { repo: string; number: number }) => PretendPull
    /** The pull request's reviews, oldest first. Throws when there is none. */
    reviewsOf: (where: { repo: string; number: number }) => PretendReview[]
    /** Makes the next call of `step` fail once, with `error` as gh's stderr. */
    failNext: (failure: { step: PretendStep; error: string }) => void
}

/** The repo labels to start with: `labels`, and every label on a pull. */
const startLabels = (
    labels: Record<string, string[]>,
    pulls: PretendPull[]
): Record<string, string[]> => {
    const all: Record<string, string[]> = {}
    for (const [repo, names] of Object.entries(labels)) all[repo] = [...names]
    for (const pull of pulls) {
        const known = all[pull.repo] ?? []
        all[pull.repo] = [
            ...known,
            ...pull.labels.filter((name) => !known.includes(name)),
        ]
    }
    return all
}

/**
 * A pretend GitHub signed in as `login`, holding `pulls`.
 *
 * @example
 * const github = createPretendGitHub({ login: 'octocat', pulls: [pull] })
 * github.pull({ repo: 'octocat/hello-world', number: 12 }).head_sha = moved
 */
export const createPretendGitHub = ({
    login,
    pulls,
    labels = {},
}: {
    login: string
    pulls: PretendPull[]
    /**
     * Each repo's labels, by `owner/name`. A label already on one of
     * `pulls` is always the repo's too.
     */
    labels?: Record<string, string[]>
}): PretendGitHub => {
    const calls: string[] = []
    const state = {
        login,
        pulls: pulls.map((pull) => ({
            ...pull,
            labels: [...pull.labels],
            comments: [...pull.comments],
            reviews: (pull.reviews ?? []).map((review) => ({
                ...review,
                comments: [...review.comments],
                file_threads: [...review.file_threads],
            })),
        })),
        labels: startLabels(labels, pulls),
        calls,
    }
    const failures = new Map<PretendStep, string>()

    const find = ({ repo, number }: { repo: string; number: number }) =>
        state.pulls.find(
            (pull) => pull.repo === repo && pull.number === number
        ) ?? null

    const pull: PretendGitHub['pull'] = (where) => {
        const found = find(where)
        if (found === null) {
            throw new Error(`no pull request ${where.repo}#${where.number}`)
        }
        return found
    }

    const ok = (stdout: string) => ({ ok: true, stdout, stderr: '' })
    const no = (stderr: string) => ({ ok: false, stdout: '', stderr })
    const failed = (step: PretendStep) => {
        const error = failures.get(step)
        if (error === undefined) return null
        failures.delete(step)
        return no(error)
    }

    const reviews = createReviewCalls({ state, find, failed })

    const gh: Gh = async ({ args, input }) => {
        const call = args.join(' ')
        state.calls.push(call)
        if (call === 'api user --jq .login') return ok(`${state.login}\n`)

        if (args[0] === 'pr' && args[1] === 'view') {
            const repo = args[args.indexOf('--repo') + 1] ?? ''
            const found = find({ repo, number: Number(args[2]) })
            if (found === null) {
                return no(
                    `GraphQL: Could not resolve to a PullRequest with the number of ${args[2]}. (repository.pullRequest)`
                )
            }
            return ok(
                JSON.stringify({
                    number: found.number,
                    title: found.title,
                    author: { login: found.author },
                    baseRefName: found.base_ref,
                    headRefOid: found.head_sha,
                    state: found.state,
                    url: `https://github.com/${found.repo}/pull/${found.number}`,
                    labels: found.labels.map((name) => ({ name })),
                })
            )
        }

        if (args[0] === 'search' && args[1] === 'prs') {
            const flag = (name: string) => args[args.indexOf(name) + 1]
            const label = flag('--label')
            const wanted = (flag('--state') ?? 'open').toUpperCase()
            const found = state.pulls.filter(
                (pull) =>
                    pull.state === wanted &&
                    (label === undefined || pull.labels.includes(label))
            )
            return ok(
                JSON.stringify(
                    found.map((pull) => ({
                        number: pull.number,
                        title: pull.title,
                        state: pull.state.toLowerCase(),
                        author: { login: pull.author },
                        url: `https://github.com/${pull.repo}/pull/${pull.number}`,
                        repository: {
                            name: pull.repo.split('/')[1],
                            nameWithOwner: pull.repo,
                        },
                    }))
                )
            )
        }

        if (
            args[0] === 'api' &&
            args[1] === 'graphql' &&
            call.includes('reviewThreads')
        ) {
            const variable = (name: string) =>
                args
                    .find((arg) => arg.startsWith(`${name}=`))
                    ?.slice(name.length + 1) ?? ''
            const found = find({
                repo: `${variable('owner')}/${variable('name')}`,
                number: Number(variable('number')),
            })
            if (found === null) return no('HTTP 404: Not Found')
            const nodes = (found.threads ?? []).map((thread) => ({
                path: thread.path,
                subjectType: thread.subject_type,
                line: thread.line,
                originalLine: thread.line,
                diffSide: thread.side,
                comments: {
                    nodes: thread.comments.map(({ author, body }) => ({
                        author: { login: author },
                        body,
                    })),
                },
            }))
            return ok(
                JSON.stringify({
                    data: {
                        repository: {
                            pullRequest: {
                                reviewThreads: {
                                    nodes,
                                    pageInfo: {
                                        hasNextPage: false,
                                        endCursor: null,
                                    },
                                },
                            },
                        },
                    },
                })
            )
        }

        const comments =
            /^api repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/comments\?per_page=100/.exec(
                call
            )
        if (comments !== null) {
            const failure = failed('read_comments')
            if (failure !== null) return failure
            const found = find({
                repo: comments[1] ?? '',
                number: Number(comments[2]),
            })
            if (found === null) return no('HTTP 404: Not Found')
            return ok(
                JSON.stringify([
                    found.comments.map(({ id, body, author }) => ({
                        id,
                        body,
                        user: { login: author ?? found.author },
                    })),
                ])
            )
        }

        const answered =
            args[0] === 'api'
                ? reviews.api({ args, input })
                : args[0] === 'label'
                  ? reviews.label(args)
                  : args[0] === 'pr' && args[1] === 'edit'
                    ? reviews.editLabels(args)
                    : null
        if (answered !== null) return answered

        return no(`pretend GitHub does not know: ${call}`)
    }

    return {
        gh,
        state,
        pull,
        reviewsOf: (where) => reviews.reviewsOf(pull(where)),
        failNext: ({ step, error }) => {
            failures.set(step, error)
        },
    }
}
