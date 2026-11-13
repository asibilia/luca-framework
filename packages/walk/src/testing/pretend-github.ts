import type { Gh } from '../../../engine/src/story/story-github'

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
}

export type PretendGitHub = {
    gh: Gh
    state: { login: string; pulls: PretendPull[]; calls: string[] }
    /** The pull request, to read or change. Throws when there is none. */
    pull: (where: { repo: string; number: number }) => PretendPull
    /** Makes the next call of `step` fail once, with `error` as gh's stderr. */
    failNext: (failure: { step: PretendStep; error: string }) => void
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
}: {
    login: string
    pulls: PretendPull[]
}): PretendGitHub => {
    const state = {
        login,
        pulls: pulls.map((pull) => ({
            ...pull,
            labels: [...pull.labels],
            comments: [...pull.comments],
        })),
        calls: [] as string[],
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

    const gh: Gh = async ({ args }) => {
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

        return no(`pretend GitHub does not know: ${call}`)
    }

    return {
        gh,
        state,
        pull,
        failNext: ({ step, error }) => {
            failures.set(step, error)
        },
    }
}
