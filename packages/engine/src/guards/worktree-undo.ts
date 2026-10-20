import { existsSync, readdirSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import uniq from 'lodash/uniq'

import { refsMadeInTurn, type GitState } from './after-turn-check'
import { git, gitOk } from './worktree-git'
import type { SavedGit, TurnSnapshot } from './worktree-snapshot'

import { FROZEN_INSTALL } from '../gates/lockfile-install'
import { runShell } from '../shell/run-command'

/**
 * Takes a ref an agent made off, keeping its commit under `refs/luca-undone/`
 * so nothing is lost: the refs are shared, and the engine can't tell who
 * made one. A ref that existed before goes back to where it was.
 */
const undoRef = async ({
    cwd,
    ref,
    before,
}: {
    cwd: string
    ref: string
    before: string | undefined
}): Promise<void> => {
    const now = await git({ cwd, args: ['rev-parse', '--verify', '-q', ref] })
    if (!now.ok) return
    const object = now.stdout.trim()
    if (before !== undefined) {
        await gitOk({ cwd, args: ['update-ref', ref, before, object] })
        return
    }
    const kept = ref.replace(/^refs\//, 'refs/luca-undone/')
    await gitOk({ cwd, args: ['update-ref', kept, object] })
    await gitOk({ cwd, args: ['update-ref', '-d', ref, object] })
}

/**
 * Drops the stash entries an agent made. The stash is shared, so each is
 * found by its commit just before it is dropped, newest first.
 */
const dropStashes = async ({
    cwd,
    entries,
}: {
    cwd: string
    entries: string[]
}): Promise<void> => {
    const shas = entries.map((entry) => entry.split(' ')[0] ?? '')
    for (const sha of shas) {
        const list = await git({ cwd, args: ['stash', 'list', '--format=%H'] })
        const index = list.stdout.split('\n').indexOf(sha)
        if (index !== -1) {
            await gitOk({
                cwd,
                args: ['stash', 'drop', '-q', `stash@{${index}}`],
            })
        }
    }
}

/**
 * Whether HEAD is now a commit made during the turn: it moved, to a commit
 * no ref named before the turn and that the old HEAD doesn't contain.
 */
export const headIsNew = async ({
    cwd,
    before,
    after,
    saved,
}: {
    cwd: string
    before: GitState
    after: GitState
    saved: SavedGit
}): Promise<boolean> => {
    if (after.head === before.head || after.head === '') return false
    if (Object.values(saved.refs).includes(after.head)) return false
    const older = await git({
        cwd,
        args: ['merge-base', '--is-ancestor', after.head, before.head],
    })
    return !older.ok
}

/**
 * Puts HEAD, the branch, the index, the refs the agent made, and stashes
 * back; the files stay.
 */
export const restoreGit = async ({
    cwd,
    branch,
    before,
    after,
    saved,
    head_is_new,
}: {
    cwd: string
    branch: string
    before: GitState
    after: GitState
    saved: SavedGit
    head_is_new: boolean
}): Promise<void> => {
    if (before.head_ref !== null) {
        await gitOk({ cwd, args: ['symbolic-ref', 'HEAD', before.head_ref] })
    }
    // A mixed reset: HEAD and the branch go back, the index is emptied of
    // the agent's staging, and the files in the worktree are left alone.
    await gitOk({ cwd, args: ['reset', '-q', before.head] })
    if (before.branch_ref !== null) {
        await gitOk({
            cwd,
            args: ['update-ref', `refs/heads/${branch}`, before.branch_ref],
        })
    }
    for (const ref of refsMadeInTurn({ before, after, head_is_new })) {
        await undoRef({ cwd, ref, before: saved.refs[ref] })
    }
    await dropStashes({
        cwd,
        entries: after.stash.filter((entry) => !before.stash.includes(entry)),
    })
}

/** Puts one path back how it was before the turn. */
export const restorePath = async ({
    cwd,
    path,
    before,
}: {
    cwd: string
    path: string
    before: TurnSnapshot
}): Promise<void> => {
    const full = join(cwd, path)
    const bytes = before.saved[path]
    if (bytes !== undefined && bytes !== null) {
        await mkdir(dirname(full), { recursive: true })
        await rm(full, { force: true, recursive: true })
        await Bun.write(full, bytes)
        return
    }
    if (bytes === undefined) {
        const tracked = await git({
            cwd,
            args: ['cat-file', '-e', `${before.git.head}:${path}`],
        })
        if (tracked.ok) {
            await rm(full, { force: true, recursive: true })
            await gitOk({
                cwd,
                args: ['checkout', before.git.head, '--', path],
            })
            await gitOk({ cwd, args: ['reset', '-q', '--', path] })
            return
        }
    }
    await rm(full, { force: true, recursive: true })
    await pruneEmptyFolders({ cwd, path })
}

/** Removes the folders a new path left empty, up to the worktree. */
const pruneEmptyFolders = async ({
    cwd,
    path,
}: {
    cwd: string
    path: string
}): Promise<void> => {
    for (let folder = dirname(path); folder !== '.'; folder = dirname(folder)) {
        const full = join(cwd, folder)
        if (!existsSync(full) || readdirSync(full).length > 0) return
        await rm(full, { recursive: true, force: true })
    }
}

/**
 * The package folder a path under `node_modules` belongs to, such as
 * `node_modules/@scope/name` for `node_modules/@scope/name/lib/a.js`.
 */
const packageFolder = (path: string): string => {
    const parts = path.split('/')
    const at = parts.lastIndexOf('node_modules')
    const scoped = parts[at + 1]?.startsWith('@') === true
    return parts.slice(0, at + (scoped ? 3 : 2)).join('/')
}

/**
 * Puts back files an agent changed or deleted under `node_modules`. Their
 * bytes are not kept (there are too many), so each package they belong to
 * is removed and the engine's own install puts it back from the lockfile.
 *
 * @returns Why the install failed, or `null`.
 */
export const reinstallPackages = async ({
    cwd,
    paths,
}: {
    cwd: string
    paths: string[]
}): Promise<string | null> => {
    for (const folder of uniq(paths.map(packageFolder))) {
        await rm(join(cwd, folder), { force: true, recursive: true })
    }
    const result = await runShell({ command: FROZEN_INSTALL, cwd })
    return result.exit_code === 0
        ? null
        : `the engine's install (${FROZEN_INSTALL}) failed, so node_modules may still hold what the agent changed:\n${result.stderr || result.stdout}`
}

/**
 * Puts the ticket branch's own config section back, key by key: each of its
 * keys now there is unset, then each saved entry is added back in order.
 * Every other key in the shared `.git/config` stays as it is now, since
 * other processes write there too. A key with no value comes back as
 * `true`, which git reads the same.
 *
 * @returns Why the undo failed (such as another process holding the
 *   config's lock), or `null`.
 */
export const restoreBranchConfig = async ({
    cwd,
    before,
    after,
    common_dir,
}: {
    cwd: string
    before: GitState
    after: GitState
    common_dir: string
}): Promise<string | null> => {
    const file = join(common_dir, 'config')
    const steps = [
        ...uniq(after.branch_config.map(({ key }) => key)).map((key) => [
            'config',
            '--file',
            file,
            '--unset-all',
            key,
        ]),
        ...before.branch_config.map(({ key, value }) => [
            'config',
            '--file',
            file,
            '--add',
            key,
            value ?? 'true',
        ]),
    ]
    for (const args of steps) {
        const result = await git({ cwd, args })
        if (!result.ok) {
            return `git ${args.join(' ')} failed, so the ticket branch's settings in the shared .git/config may still hold what the agent changed`
        }
    }
    return null
}
