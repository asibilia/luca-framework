/**
 * Warm builds' reads (#721): a `build_cache_paths` entry's matches in a
 * folder, which of them git ignores, and the real `copy_dir`.
 */
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { GitAdapter } from '../git/git-adapter'
import { runCommand } from '../shell/run-command'

/** What `copy_dir` gives back: done, or the copy's error text. */
export type CopyDirResult = { ok: true } | { ok: false; error: string }

/** Copies the folder `from` to `to`, which doesn't exist yet. */
export type CopyDir = (args: {
    from: string
    to: string
}) => Promise<CopyDirResult>

/** Whether an entry is a glob: it has `*`, `?`, `[` or `{`. Pure. */
export const isGlob = (entry: string): boolean => /[*?[{]/.test(entry)

/**
 * An entry's matches in `dir`, relative to it: a plain path when it is
 * there, or each path a glob matches, folders and dot paths included.
 *
 * @example
 * await matchesIn({ entry: '*\/.build', dir: worktree }) // ['a/.build']
 */
export const matchesIn = async ({
    entry,
    dir,
}: {
    entry: string
    dir: string
}): Promise<string[]> => {
    if (!isGlob(entry)) return existsSync(join(dir, entry)) ? [entry] : []
    if (!existsSync(dir)) return []
    return (
        await Array.fromAsync(
            new Bun.Glob(entry).scan({ cwd: dir, onlyFiles: false, dot: true })
        )
    ).toSorted()
}

/**
 * The paths among `paths` git ignores in `cwd` (`git check-ignore`). A path
 * is asked about as written and as a folder, so a `.gitignore` line such as
 * `cache/` counts for `cache` before the folder is there.
 */
export const ignoredAmong = async ({
    git,
    cwd,
    paths,
}: {
    git: Pick<GitAdapter, 'ignoredPaths'>
    cwd: string
    paths: string[]
}): Promise<Set<string>> => {
    const found = new Set(
        await git.ignoredPaths({
            cwd,
            paths: paths.flatMap((path) => [path, `${path}/`]),
        })
    )
    return new Set(
        paths.filter((path) => found.has(path) || found.has(`${path}/`))
    )
}

/**
 * The real `copy_dir`: an APFS clone (`cp -c -R`) where it can, else what
 * it made is removed and a plain `cp -R` copies it.
 */
export const copyDir: CopyDir = async ({ from, to }) => {
    const cwd = dirname(from)
    const cloned = await runCommand({ cmd: ['cp', '-c', '-R', from, to], cwd })
    if (cloned.exit_code === 0) return { ok: true }
    await rm(to, { recursive: true, force: true })
    const copied = await runCommand({ cmd: ['cp', '-R', from, to], cwd })
    if (copied.exit_code === 0) return { ok: true }
    return {
        ok: false,
        error: (copied.stderr || copied.stdout).trim() || 'cp -R failed',
    }
}
