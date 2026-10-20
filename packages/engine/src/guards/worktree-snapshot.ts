import {
    existsSync,
    lstatSync,
    readdirSync,
    readlinkSync,
    type Stats,
} from 'node:fs'
import { join } from 'node:path'

import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import {
    DELETED,
    watchesIgnored,
    type ConfigEntry,
    type GitState,
    type OutsideGitState,
    type WorktreeState,
} from './after-turn-check'
import {
    commonDirOf,
    excludeArgs,
    excludeRules,
    git,
    gitOk,
    globalExcludesFile,
    nulSplit,
    withExcludeFile,
} from './worktree-git'

import type { EngineConfig } from '../config/engine-config'

/** What the check and the undo of git state need beyond the comparison. */
export type SavedGit = {
    /** The repo's shared `.git` folder. */
    common_dir: string
    /** Every branch and tag, and the commit or tag object it names. */
    refs: Record<string, string>
    /**
     * The ignore rules from before the turn: the global excludes file, then
     * the shared `.git/info/exclude`. The check lists files with these, not
     * the live ones, so an excludes entry added mid-turn hides nothing.
     */
    exclude_rules: Uint8Array
    /** The rest of the shared `.git`, to tell what others changed. */
    outside: OutsideGitState
}

/**
 * A snapshot taken before an agent turn: what the after-turn check compares
 * against, plus what it needs to undo a violation exactly, even on a
 * worktree that was not clean.
 */
export type TurnSnapshot = WorktreeState & {
    /**
     * Bytes of each path in `files` (`null` if it was deleted, or is under
     * `node_modules`, which the engine's install puts back instead).
     */
    saved: Record<string, Uint8Array | null>
    saved_git: SavedGit
}

/**
 * Every changed path: tracked and staged changes (renamed-from paths
 * included), and untracked files the snapshot's rules don't ignore.
 */
const changedPaths = async ({
    cwd,
    exclude_file,
}: {
    cwd: string
    exclude_file: string
}): Promise<string[]> => {
    const [status, others] = await Promise.all([
        gitOk({
            cwd,
            args: ['status', '--porcelain=v1', '-z', '--untracked-files=no'],
        }),
        gitOk({
            cwd,
            args: ['ls-files', '--others', '-z', ...excludeArgs(exclude_file)],
        }),
    ])
    const parts = nulSplit(status)
    const paths: string[] = []
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index] ?? ''
        paths.push(part.slice(3))
        if (part[0] === 'R' || part[0] === 'C') {
            index += 1
            paths.push(parts[index] ?? '')
        }
    }
    return [...paths, ...nulSplit(others)]
}

/** The ignored paths the after-turn check watches (see `watchesIgnored`). */
const watchedIgnoredPaths = async ({
    cwd,
    config,
    exclude_file,
}: {
    cwd: string
    config: EngineConfig
    exclude_file: string
}): Promise<string[]> =>
    nulSplit(
        await gitOk({
            cwd,
            args: [
                'ls-files',
                '--others',
                '--ignored',
                ...excludeArgs(exclude_file),
                '-z',
            ],
        })
    ).filter((path) => watchesIgnored({ path, config }))

/** Whether a worktree-relative path is under a `node_modules` folder. */
export const inPackages = (path: string): boolean =>
    path.split('/').includes('node_modules')

const hashBytes = (bytes: Uint8Array): string => Bun.hash(bytes).toString(16)

/** `lstat`, or `null` when nothing is there. A dangling link still is. */
const lstatOrNull = (full: string): Stats | null => {
    try {
        return lstatSync(full)
    } catch {
        return null
    }
}

/**
 * A path's fingerprint: a file's content hash, a link's target, or
 * `DELETED`. Under `node_modules`, where hashing every file each turn is
 * slow, a file gets its size, inode, and change time instead: writing a
 * file always moves its change time, and no process can set it back.
 */
