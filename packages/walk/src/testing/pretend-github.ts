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

export type PretendPull = {
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
