import {
    existsSync,
    lstatSync,
    readdirSync,
    readlinkSync,
    type Stats,
} from 'node:fs'
import { chmod, mkdir, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import {
    DELETED,
    gitViolations,
    pathViolations,
    watchesIgnored,
    type GitState,
    type Violation,
    type WorktreeState,
} from './after-turn-check'
import type { GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'
import { FROZEN_INSTALL } from '../gates/lockfile-install'
import { runCommand, runShell } from '../shell/run-command'

/** A file in the shared `.git` as it was: its bytes and mode, or a link. */
type SavedFile =
    | { kind: 'file'; bytes: Uint8Array; mode: number }
    | { kind: 'link'; target: string }
    | { kind: 'missing' }

/** What the undo of git state needs that the comparison does not. */
type SavedGit = {
    /** The repo's shared `.git` folder. */
    common_dir: string
    /** Every branch and tag, and the commit or tag object it names. */
    refs: Record<string, string>
    config: SavedFile
    exclude: SavedFile
    /** Each entry of `.git/hooks`, by name. */
    hooks: Record<string, SavedFile>
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

const git = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<{ ok: boolean; stdout: string }> => {
    const result = await runCommand({
        cmd: ['git', ...args],
        cwd,
        timeout_ms: 60_000,
    })
    return { ok: result.exit_code === 0, stdout: result.stdout }
}

const gitOk = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<string> => {
    const result = await runCommand({
        cmd: ['git', ...args],
        cwd,
        timeout_ms: 60_000,
    })
    if (result.exit_code !== 0) {
        throw new Error(
            `git ${args.join(' ')} failed in ${cwd}:\n${result.stderr || result.stdout}`
        )
    }
    return result.stdout
}

const nulSplit = (text: string): string[] =>
    text.split('\0').filter((part) => part.length > 0)

/** Every path `git status` lists, renamed-from paths included. */
const statusPaths = async ({ cwd }: { cwd: string }): Promise<string[]> => {
    const parts = nulSplit(
        await gitOk({
            cwd,
            args: ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
        })
    )
    const paths: string[] = []
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index] ?? ''
        paths.push(part.slice(3))
        if (part[0] === 'R' || part[0] === 'C') {
            index += 1
            paths.push(parts[index] ?? '')
        }
    }
    return paths
}

/** The ignored paths the after-turn check watches (see `watchesIgnored`). */
const watchedIgnoredPaths = async ({
    cwd,
    config,
}: {
    cwd: string
    config: EngineConfig
}): Promise<string[]> =>
    nulSplit(
        await gitOk({
            cwd,
            args: [
                'ls-files',
                '--others',
                '--ignored',
                '--exclude-standard',
                '-z',
            ],
        })
    ).filter((path) => watchesIgnored({ path, config }))

/** Whether a worktree-relative path is under a `node_modules` folder. */
const inPackages = (path: string): boolean =>
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

const saveFile = async (full: string): Promise<SavedFile> => {
    const stat = lstatOrNull(full)
    if (stat === null) return { kind: 'missing' }
    if (stat.isSymbolicLink())
        return { kind: 'link', target: readlinkSync(full) }
    return {
        kind: 'file',
        bytes: await Bun.file(full).bytes(),
        mode: stat.mode,
    }
}

const writeSaved = async ({
    full,
    saved,
}: {
    full: string
    saved: SavedFile
}): Promise<void> => {
    await rm(full, { force: true, recursive: true })
    if (saved.kind === 'missing') return
    await mkdir(dirname(full), { recursive: true })
    if (saved.kind === 'link') {
        await symlink(saved.target, full)
        return
    }
    await Bun.write(full, saved.bytes)
    await chmod(full, saved.mode & 0o7777)
}

const hashSaved = (saved: SavedFile): string => {
    if (saved.kind === 'missing') return 'missing'
    if (saved.kind === 'link') return `link:${saved.target}`
    return hashBytes(saved.bytes)
}

const hooksDir = (common_dir: string): string => join(common_dir, 'hooks')

/** The shared `.git` files an agent must not change, as they are now. */
const saveSharedGit = async ({
    common_dir,
}: {
    common_dir: string
}): Promise<Omit<SavedGit, 'refs'>> => {
    const dir = hooksDir(common_dir)
    const hooks: Record<string, SavedFile> = {}
    if (existsSync(dir)) {
        for (const name of sortBy(readdirSync(dir))) {
            hooks[name] = await saveFile(join(dir, name))
        }
    }
    return {
        common_dir,
        config: await saveFile(join(common_dir, 'config')),
        exclude: await saveFile(join(common_dir, 'info/exclude')),
        hooks,
    }
}

const hooksState = ({
    hooks,
    exists,
}: {
    hooks: Record<string, SavedFile>
    exists: boolean
}): string[] =>
    exists
        ? Object.entries(hooks).map(([name, saved]) =>
              saved.kind === 'file'
                  ? `${name} ${saved.mode.toString(8)} ${hashSaved(saved)}`
                  : `${name} ${hashSaved(saved)}`
          )
        : ['missing']

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

const commonDirOf = async ({ cwd }: { cwd: string }): Promise<string> =>
    (
        await gitOk({
            cwd,
            args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        })
    ).trim()

/** The git state an agent must not change, but for the shared files. */
const gitState = async ({
    cwd,
    branch,
    shared,
}: {
    cwd: string
    branch: string
    shared: Omit<SavedGit, 'refs'>
}): Promise<{ state: GitState; refs: Record<string, string> }> => {
    const head = (await gitOk({ cwd, args: ['rev-parse', 'HEAD'] })).trim()
    const headRef = await git({ cwd, args: ['symbolic-ref', '-q', 'HEAD'] })
    const branchRef = await git({
        cwd,
        args: ['rev-parse', '--verify', '-q', `refs/heads/${branch}`],
    })
    const refs = await allRefs({ cwd })
    const stash = await git({
        cwd,
        args: ['stash', 'list', '--format=%H %gs'],
    })
    return {
        refs: Object.fromEntries(refs.map(({ ref, object }) => [ref, object])),
        state: {
            head,
            head_ref: headRef.ok ? headRef.stdout.trim() : null,
            branch_ref: branchRef.ok ? branchRef.stdout.trim() : null,
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
            staged: sortBy(
                nulSplit(
                    await gitOk({
                        cwd,
                        args: ['diff', '--cached', '--name-only', '-z'],
                    })
                )
            ),
            config_hash: hashSaved(shared.config),
            exclude_hash: hashSaved(shared.exclude),
            hooks: hooksState({
                hooks: shared.hooks,
                exists: existsSync(hooksDir(shared.common_dir)),
            }),
        },
    }
}

/**
 * The fingerprint of each path `git status` lists, each watched ignored
 * path, and each path in `also` (the paths seen before the turn, so an
 * ignored file that is gone shows as deleted).
 */
const fileStates = async ({
    cwd,
    config,
    also,
}: {
    cwd: string
    config: EngineConfig
    also?: string[]
}): Promise<Record<string, string>> => {
    const files: Record<string, string> = {}
    const paths = uniq([
        ...(await statusPaths({ cwd })),
        ...(await watchedIgnoredPaths({ cwd, config })),
        ...(also ?? []),
    ])
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
    const files = await fileStates({ cwd, config })
    const saved: Record<string, Uint8Array | null> = {}
    for (const [path, hash] of Object.entries(files)) {
        const full = join(cwd, path)
        const plain =
            hash !== DELETED && !inPackages(path) && lstatSync(full).isFile()
        saved[path] = plain ? await Bun.file(full).bytes() : null
    }
    const shared = await saveSharedGit({
        common_dir: await commonDirOf({ cwd }),
    })
    const { state, refs } = await gitState({ cwd, branch, shared })
    return { files, saved, git: state, saved_git: { ...shared, refs } }
}

/**
 * Puts the shared `.git` config, excludes, and hooks back. It runs before
 * any other git command, so a changed config (such as `core.fsmonitor`)
 * never runs for the engine.
 */
const restoreSharedGit = async ({
    saved,
}: {
    saved: SavedGit
}): Promise<void> => {
    const { common_dir } = saved
    const now = await saveSharedGit({ common_dir })
    if (hashSaved(now.config) !== hashSaved(saved.config)) {
        await writeSaved({
            full: join(common_dir, 'config'),
            saved: saved.config,
        })
    }
    if (hashSaved(now.exclude) !== hashSaved(saved.exclude)) {
        await writeSaved({
            full: join(common_dir, 'info/exclude'),
            saved: saved.exclude,
        })
    }
    const dir = hooksDir(common_dir)
    for (const name of Object.keys(now.hooks)) {
        if (saved.hooks[name] === undefined) {
            await rm(join(dir, name), { force: true, recursive: true })
        }
    }
    for (const [name, hook] of Object.entries(saved.hooks)) {
        const current = now.hooks[name]
        const same =
            current !== undefined &&
            hashSaved(current) === hashSaved(hook) &&
            (current.kind !== 'file' ||
                hook.kind !== 'file' ||
                current.mode === hook.mode)
        if (!same) await writeSaved({ full: join(dir, name), saved: hook })
    }
}

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

/** Puts HEAD, the branch, the index, refs, and stashes back; the files stay. */
const restoreGit = async ({
    cwd,
    branch,
    before,
    after,
    saved,
}: {
    cwd: string
    branch: string
    before: GitState
    after: GitState
    saved: SavedGit
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
    for (const ref of after.refs_at_head) {
        if (!before.refs_at_head.includes(ref)) {
            await undoRef({ cwd, ref, before: saved.refs[ref] })
        }
    }
    await dropStashes({
        cwd,
        entries: after.stash.filter((entry) => !before.stash.includes(entry)),
    })
}

/** Puts one path back how it was before the turn. */
const restorePath = async ({
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
const reinstallPackages = async ({
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
 * The after-turn check: compares the worktree and its git state with the
 * snapshot from before the turn, against the role's rules. Undoes every
 * violation: the shared `.git` config, excludes, and hooks first (before
 * any git command runs), then HEAD, the branch, the index, new refs, and
 * new stash entries, then each path the role may not write (tracked paths
 * as they were, new paths removed, `node_modules` reinstalled).
 *
 * @returns Every violation found, empty when the turn kept to the rules.
 */
export const enforceAfterTurn = async ({
    cwd,
    branch,
    role,
    may_edit_tests,
    config,
    before,
}: {
    cwd: string
    branch: string
    role: GuardRole
    /** Whether the agent may edit test files, as it was launched. */
    may_edit_tests: boolean
    config: EngineConfig
    before: TurnSnapshot
}): Promise<{ violations: Violation[] }> => {
    const shared = await saveSharedGit({
        common_dir: before.saved_git.common_dir,
    })
    await restoreSharedGit({ saved: before.saved_git })
    const { state: after } = await gitState({ cwd, branch, shared })
    const gitProblems = gitViolations({ before: before.git, after })
    if (gitProblems.length > 0) {
        await restoreGit({
            cwd,
            branch,
            before: before.git,
            after,
            saved: before.saved_git,
        })
    }
    // After a git undo, what the agent committed or staged shows as files.
    const files = await fileStates({
        cwd,
        config,
        also: Object.keys(before.files),
    })
    const pathProblems = pathViolations({
        role,
        may_edit_tests,
        config,
        before: before.files,
        after: files,
    })
    const reinstall: string[] = []
    for (const violation of pathProblems) {
        if (violation.kind !== 'path') continue
        if (
            inPackages(violation.path) &&
            before.files[violation.path] !== undefined
        ) {
            reinstall.push(violation.path)
        } else {
            await restorePath({ cwd, path: violation.path, before })
        }
    }
    const failed =
        reinstall.length === 0
            ? null
            : await reinstallPackages({ cwd, paths: reinstall })
    return {
        violations: [
            ...gitProblems,
            ...pathProblems,
            ...(failed === null
                ? []
                : [{ kind: 'undo_failed' as const, detail: failed }]),
        ],
    }
}
