import { existsSync, realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

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
    /**
     * Makes `branch` from `base_branch`, checked out in a worktree at `path`.
     * Safe to repeat, as `createWorktree`.
     */
    createRunBranch: (args: {
        branch: string
        base_branch: string
        path: string
    }) => Promise<{ base_sha: string }>
    /**
     * Makes `branch` from the tip of `from`, checked out at `path`. Safe to
     * repeat after a crash: a worktree git has at `path` on `branch` is
     * adopted as it is (reset to its commit, in case its checkout was cut
     * off); a folder at `path` git doesn't know is removed first; and a
     * `branch` that exists without a worktree is checked out there as it is.
     */
    createWorktree: (args: {
        branch: string
        from: string
        path: string
    }) => Promise<{ base_sha: string }>
    /** Every changed, new, or deleted path in a worktree, untracked included. */
    changes: (args: { cwd: string }) => Promise<FileChange[]>
    /**
     * Paths that differ from commit `from`, committed or not, untracked
     * included.
     */
    changedSince: (args: { cwd: string; from: string }) => Promise<string[]>
    /** Paths that differ between two commits. */
    filesBetween: (args: {
        cwd: string
        from: string
        to: string
    }) => Promise<string[]>
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
    /**
     * Resets the worktree at `cwd` hard to `to`, moving its branch there, and
     * throws away untracked files (ignored ones are kept), as when a
     * retried ticket starts over from the run branch's tip.
     */
    resetWorktree: (args: {
        cwd: string
        to: string
    }) => Promise<{ sha: string }>
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
    /**
     * Undoes a replay on the branch checked out at `cwd`: resets it hard to
     * the commit before `first_sha`. Safe to run twice.
     *
     * @returns The commits it undid, oldest first.
     */
    undoReplay: (args: {
        cwd: string
        first_sha: string
    }) => Promise<{ undone: string[] }>
    /**
     * Moves a worktree's change onto another commit: resets the worktree at
     * `cwd` hard to `onto`, then applies the whole diff from `from` to `to`
     * with a three-way merge, and leaves it all uncommitted and unstaged.
     * Clashing files keep git's conflict markers.
     *
     * @returns The files that clashed.
     */
    rebaseWorktree: (args: {
        cwd: string
        from: string
        to: string
        onto: string
    }) => Promise<{ conflicts: string[] }>
    /**
     * Removes the worktree at `path`, even with changes in it. A path that
     * is already gone, or is no worktree, is fine. Its branch stays.
     */
    removeWorktree: (args: { path: string }) => Promise<void>
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
 * Runs async work one piece at a time, in call order, so git never races
 * itself on the repo's lock files when tickets build at the same time.
 */
const createQueue = () => {
    let tail: Promise<unknown> = Promise.resolve()
    return <T>(work: () => Promise<T>): Promise<T> => {
        const run = tail.then(work, work)
        tail = run.catch(() => undefined)
        return run
    }
}

/**
 * The git adapter for the repo at `repo_root`, through the `git` CLI. Its
 * calls run one at a time, even when tickets build at the same time.
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

    const raw: GitAdapter = {
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
        filesBetween: async ({ cwd, from, to }) =>
            lines(
                await gitOk({ cwd, args: ['diff', '--name-only', from, to] })
            ).toSorted(),
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
        resetWorktree: async ({ cwd, to }) => {
            await gitOk({ cwd, args: ['reset', '--quiet', '--hard', to] })
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
        undoReplay: async ({ cwd, first_sha }) => {
            const before = `${first_sha}^`
            const undone = lines(
                await gitOk({
                    cwd,
                    args: ['rev-list', '--reverse', `${before}..HEAD`],
                })
            )
            await gitOk({ cwd, args: ['reset', '--quiet', '--hard', before] })
            return { undone }
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

    const inTurn = createQueue()
    const serial =
        <A, R>(work: (args: A) => Promise<R>) =>
        (args: A): Promise<R> =>
            inTurn(() => work(args))
    return {
        createRunBranch: serial(raw.createRunBranch),
        createWorktree: serial(raw.createWorktree),
        changes: serial(raw.changes),
        changedSince: serial(raw.changedSince),
        filesBetween: serial(raw.filesBetween),
        listFiles: serial(raw.listFiles),
        filesMentioning: serial(raw.filesMentioning),
        commitAll: serial(raw.commitAll),
        discardChanges: serial(raw.discardChanges),
        resetWorktree: serial(raw.resetWorktree),
        commitsBetween: serial(raw.commitsBetween),
        replay: serial(raw.replay),
        undoReplay: serial(raw.undoReplay),
        rebaseWorktree: serial(raw.rebaseWorktree),
        removeWorktree: serial(raw.removeWorktree),
        push: serial(raw.push),
        head: serial(raw.head),
    }
}
