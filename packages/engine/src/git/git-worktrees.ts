/**
 * The git adapter's worktrees: fetch the base branch, make the run branch and
 * each ticket's worktree (safe to repeat after a crash), and remove them.
 * These are the calls that need the repo's root.
 */
import { existsSync, realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'

import type { GitAdapter } from './git-adapter'
import { gitOk, gitRun, head, lines } from './git-run'

export const createWorktreeOps = ({
    repo_root,
}: {
    repo_root: string
}): Pick<
    GitAdapter,
    'fetchBase' | 'createRunBranch' | 'createWorktree' | 'removeWorktree'
> => {
    /** The branch git has checked out in a worktree at `path`, if any. */
    const worktreeBranchAt = async ({
        path,
    }: {
        path: string
    }): Promise<{ branch: string | null } | null> => {
        if (!existsSync(path)) return null
        const wanted = realpathSync(path)
        const listed = await gitOk({
            cwd: repo_root,
            args: ['worktree', 'list', '--porcelain'],
        })
        for (const block of listed.split('\n\n')) {
            const fields = lines(block)
            const at = fields
                .find((line) => line.startsWith('worktree '))
                ?.slice('worktree '.length)
            if (at === undefined || !existsSync(at)) continue
            if (realpathSync(at) !== wanted) continue
            const ref = fields
                .find((line) => line.startsWith('branch '))
                ?.slice('branch '.length)
            return { branch: ref?.replace(/^refs\/heads\//, '') ?? null }
        }
        return null
    }

    const branchExists = async ({ branch }: { branch: string }) =>
        (
            await gitRun({
                cwd: repo_root,
                args: [
                    'rev-parse',
                    '--verify',
                    '--quiet',
                    `refs/heads/${branch}`,
                ],
            })
        ).exit_code === 0

    const addWorktree = async ({
        branch,
        from,
        path,
    }: {
        branch: string
        from: string
        path: string
    }) => {
        const known = await worktreeBranchAt({ path })
        if (known !== null && known.branch !== branch) {
            throw new Error(
                `${path} is already a worktree on ${known.branch ?? 'no branch'}, not ${branch}.`
            )
        }
        if (known !== null) {
            // Made before a crash: nothing has worked in it since, so finish
            // a checkout the crash may have cut off, and adopt it.
            const reset = await gitRun({
                cwd: path,
                args: ['reset', '--quiet', '--hard', 'HEAD'],
            })
            if (reset.exit_code === 0) {
                return { base_sha: await head({ cwd: path }) }
            }
            await gitRun({
                cwd: repo_root,
                args: ['worktree', 'remove', '--force', '--force', path],
            })
        }
        // A half-made folder git doesn't know (or no longer does) goes.
        await rm(path, { recursive: true, force: true })
        await gitOk({ cwd: repo_root, args: ['worktree', 'prune'] })
        await gitOk({
            cwd: repo_root,
            args: (await branchExists({ branch }))
                ? ['worktree', 'add', '--quiet', path, branch]
                : [
                      'worktree',
                      'add',
                      '--quiet',
                      '--no-track',
                      '-b',
                      branch,
                      path,
                      from,
                  ],
        })
        return { base_sha: await head({ cwd: path }) }
    }

    return {
        fetchBase: async ({ base_branch }) => {
            const fetched = await gitRun({
                cwd: repo_root,
                args: [
                    'fetch',
                    '--quiet',
                    'origin',
                    `+refs/heads/${base_branch}:refs/remotes/origin/${base_branch}`,
                ],
            })
            return fetched.exit_code === 0
                ? { ok: true }
                : {
                      ok: false,
                      error: (fetched.stderr || fetched.stdout).trim(),
                  }
        },
        createRunBranch: ({ branch, base_branch, path }) =>
            addWorktree({ branch, from: `origin/${base_branch}`, path }),
        createWorktree: addWorktree,
        removeWorktree: async ({ path }) => {
            if (existsSync(path)) {
                // A folder that is no worktree (or not any more) is fine.
                await gitRun({
                    cwd: repo_root,
                    args: ['worktree', 'remove', '--force', path],
                })
            }
            await gitOk({ cwd: repo_root, args: ['worktree', 'prune'] })
        },
    }
}
