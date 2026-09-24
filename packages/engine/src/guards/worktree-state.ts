import {
    existsSync,
    lstatSync,
    readdirSync,
    readlinkSync,
    type Stats,
} from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import {
    branchConfigChanges,
    DELETED,
    gitViolations,
    outsideGitChanges,
    pathViolations,
    watchesIgnored,
    type ConfigEntry,
    type GitState,
    type OutsideGitState,
    type Violation,
    type WorktreeState,
} from './after-turn-check'
import type { GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'
import { FROZEN_INSTALL } from '../gates/lockfile-install'
import { runCommand, runShell } from '../shell/run-command'

/** What the check and the undo of git state need beyond the comparison. */
type SavedGit = {
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
 * Put before every git command the check runs, so an fsmonitor or hook
 * someone planted in the shared `.git` never runs for the engine.
 */
const SAFE_GIT = [
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.hooksPath=/dev/null',
]

const git = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<{ ok: boolean; stdout: string }> => {
    const result = await runCommand({
        cmd: ['git', ...SAFE_GIT, ...args],
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
        cmd: ['git', ...SAFE_GIT, ...args],
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

/**
 * The ignore rules git would use but for `.gitignore` files: the global
 * excludes file, then the shared `.git/info/exclude` (whose lines win).
 */
const excludeRules = async ({
    cwd,
    common_dir,
}: {
    cwd: string
    common_dir: string
}): Promise<Uint8Array> => {
    const set = await git({
        cwd,
        args: ['config', '--path', '--get', 'core.excludesFile'],
    })
    const xdg = process.env.XDG_CONFIG_HOME
    const global = set.ok
        ? set.stdout.trim()
        : join(
              xdg !== undefined && xdg !== ''
                  ? xdg
                  : join(homedir(), '.config'),
              'git/ignore'
          )
    const read = async (full: string) =>
        existsSync(full) && lstatSync(full).isFile()
            ? Bun.file(full).text()
            : ''
    return new TextEncoder().encode(
        `${await read(global)}\n${await read(join(common_dir, 'info/exclude'))}`
    )
}

/** Runs `use` with the rules written to a temp file, removed after. */
const withExcludeFile = async <Result>({
    rules,
    use,
}: {
    rules: Uint8Array
    use: (file: string) => Promise<Result>
}): Promise<Result> => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-engine-exclude-'))
    try {
        const file = join(dir, 'exclude')
        await Bun.write(file, rules)
        return await use(file)
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
}

/** The `ls-files` options that ignore by the snapshot's rules. */
const excludeArgs = (file: string): string[] => [
    `--exclude-from=${file}`,
    '--exclude-per-directory=.gitignore',
]

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
    const parts = nulSplit(
        await gitOk({
            cwd,
            args: ['status', '--porcelain=v1', '-z', '--untracked-files=no'],
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
    const untracked = nulSplit(
        await gitOk({
            cwd,
            args: ['ls-files', '--others', '-z', ...excludeArgs(exclude_file)],
        })
    )
    return [...paths, ...untracked]
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
    const entries = await configEntries({ cwd, common_dir })
    const exclude = join(common_dir, 'info/exclude')
    return {
        branch_config: entries.filter(({ key }) => isOwnKey({ key, branch })),
        outside: {
            config: entries
                .filter(({ key }) => !isOwnKey({ key, branch }))
                .map((entry) => JSON.stringify(entry)),
            exclude: existsSync(exclude)
                ? await hashPath({ cwd: common_dir, path: 'info/exclude' })
                : DELETED,
            hooks: await hooksState({ common_dir }),
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

const commonDirOf = async ({ cwd }: { cwd: string }): Promise<string> =>
    (
        await gitOk({
            cwd,
            args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        })
    ).trim()

/**
 * The git state an agent must not change, every ref, and the rest of the
 * shared `.git`, which others may change.
 */
const gitState = async ({
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
    const shared = await sharedGitState({ cwd, branch, common_dir })
    return {
        outside: shared.outside,
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
            branch_config: shared.branch_config,
        },
    }
}

/**
 * The fingerprint of each changed path, each watched ignored path, and each
 * path in `also` (the paths seen before the turn, so an ignored file that
 * is gone shows as deleted). Ignore rules come from `exclude_file`.
 */
const fileStates = async ({
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
    const paths = uniq([
        ...(await changedPaths({ cwd, exclude_file })),
        ...(await watchedIgnoredPaths({ cwd, config, exclude_file })),
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
    const common_dir = await commonDirOf({ cwd })
    const exclude_rules = await excludeRules({ cwd, common_dir })
    const files = await withExcludeFile({
        rules: exclude_rules,
        use: (exclude_file) => fileStates({ cwd, config, exclude_file }),
    })
    const saved: Record<string, Uint8Array | null> = {}
    for (const [path, hash] of Object.entries(files)) {
        const full = join(cwd, path)
        const plain =
            hash !== DELETED && !inPackages(path) && lstatSync(full).isFile()
        saved[path] = plain ? await Bun.file(full).bytes() : null
    }
    const { state, refs, outside } = await gitState({
        cwd,
        branch,
        common_dir,
    })
    return {
        files,
        saved,
        git: state,
        saved_git: { common_dir, refs, exclude_rules, outside },
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
 * Puts the ticket branch's own config section back, key by key: each of its
 * keys now there is unset, then each saved entry is added back in order.
 * Every other key in the shared `.git/config` stays as it is now, since
 * other processes write there too. A key with no value comes back as
 * `true`, which git reads the same.
 *
 * @returns Why the undo failed (such as another process holding the
 *   config's lock), or `null`.
 */
const restoreBranchConfig = async ({
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

/**
 * The after-turn check: compares the worktree and its git state with the
 * snapshot from before the turn, against the role's rules. Undoes every
 * violation: HEAD, the branch, the index, new refs, new stash entries, and
 * the ticket branch's own settings in the shared `.git/config` (key by
 * key), then each path the role may not write (tracked paths as they were,
 * new paths removed, `node_modules` reinstalled).
 *
 * The rest of the shared `.git` (other config keys, `info/exclude`, hooks)
 * is other processes' to change: a change there is returned in `outside`,
 * never blamed on the agent, and never undone. So it can't fool the check,
 * every git command runs with no fsmonitor and no hooks, and files are
 * listed with the ignore rules from before the turn.
 *
 * @returns Every violation found, empty when the turn kept to the rules,
 *   and what changed in the shared `.git` that isn't the agent's.
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
}): Promise<{ violations: Violation[]; outside: string[] }> => {
    const { common_dir } = before.saved_git
    const { state: after, outside } = await gitState({
        cwd,
        branch,
        common_dir,
    })
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
    const configFailed =
        branchConfigChanges({ before: before.git, after }).length === 0
            ? null
            : await restoreBranchConfig({
                  cwd,
                  before: before.git,
                  after,
                  common_dir,
              })
    // After a git undo, what the agent committed or staged shows as files.
    const files = await withExcludeFile({
        rules: before.saved_git.exclude_rules,
        use: (exclude_file) =>
            fileStates({
                cwd,
                config,
                exclude_file,
                also: Object.keys(before.files),
            }),
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
            ...[configFailed, failed].flatMap((detail) =>
                detail === null
                    ? []
                    : [{ kind: 'undo_failed' as const, detail }]
            ),
        ],
        outside: outsideGitChanges({
            before: before.saved_git.outside,
            after: outside,
        }),
    }
}
