/**
 * The git adapter's reads: what changed in a worktree or between commits,
 * which files exist, and where a commit is. None of them changes the repo.
 */
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import type { FileChange, GitAdapter } from './git-adapter'
import { gitOk, gitRun, head, lines } from './git-run'

/** A full or short commit id, in hex. Anything else is no commit id. */
const COMMIT_ID = /^[0-9a-f]{4,64}$/i

/** Parses `git status --porcelain=v1 -z --untracked-files=all`. */
export const parseStatus = ({ text }: { text: string }): FileChange[] => {
    const parts = text.split('\0').filter((part) => part.length > 0)
    const changes: FileChange[] = []
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index] ?? ''
        const [x = ' ', y = ' '] = part
        const path = part.slice(3)
        if (x === 'R' || x === 'C') index += 1 // the next part is the old path
        if (x === 'D' || y === 'D') changes.push({ path, change: 'deleted' })
        else if (x === '?' || x === 'A' || x === 'R' || x === 'C')
            changes.push({ path, change: 'added' })
        else changes.push({ path, change: 'modified' })
    }
    return sortBy(changes, 'path')
}

export const readOps: Pick<
    GitAdapter,
    | 'changes'
    | 'changedSince'
    | 'fileAt'
    | 'filesBetween'
    | 'untracked'
    | 'listFiles'
    | 'filesMentioning'
    | 'head'
    | 'commitOnBase'
> = {
    changes: async ({ cwd }) =>
        parseStatus({
            text: await gitOk({
                cwd,
                args: [
                    'status',
                    '--porcelain=v1',
                    '-z',
                    '--untracked-files=all',
                ],
            }),
        }),
    changedSince: async ({ cwd, from }) => {
        const tracked = lines(
            await gitOk({ cwd, args: ['diff', '--name-only', from] })
        )
        const untracked = lines(
            await gitOk({
                cwd,
                args: ['ls-files', '--others', '--exclude-standard'],
            })
        )
        return uniq([...tracked, ...untracked]).toSorted()
    },
    fileAt: async ({ cwd, sha, path }) => {
        const result = await gitRun({
            cwd,
            args: ['show', `${sha}:${path}`],
        })
        return result.exit_code === 0 ? result.stdout : null
    },
    filesBetween: async ({ cwd, from, to }) =>
        lines(
            await gitOk({ cwd, args: ['diff', '--name-only', from, to] })
        ).toSorted(),
    untracked: async ({ cwd }) =>
        (
            await gitOk({
                cwd,
                args: ['ls-files', '--others', '--exclude-standard', '-z'],
            })
        )
            .split('\0')
            .filter((path) => path !== ''),
    listFiles: async ({ cwd }) =>
        lines(
            await gitOk({
                cwd,
                args: [
                    'ls-files',
                    '--cached',
                    '--others',
                    '--exclude-standard',
                ],
            })
        ),
    filesMentioning: async ({ cwd, text }) => {
        // git grep exits 1 when nothing matches; that is an empty answer.
        const result = await gitRun({
            cwd,
            args: ['grep', '-l', '-F', '-e', text, '--', '.'],
        })
        return result.exit_code === 0 ? lines(result.stdout) : []
    },
    head,
    commitOnBase: async ({ cwd, sha, base }) => {
        if (!COMMIT_ID.test(sha)) return 'unknown'
        const found = await gitRun({
            cwd,
            args: ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`],
        })
        if (found.exit_code !== 0) return 'unknown'
        const args = ['merge-base', '--is-ancestor', sha, base]
        const ancestor = await gitRun({ cwd, args })
        if (ancestor.exit_code === 0) return 'on_base'
        if (ancestor.exit_code === 1) return 'not_on_base'
        throw new Error(
            `git ${args.join(' ')} failed in ${cwd}:\n${ancestor.stderr || ancestor.stdout}`
        )
    },
}
