import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

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

/** Where to make or move the checkout of `ref`: GitHub's head and base branch. */
type CheckoutAt = {
    git: WalkGit
    walk_dir: string
    remote_url: string
    ref: PullRequestRef
    base_ref: string
    head_sha: string
}

const exists = async (path: string): Promise<boolean> => {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

const failed = ({
    ref,
    what,
    stderr,
}: {
    ref: PullRequestRef
    what: string
    stderr: string
}): Prepared => ({
    ok: false,
    error: `Luca Walk could not ${what} for #${ref.number}: ${stderr.trim() || 'git failed'}`,
})

/**
 * Moves the existing checkout at `path` to `head_sha`, which it already
 * has; never when it has changes that are not committed.
 */
const moveCheckout = async ({
    git,
    ref,
    path,
    head_sha,
}: {
    git: WalkGit
    ref: PullRequestRef
    path: string
    head_sha: string
}): Promise<Prepared> => {
    const at = await git({ args: ['rev-parse', 'HEAD'], cwd: path })
    if (at.ok && at.stdout.trim() === head_sha) return { ok: true, path }

    const status = await git({ args: ['status', '--porcelain'], cwd: path })
    if (!status.ok) {
        return failed({ ref, what: 'read the checkout', stderr: status.stderr })
    }
    if (status.stdout.trim() !== '') {
        return {
            ok: false,
            error: `The checkout for #${ref.number} has changes that are not committed. Commit or throw them away in ${path}, then open it again.`,
        }
    }
    const moved = await git({
        args: ['checkout', '--quiet', '--detach', head_sha],
        cwd: path,
    })
    if (!moved.ok) {
        return failed({ ref, what: 'move the checkout', stderr: moved.stderr })
    }
    return { ok: true, path }
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
}: CheckoutAt): Promise<Prepared> => {
    const clone = clonePath({ walk_dir, repo: ref.repo })
    const path = checkoutPath({ walk_dir, ref })

    if (!(await exists(clone))) {
        await mkdir(walk_dir, { recursive: true })
        const made = await git({
            args: ['clone', '--quiet', '--no-checkout', remote_url, clone],
            cwd: walk_dir,
        })
        if (!made.ok) {
            return failed({ ref, what: 'clone the repo', stderr: made.stderr })
        }
    }

    const fetched = await git({
        args: [
            'fetch',
            '--quiet',
            'origin',
            `+refs/pull/${ref.number}/head:refs/remotes/origin/pr/${ref.number}`,
            `+refs/heads/${base_ref}:refs/remotes/origin/${base_ref}`,
        ],
        cwd: clone,
    })
    if (!fetched.ok) {
        return failed({
            ref,
            what: 'fetch the pull request',
            stderr: fetched.stderr,
        })
    }

    if (!(await exists(join(path, '.git')))) {
        await git({ args: ['worktree', 'prune'], cwd: clone })
        const added = await git({
            args: ['worktree', 'add', '--quiet', '--detach', path, head_sha],
            cwd: clone,
        })
        if (!added.ok) {
            return failed({
                ref,
                what: 'make the checkout',
                stderr: added.stderr,
            })
        }
        return { ok: true, path }
    }
    return moveCheckout({ git, ref, path, head_sha })
}

/**
 * Brings the checkout the window shows to `head_sha` when it is somewhere
 * else, such as after the pull request moved: it moves it there, fetching
 * the head first when the checkout doesn't have it, and never moves one
 * with changes that are not committed. A folder that is no git checkout
 * is left as it is.
 *
 * @returns The checkout's folder, or why it is not at the head.
 */
export const checkoutAtHead = async ({
    git,
    walk_dir,
    remote_url,
    ref,
    base_ref,
    head_sha,
}: CheckoutAt): Promise<Prepared> => {
    const path = checkoutPath({ walk_dir, ref })
    if (!(await exists(join(path, '.git')))) return { ok: true, path }
    const known = await git({
        args: ['cat-file', '-e', `${head_sha}^{commit}`],
        cwd: path,
    })
    if (known.ok) return moveCheckout({ git, ref, path, head_sha })
    return prepareCheckout({
        git,
        walk_dir,
        remote_url,
        ref,
        base_ref,
        head_sha,
    })
}
