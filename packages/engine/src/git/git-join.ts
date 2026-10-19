/**
 * The git adapter's moves between branches: list the commits between two,
 * replay them onto the run branch, undo a replay, and move a worktree's
 * change onto another commit.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { GitAdapter } from './git-adapter'
import { gitOk, gitRun, head, lines } from './git-run'

export const joinOps: Pick<
    GitAdapter,
    'commitsBetween' | 'replay' | 'undoReplay' | 'rebaseWorktree'
> = {
    commitsBetween: async ({ cwd, from, to }) =>
        lines(
            await gitOk({
                cwd,
                args: ['rev-list', '--reverse', `${from}..${to}`],
            })
        ),
    replay: async ({ cwd, commits }) => {
        const before = await head({ cwd })
        const picked = await gitRun({
            cwd,
            args: ['cherry-pick', ...commits],
        })
        if (picked.exit_code !== 0) {
            await gitRun({ cwd, args: ['cherry-pick', '--abort'] })
            return { ok: false, error: picked.stderr || picked.stdout }
        }
        return {
            ok: true,
            shas: lines(
                await gitOk({
                    cwd,
                    args: ['rev-list', '--reverse', `${before}..HEAD`],
                })
            ),
        }
    },
    undoReplay: async ({ cwd, first_sha, only }) => {
        const short = first_sha.slice(0, 7)
        const parent = await gitRun({
            cwd,
            args: [
                'rev-parse',
                '--verify',
                '--quiet',
                `${first_sha}^{commit}^`,
            ],
        })
        if (parent.exit_code !== 0) {
            return {
                ok: false,
                error: `Commit ${short} is not in the repo (or has no parent), so there is no join to undo.`,
            }
        }
        const before = parent.stdout.trim()
        const tip = await head({ cwd })
        const ancestor = await gitRun({
            cwd,
            args: ['merge-base', '--is-ancestor', first_sha, 'HEAD'],
        })
        if (ancestor.exit_code !== 0) {
            // Already undone, such as a redo after a crash.
            if (tip === before) return { ok: true, undone: [] }
            return {
                ok: false,
                error: `Commit ${short} is not on the branch, so undoing it (a reset to its parent) would rewind the branch over other work.`,
            }
        }
        const undone = lines(
            await gitOk({
                cwd,
                args: ['rev-list', '--reverse', `${before}..HEAD`],
            })
        )
        const others = undone.filter((sha) => !only.includes(sha))
        if (others.length > 0) {
            return {
                ok: false,
                error: `Undoing ${short} would also undo other work on top of it: ${others.map((sha) => sha.slice(0, 7)).join(', ')}.`,
            }
        }
        await gitOk({ cwd, args: ['reset', '--quiet', '--hard', before] })
        return { ok: true, undone }
    },
    rebaseWorktree: async ({ cwd, from, to, onto }) => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-rebase-'))
        try {
            const patch = join(folder, 'change.patch')
            await gitOk({
                cwd,
                args: ['diff', '--binary', `--output=${patch}`, from, to],
            })
            await gitOk({ cwd, args: ['reset', '--quiet', '--hard', onto] })
            if ((await Bun.file(patch).size) === 0) return { conflicts: [] }
            const applied = await gitRun({
                cwd,
                args: ['apply', '--3way', patch],
            })
            const conflicts = lines(
                await gitOk({
                    cwd,
                    args: ['diff', '--name-only', '--diff-filter=U'],
                })
            ).toSorted()
            if (applied.exit_code !== 0 && conflicts.length === 0) {
                throw new Error(
                    `git apply --3way failed in ${cwd}:\n${applied.stderr || applied.stdout}`
                )
            }
            // Everything becomes plain uncommitted changes, markers kept.
            await gitOk({ cwd, args: ['reset', '--quiet'] })
            return { conflicts }
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    },
}
