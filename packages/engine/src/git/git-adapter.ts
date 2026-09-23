import sortBy from 'lodash/sortBy'

import { runCommand } from '../shell/run-command'

/** One changed path in a worktree, from `git status`. */
export type FileChange = {
    path: string
    change: 'added' | 'modified' | 'deleted'
}

/** A commit the engine made. */
export type EngineCommit = { sha: string; files: string[] }

/**
 * Every git side effect of a run. Only the engine calls these; agents never
 * commit, branch, or push.
 */
export type GitAdapter = {
    /** Makes `branch` from `base_branch`, checked out in a worktree at `path`. */
    createRunBranch: (args: {
        branch: string
        base_branch: string
        path: string
    }) => Promise<{ base_sha: string }>
    /** Makes `branch` from the tip of `from`, checked out at `path`. */
    createWorktree: (args: {
        branch: string
        from: string
        path: string
    }) => Promise<{ base_sha: string }>
    /** Every changed, new, or deleted path in a worktree, untracked included. */
    changes: (args: { cwd: string }) => Promise<FileChange[]>
    /** Tracked and untracked files, minus ignored ones. */
    listFiles: (args: { cwd: string }) => Promise<string[]>
    /** Tracked files whose text contains `text`. */
    filesMentioning: (args: { cwd: string; text: string }) => Promise<string[]>
    /** Stages everything and commits it, skipping hooks (the engine ran the gates). */
    commitAll: (args: { cwd: string; message: string }) => Promise<EngineCommit>
    /**
     * Throws away every uncommitted change at `cwd`, new untracked files
     * included (ignored files such as `node_modules` stay), and returns the
     * commit it went back to.
     */
    discardChanges: (args: { cwd: string }) => Promise<{ sha: string }>
    /** Commits after `from` up to `to`, oldest first. */
    commitsBetween: (args: {
        cwd: string
        from: string
        to: string
    }) => Promise<string[]>
    /**
     * Replays commits onto the branch checked out at `cwd`, in order. A clash
     * is undone and returned as an error.
     */
    replay: (args: {
        cwd: string
        commits: string[]
    }) => Promise<{ ok: true; shas: string[] } | { ok: false; error: string }>
    /** Pushes `branch` to `origin`. */
    push: (args: { cwd: string; branch: string }) => Promise<void>
    /** The commit checked out at `cwd`. */
    head: (args: { cwd: string }) => Promise<string>
}

const gitRun = ({ cwd, args }: { cwd: string; args: string[] }) =>
    runCommand({ cmd: ['git', ...args], cwd, timeout_ms: 120_000 })

const gitOk = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<string> => {
    const result = await gitRun({ cwd, args })
    if (result.exit_code !== 0) {
        throw new Error(
            `git ${args.join(' ')} failed in ${cwd}:\n${result.stderr || result.stdout}`
        )
    }
    return result.stdout
}

const lines = (text: string): string[] =>
    text.split('\n').filter((line) => line.trim() !== '')

/** Parses `git status --porcelain=v1 -z --untracked-files=all`. */
const parseStatus = ({ text }: { text: string }): FileChange[] => {
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

/**
 * The git adapter for the repo at `repo_root`, through the `git` CLI.
 *
 * @example
 * const git = createGitAdapter({ repo_root: '/code/app' })
 * const { base_sha } = await git.createRunBranch({ branch, base_branch: 'main', path })
 */
export const createGitAdapter = ({
    repo_root,
}: {
    repo_root: string
}): GitAdapter => {
    const head = async ({ cwd }: { cwd: string }) =>
        (await gitOk({ cwd, args: ['rev-parse', 'HEAD'] })).trim()

    const addWorktree = async ({
        branch,
        from,
        path,
    }: {
        branch: string
        from: string
        path: string
    }) => {
        await gitOk({
            cwd: repo_root,
            args: [
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
        createRunBranch: ({ branch, base_branch, path }) =>
            addWorktree({ branch, from: base_branch, path }),
        createWorktree: addWorktree,
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
        commitAll: async ({ cwd, message }) => {
            await gitOk({ cwd, args: ['add', '-A'] })
            await gitOk({
                cwd,
                args: ['commit', '--quiet', '--no-verify', '-m', message],
            })
            const sha = await head({ cwd })
            const files = lines(
                await gitOk({
                    cwd,
                    args: ['show', '--name-only', '--format=', sha],
                })
            )
            return { sha, files: files.toSorted() }
        },
        discardChanges: async ({ cwd }) => {
            await gitOk({ cwd, args: ['reset', '--quiet', '--hard', 'HEAD'] })
            await gitOk({ cwd, args: ['clean', '--quiet', '-f', '-d'] })
            return { sha: await head({ cwd }) }
        },
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
        head,
    }
}
