import { mkdir, stat } from 'node:fs/promises'

import {
    checkoutPath,
    clonePath,
    type PullRequestRef,
} from './pull-request-ref'
import type { WalkGit } from './walk-host'

/**
 * Luca Walk's own checkout of a pull request (#752, section 4): one clone
 * per repo under `<walk_dir>/repos`, made with `--no-checkout`, and one
 * detached worktree per pull request under `<walk_dir>/checkouts`, at the
 * pull request's head. No other clone of the repo is ever touched, and a
 * checkout with changes that aren't committed is never moved.
 */

type Prepared = { ok: true; path: string } | { ok: false; error: string }

const exists = async (path: string): Promise<boolean> => {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

/**
 * Makes the checkout of `ref` at `head_sha`, or moves it there.
 *
 * @returns The checkout's folder, or why it can't be used.
 */
export const prepareCheckout = async ({
    git,
    walk_dir,
    remote_url,
    ref,
    base_ref,
    head_sha,
}: {
    git: WalkGit
    walk_dir: string
    remote_url: string
    ref: PullRequestRef
    base_ref: string
    head_sha: string
}): Promise<Prepared> => {
    const clone = clonePath({ walk_dir, repo: ref.repo })
    const path = checkoutPath({ walk_dir, ref })
    const fail = (what: string, stderr: string): Prepared => ({
        ok: false,
        error: `Luca Walk could not ${what} for #${ref.number}: ${stderr.trim() || 'git failed'}`,
    })
    const run = async (args: string[], cwd: string) => git({ args, cwd })

    if (!(await exists(clone))) {
        await mkdir(walk_dir, { recursive: true })
        const made = await run(
            ['clone', '--quiet', '--no-checkout', remote_url, clone],
            walk_dir
        )
        if (!made.ok) return fail('clone the repo', made.stderr)
    }

    const fetched = await run(
        [
            'fetch',
            '--quiet',
            'origin',
            `+refs/pull/${ref.number}/head:refs/remotes/origin/pr/${ref.number}`,
            `+refs/heads/${base_ref}:refs/remotes/origin/${base_ref}`,
        ],
        clone
    )
    if (!fetched.ok) return fail('fetch the pull request', fetched.stderr)

    if (!(await exists(`${path}/.git`))) {
        await run(['worktree', 'prune'], clone)
        const added = await run(
            ['worktree', 'add', '--quiet', '--detach', path, head_sha],
            clone
        )
        if (!added.ok) return fail('make the checkout', added.stderr)
        return { ok: true, path }
    }

    const at = await run(['rev-parse', 'HEAD'], path)
    if (at.ok && at.stdout.trim() === head_sha) return { ok: true, path }

    const status = await run(['status', '--porcelain'], path)
    if (!status.ok) return fail('read the checkout', status.stderr)
    if (status.stdout.trim() !== '') {
        return {
            ok: false,
            error: `The checkout for #${ref.number} has changes that are not committed. Commit or throw them away in ${path}, then open it again.`,
        }
    }
    const moved = await run(['checkout', '--quiet', '--detach', head_sha], path)
    if (!moved.ok) return fail('move the checkout', moved.stderr)
    return { ok: true, path }
}
