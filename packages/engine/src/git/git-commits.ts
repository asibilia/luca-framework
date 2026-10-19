/**
 * The git adapter's commits and clean-ups: stage and commit all or some
 * paths, read the last commit, throw away or reset a worktree's changes, and
 * push. Every call skips hooks: the engine ran the gates.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { GitAdapter } from './git-adapter'
import { gitOk, gitRun, head, lines } from './git-run'

/**
 * Stages every change at `cwd` (`git add -A`) but the paths in `leave_out`,
 * which git never looks at: each is an exact, literal pathspec to exclude,
 * passed through a file so any number of them fit.
 */
export const stageAll = async ({
    cwd,
    leave_out,
}: {
    cwd: string
    leave_out: string[]
}): Promise<void> => {
    if (leave_out.length === 0) {
        await gitOk({ cwd, args: ['add', '-A'] })
        return
    }
    const folder = await mkdtemp(join(tmpdir(), 'luca-stage-'))
    try {
        const pathspecs = join(folder, 'pathspecs')
        await Bun.write(
            pathspecs,
            ['.', ...leave_out.map((path) => `:(exclude,literal)${path}`)]
                .map((spec) => `${spec}\0`)
                .join('')
        )
        await gitOk({
            cwd,
            args: [
                'add',
                '-A',
                `--pathspec-from-file=${pathspecs}`,
                '--pathspec-file-nul',
            ],
        })
    } finally {
        await rm(folder, { recursive: true, force: true })
    }
}

export const filesOf = async ({ cwd, sha }: { cwd: string; sha: string }) =>
    lines(
        await gitOk({
            cwd,
            args: ['show', '--name-only', '--format=', sha],
        })
    ).toSorted()

export const commitOps: Pick<
    GitAdapter,
    | 'commitAll'
    | 'commitPaths'
    | 'discardChanges'
    | 'resetWorktree'
    | 'push'
    | 'lastCommit'
> = {
    commitAll: async ({ cwd, message, leave_out }) => {
        await stageAll({ cwd, leave_out: leave_out ?? [] })
        await gitOk({
            cwd,
            args: ['commit', '--quiet', '--no-verify', '-m', message],
        })
        const sha = await head({ cwd })
        return { sha, files: await filesOf({ cwd, sha }) }
    },
    commitPaths: async ({ cwd, message, paths }) => {
        const pathspecs = paths.map((path) => `:(literal)${path}`)
        await gitOk({ cwd, args: ['add', '--', ...pathspecs] })
        // With paths, `git commit` commits just them (`--only`).
        await gitOk({
            cwd,
            args: [
                'commit',
                '--quiet',
                '--no-verify',
                '-m',
                message,
                '--',
                ...pathspecs,
            ],
        })
        const sha = await head({ cwd })
        return { sha, files: await filesOf({ cwd, sha }) }
    },
    discardChanges: async ({ cwd }) => {
        await gitOk({ cwd, args: ['reset', '--quiet', '--hard', 'HEAD'] })
        await gitOk({ cwd, args: ['clean', '--quiet', '-f', '-d'] })
        return { sha: await head({ cwd }) }
    },
    resetWorktree: async ({ cwd, to }) => {
        // A cherry-pick a crash cut off leaves its sequence behind.
        await gitRun({ cwd, args: ['cherry-pick', '--quit'] })
        await gitOk({ cwd, args: ['reset', '--quiet', '--hard', to] })
        await gitOk({ cwd, args: ['clean', '--quiet', '-f', '-d'] })
        return { sha: await head({ cwd }) }
    },
    push: async ({ cwd, branch }) => {
        await gitOk({
            cwd,
            args: [
                'push',
                '--quiet',
                'origin',
                `${branch}:refs/heads/${branch}`,
            ],
        })
    },
    lastCommit: async ({ cwd }) => {
        const sha = await head({ cwd })
        const message = await gitOk({
            cwd,
            args: ['log', '-1', '--format=%B', sha],
        })
        return {
            sha,
            message: message.trim(),
            files: await filesOf({ cwd, sha }),
        }
    },
}