const hashPath = async ({
    cwd,
    path,
}: {
    cwd: string
    path: string
}): Promise<string> => {
    const full = join(cwd, path)
    const stat = lstatOrNull(full)
    if (stat === null) return DELETED
    if (stat.isSymbolicLink()) return `link:${readlinkSync(full)}`
    if (stat.isDirectory()) return 'dir'
    if (inPackages(path)) {
        const big = lstatSync(full, { bigint: true })
        return `stat:${big.size}:${big.ino}:${big.ctimeNs}:${big.mode}`
    }
    return hashBytes(await Bun.file(full).bytes())
}

/** Name, mode, and content hash of each `.git/hooks` entry. */
const hooksState = async ({
    common_dir,
}: {
    common_dir: string
}): Promise<string[]> => {
    const dir = join(common_dir, 'hooks')
    if (!existsSync(dir)) return ['missing']
    const hooks: string[] = []
    for (const name of sortBy(readdirSync(dir))) {
        const stat = lstatSync(join(dir, name))
        hooks.push(
            `${name} ${stat.mode.toString(8)} ${await hashPath({ cwd: dir, path: name })}`
        )
    }
    return hooks
}

/** Every entry of the shared `.git/config`, in file order, includes not followed. */
const configEntries = async ({
    cwd,
    common_dir,
}: {
    cwd: string
    common_dir: string
}): Promise<ConfigEntry[]> =>
    nulSplit(
        await gitOk({
            cwd,
            args: [
                'config',
                '--file',
                join(common_dir, 'config'),
                '--list',
                '-z',
            ],
        })
    ).map((entry) => {
        const at = entry.indexOf('\n')
        return at === -1
            ? { key: entry, value: null }
            : { key: entry.slice(0, at), value: entry.slice(at + 1) }
    })

/**
 * Whether a config key is in the ticket branch's own section,
 * `branch.<branch>.<name>`. The branch name is matched exactly, and the
 * name after it has no dots, so `branch.a.b.remote` is branch `a.b`'s.
 */
const isOwnKey = ({ key, branch }: { key: string; branch: string }) => {
    const prefix = `branch.${branch}.`
    return key.startsWith(prefix) && !key.slice(prefix.length).includes('.')
}

/** The shared `.git` as the check sees it: the branch's section, and the rest. */
const sharedGitState = async ({
    cwd,
    branch,
    common_dir,
}: {
    cwd: string
    branch: string
    common_dir: string
}): Promise<{ branch_config: ConfigEntry[]; outside: OutsideGitState }> => {
    const [entries, exclude, hooks] = await Promise.all([
        configEntries({ cwd, common_dir }),
        existsSync(join(common_dir, 'info/exclude'))
            ? hashPath({ cwd: common_dir, path: 'info/exclude' })
            : DELETED,
        hooksState({ common_dir }),
    ])
    return {
        branch_config: entries.filter(({ key }) => isOwnKey({ key, branch })),
        outside: {
            config: entries
                .filter(({ key }) => !isOwnKey({ key, branch }))
                .map((entry) => JSON.stringify(entry)),
            exclude,
            hooks,
        },
    }
}

/**
 * Refs this ticket's worktree is not the one to judge: its own branch, and
 * the engine's run branch and other tickets' branches, which the engine
 * moves while agents work.
 */
const isEngineRef = ({ ref, branch }: { ref: string; branch: string }) => {
    const run = branch.replace(/--ticket-\d+$/, '')
    const name = ref.replace(/^refs\/heads\//, '')
    return (
        ref.startsWith('refs/heads/') &&
        (name === branch || name === run || name.startsWith(`${run}--ticket-`))
    )
}

/** Every branch and tag: the object it names, and the commit it peels to. */
const allRefs = async ({
    cwd,
}: {
    cwd: string
}): Promise<{ ref: string; object: string; commit: string }[]> =>
    (
        await gitOk({
            cwd,
            args: [
                'for-each-ref',
                '--format=%(refname) %(objectname) %(*objectname)',
                'refs/heads',
                'refs/tags',
            ],
        })
    )
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
            const [ref = '', object = '', peeled = ''] = line.split(' ')
            return { ref, object, commit: peeled === '' ? object : peeled }
        })

/**
 * The git state an agent must not change, every ref, and the rest of the
 * shared `.git`, which others may change. The reads don't depend on each
 * other, so they run at once.
 */
