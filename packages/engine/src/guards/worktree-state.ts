import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import sortBy from 'lodash/sortBy'

import {
    DELETED,
    gitViolations,
    pathViolations,
    type GitState,
    type Violation,
    type WorktreeState,
} from './after-turn-check'
import type { GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'
import { runCommand } from '../shell/run-command'

/**
 * A snapshot taken before an agent turn: what the after-turn check compares
 * against, plus the bytes of each changed file so a violation can be undone
 * exactly, even on a worktree that was not clean.
 */
export type TurnSnapshot = WorktreeState & {
    /** Bytes of each path in `files` (`null` if it was deleted). */
    saved: Record<string, Uint8Array | null>
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

const hashBytes = (bytes: Uint8Array): string => Bun.hash(bytes).toString(16)

/** `existsSync` follows links; a dangling link still exists. */
const lstatExists = (full: string): boolean => {
    try {
        lstatSync(full)
        return true
    } catch {
        return false
    }
}

/** A path's content hash: a file's bytes, a link's target, or `DELETED`. */
const hashPath = async (full: string): Promise<string> => {
    if (!lstatExists(full)) return DELETED
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) return `link:${readlinkSync(full)}`
    if (stat.isDirectory()) return 'dir'
    return hashBytes(await Bun.file(full).bytes())
}

const hooksOf = async ({ dir }: { dir: string }): Promise<string[]> => {
    if (!existsSync(dir)) return ['missing']
    const names = sortBy(readdirSync(dir))
    const entries: string[] = []
    for (const name of names) {
        const full = join(dir, name)
        const stat = lstatSync(full)
        entries.push(`${name} ${stat.mode.toString(8)} ${await hashPath(full)}`)
    }
    return entries
}

const gitState = async ({
    cwd,
    branch,
}: {
    cwd: string
    branch: string
}): Promise<GitState> => {
    const head = (await gitOk({ cwd, args: ['rev-parse', 'HEAD'] })).trim()
    const headRef = await git({ cwd, args: ['symbolic-ref', '-q', 'HEAD'] })
    const branchRef = await git({
        cwd,
        args: ['rev-parse', '--verify', '-q', `refs/heads/${branch}`],
    })
    const refs = await gitOk({
        cwd,
        args: [
            'for-each-ref',
            '--format=%(refname) %(objectname)',
            'refs/heads',
            'refs/tags',
        ],
    })
    const stash = await git({
        cwd,
        args: ['stash', 'list', '--format=%H %gs'],
    })
    const common = (
        await gitOk({
            cwd,
            args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        })
    ).trim()
    const config = join(common, 'config')
    return {
        head,
        head_ref: headRef.ok ? headRef.stdout.trim() : null,
        branch_ref: branchRef.ok ? branchRef.stdout.trim() : null,
        refs_at_head: sortBy(
            refs
                .split('\n')
                .filter((line) => line.endsWith(` ${head}`))
                .map((line) => line.split(' ')[0] ?? '')
                .filter((ref) => ref !== `refs/heads/${branch}`)
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
        config_hash: existsSync(config)
            ? hashBytes(await Bun.file(config).bytes())
            : 'missing',
        hooks: await hooksOf({ dir: join(common, 'hooks') }),
    }
}

const fileStates = async ({
    cwd,
}: {
    cwd: string
}): Promise<Record<string, string>> => {
    const files: Record<string, string> = {}
    for (const path of await statusPaths({ cwd })) {
        files[path] = await hashPath(join(cwd, path))
    }
    return files
}

/**
 * Snapshots a worktree before an agent turn: each changed path's content
 * hash and bytes, and the git state no agent may change.
 *
 * @example
 * const before = await snapshotWorktree({ cwd, branch })
 * // ... the agent works ...
 * const { violations } = await enforceAfterTurn({ cwd, branch, role, may_edit_tests, config, before })
 */
export const snapshotWorktree = async ({
    cwd,
    branch,
}: {
    cwd: string
    branch: string
}): Promise<TurnSnapshot> => {
    const files = await fileStates({ cwd })
    const saved: Record<string, Uint8Array | null> = {}
    for (const [path, hash] of Object.entries(files)) {
        const full = join(cwd, path)
        const plain = hash !== DELETED && lstatSync(full).isFile()
        saved[path] = plain ? await Bun.file(full).bytes() : null
    }
    return { files, saved, git: await gitState({ cwd, branch }) }
}

/** Puts HEAD, the branch, and the index back; the files stay as they are. */
const restoreGit = async ({
    cwd,
    branch,
    before,
}: {
    cwd: string
    branch: string
    before: GitState
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
}

/**
 * The after-turn check: compares the worktree and its git state with the
 * snapshot from before the turn, by content hash, against the role's rules.
 * Undoes every violation: git state first (HEAD, the branch, the index go
 * back; the files stay), then each path the role may not write (tracked
 * paths as they were, new paths removed).
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
    const after = await gitState({ cwd, branch })
    const gitProblems = gitViolations({ before: before.git, after })
    if (gitProblems.length > 0) {
        await restoreGit({ cwd, branch, before: before.git })
    }
    // After a git undo, what the agent committed or staged shows as files.
    const files = await fileStates({ cwd })
    const pathProblems = pathViolations({
        role,
        may_edit_tests,
        config,
        before: before.files,
        after: files,
    })
    for (const violation of pathProblems) {
        if (violation.kind === 'path') {
            await restorePath({ cwd, path: violation.path, before })
        }
    }
    return { violations: [...gitProblems, ...pathProblems] }
}