export const gitState = async ({
    cwd,
    branch,
    common_dir,
}: {
    cwd: string
    branch: string
    common_dir: string
}): Promise<{
    state: GitState
    refs: Record<string, string>
    outside: OutsideGitState
}> => {
    const [headLines, refs, stash, shared, staged] = await Promise.all([
        // The commit HEAD names, then the ref it points at (`HEAD` when
        // detached).
        gitOk({
            cwd,
            args: ['rev-parse', 'HEAD', '--symbolic-full-name', 'HEAD'],
        }),
        allRefs({ cwd }),
        git({ cwd, args: ['stash', 'list', '--format=%H %gs'] }),
        sharedGitState({ cwd, branch, common_dir }),
        gitOk({ cwd, args: ['diff', '--cached', '--name-only', '-z'] }),
    ])
    const [head = '', headRef = ''] = headLines.trim().split('\n')
    const byRef = Object.fromEntries(
        refs.map(({ ref, object }) => [ref, object])
    )
    return {
        outside: shared.outside,
        refs: byRef,
        state: {
            head,
            head_ref: headRef === '' || headRef === 'HEAD' ? null : headRef,
            branch_ref: byRef[`refs/heads/${branch}`] ?? null,
            refs_at_head: sortBy(
                refs
                    .filter(
                        ({ ref, commit }) =>
                            commit === head && !isEngineRef({ ref, branch })
                    )
                    .map(({ ref }) => ref)
            ),
            stash: stash.stdout
                .split('\n')
                .filter((line) => line.includes(`${branch}:`)),
            staged: sortBy(nulSplit(staged)),
            branch_config: shared.branch_config,
        },
    }
}

/**
 * The fingerprint of each changed path, each watched ignored path, and each
 * path in `also` (the paths seen before the turn, so an ignored file that
 * is gone shows as deleted). Ignore rules come from `exclude_file`.
 */
export const fileStates = async ({
    cwd,
    config,
    exclude_file,
    also,
}: {
    cwd: string
    config: EngineConfig
    exclude_file: string
    also?: string[]
}): Promise<Record<string, string>> => {
    const files: Record<string, string> = {}
    const [changed, ignored] = await Promise.all([
        changedPaths({ cwd, exclude_file }),
        watchedIgnoredPaths({ cwd, config, exclude_file }),
    ])
    const paths = uniq([...changed, ...ignored, ...(also ?? [])])
    for (const path of paths) {
        files[path] = await hashPath({ cwd, path })
    }
    return files
}

/**
 * Snapshots a worktree before an agent turn: each changed path's content
 * hash and bytes, the ignored paths that matter, and the git state no agent
 * may change, with what it takes to put that back.
 *
 * @example
 * const before = await snapshotWorktree({ cwd, branch, config })
 * // ... the agent works ...
 * const { violations } = await enforceAfterTurn({ cwd, branch, role, may_edit_tests, config, before })
 */
export const snapshotWorktree = async ({
    cwd,
    branch,
    config,
}: {
    cwd: string
    branch: string
    config: EngineConfig
}): Promise<TurnSnapshot> => {
    const [common_dir, global] = await Promise.all([
        commonDirOf({ cwd }),
        globalExcludesFile({ cwd }),
    ])
    const exclude_rules = await excludeRules({ global, common_dir })
    const [files, { state, refs, outside }] = await Promise.all([
        withExcludeFile({
            rules: exclude_rules,
            use: (exclude_file) => fileStates({ cwd, config, exclude_file }),
        }),
        gitState({ cwd, branch, common_dir }),
    ])
    const saved: Record<string, Uint8Array | null> = {}
    for (const [path, hash] of Object.entries(files)) {
        const full = join(cwd, path)
        const plain =
            hash !== DELETED && !inPackages(path) && lstatSync(full).isFile()
        saved[path] = plain ? await Bun.file(full).bytes() : null
    }
    return {
        files,
        saved,
        git: state,
        saved_git: { common_dir, refs, exclude_rules, outside },
    }
}
