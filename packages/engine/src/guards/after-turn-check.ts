import { basename } from 'node:path'

import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import { isInstallPath, mayWrite, type GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'
import { testFilesAmong } from '../gates/test-runner'

/** The hash the snapshot records for a path that is gone. */
export const DELETED = '<deleted>'

/**
 * Everything about a worktree's git an agent must never change. Hashes and
 * names only: never `ls` output or mtimes, which move on their own.
 */
export type GitState = {
    /** The commit checked out. */
    head: string
    /** What HEAD points at, such as `refs/heads/<branch>`; `null` if detached. */
    head_ref: string | null
    /** The ticket branch's commit, `null` if the branch is gone. */
    branch_ref: string | null
    /** Other refs pointing at HEAD. The repo's refs are shared, so only these count. */
    refs_at_head: string[]
    /** Stash entries naming the branch. The stash is shared too. */
    stash: string[]
    /** Paths staged in the index. */
    staged: string[]
    /**
     * The ticket branch's own section of the shared `.git/config`
     * (`branch.<branch>.*`), in file order. Only this worktree works on its
     * branch, so a change here is the agent's.
     */
    branch_config: ConfigEntry[]
}

/** One `.git/config` entry; `value` is `null` for a bare `key` line. */
export type ConfigEntry = { key: string; value: string | null }

/**
 * The rest of the shared `.git`: config entries outside the ticket branch's
 * own section, `info/exclude`, and `hooks`. Other processes in the same repo
 * change these (a `git push -u` writes its branch's config), and the agent
 * can't, so a change here is never blamed on it or undone.
 */
export type OutsideGitState = {
    /** Each config entry outside the branch's section, in file order. */
    config: string[]
    /** Hash of the shared `.git/info/exclude`. */
    exclude: string
    /** Name, mode, and content hash of each shared `.git/hooks` entry. */
    hooks: string[]
}

/** A worktree as the after-turn check sees it. */
export type WorktreeState = {
    /**
     * Content hash (or `DELETED`) of every path `git status` lists, and of
     * each ignored path that matters (see `watchesIgnored`). A path under
     * `node_modules` gets a stat signature instead: its size, inode, and
     * change time, which no process can set back.
     */
    files: Record<string, string>
    git: GitState
}

/** One thing an agent changed that its role may not change. */
export type Violation =
    | { kind: 'path'; path: string; change: 'wrote' | 'deleted' }
    | { kind: 'git'; detail: string }
    /** Something the engine could not put back; a person should look. */
    | { kind: 'undo_failed'; detail: string }

/**
 * Whether the after-turn check watches a path git ignores: what the package
 * install writes (`node_modules`, lockfiles), test and test setup files, and
 * `.env` files (Bun loads them into every check). Other ignored paths, such
 * as build output and caches, are what check commands write, so they are
 * not watched.
 *
 * @example
 * watchesIgnored({ path: 'node_modules/zod/index.js', config }) // true
 * watchesIgnored({ path: 'dist/index.js', config }) // false
 */
export const watchesIgnored = ({
    path,
    config,
}: {
    path: string
    config: EngineConfig
}): boolean =>
    isInstallPath(path) ||
    basename(path).startsWith('.env') ||
    config.test_setup_files.includes(path) ||
    testFilesAmong({
        files: [path],
        test_file_patterns: config.test_file_patterns,
    }).length > 0

/** Paths whose content differs between two snapshots, sorted. */
export const changedPaths = ({
    before,
    after,
}: {
    before: Record<string, string>
    after: Record<string, string>
}): string[] =>
    sortBy(
        uniq([...Object.keys(before), ...Object.keys(after)]).filter(
            (path) => before[path] !== after[path]
        )
    )

/**
 * The paths an agent changed that its role may not write. A path that went
 * back to how HEAD has it counts too: the agent still touched it.
 *
 * @example
 * pathViolations({ role: 'test-writer', may_edit_tests: true, config, before: {}, after: { 'src/a.ts': 'f00' } })
 * // [{ kind: 'path', path: 'src/a.ts', change: 'wrote' }]
 */
export const pathViolations = ({
    role,
    may_edit_tests,
    config,
    before,
    after,
}: {
    role: GuardRole
    /** Whether the agent may edit test files, as it was launched. */
    may_edit_tests: boolean
    config: EngineConfig
    before: Record<string, string>
    after: Record<string, string>
}): Violation[] =>
    changedPaths({ before, after })
        .filter((path) => !mayWrite({ role, may_edit_tests, path, config }))
        .map((path) => ({
            kind: 'path',
            path,
            change: after[path] === DELETED ? 'deleted' : 'wrote',
        }))

const added = ({ before, after }: { before: string[]; after: string[] }) =>
    after.filter((item) => !before.includes(item))

/**
 * Every git change between two snapshots. No role may change git state, so
 * each one is a violation.
 */
export const gitViolations = ({
    before,
    after,
}: {
    before: GitState
    after: GitState
}): Violation[] => {
    const details: string[] = []
    if (before.head !== after.head) {
        details.push(`HEAD moved from ${before.head} to ${after.head}`)
    }
    if (before.head_ref !== after.head_ref) {
        details.push(
            `HEAD now points at ${after.head_ref ?? 'a detached commit'}, not ${before.head_ref ?? 'a detached commit'}`
        )
    }
    if (before.branch_ref !== after.branch_ref) {
        details.push(
            `the ticket branch moved from ${before.branch_ref} to ${after.branch_ref}`
        )
    }
    const refs = added({
        before: before.refs_at_head,
        after: after.refs_at_head,
    })
    if (refs.length > 0) details.push(`new refs at HEAD: ${refs.join(', ')}`)
    const stash = added({ before: before.stash, after: after.stash })
    if (stash.length > 0) details.push(`new stash entries: ${stash.join('; ')}`)
    if (before.staged.join('\n') !== after.staged.join('\n')) {
        details.push(`staged files: ${after.staged.join(', ') || '(none)'}`)
    }
    const keys = branchConfigChanges({ before, after })
    if (keys.length > 0) {
        details.push(
            `the shared .git/config changed this ticket's branch settings: ${keys.join(', ')}`
        )
    }
    return details.map((detail) => ({ kind: 'git', detail }))
}

/** The values a config section holds for each key, in file order. */
const valuesByKey = (entries: ConfigEntry[]): Record<string, string> => {
    const values: Record<string, string[]> = {}
    for (const { key, value } of entries) {
        values[key] = [...(values[key] ?? []), JSON.stringify(value)]
    }
    return Object.fromEntries(
        Object.entries(values).map(([key, list]) => [key, list.join('\n')])
    )
}

/**
 * The ticket branch's config keys whose values changed between two
 * snapshots, sorted.
 *
 * @example
 * branchConfigChanges({ before, after }) // ['branch.x--ticket-11.sneaky']
 */
export const branchConfigChanges = ({
    before,
    after,
}: {
    before: GitState
    after: GitState
}): string[] => {
    const was = valuesByKey(before.branch_config)
    const now = valuesByKey(after.branch_config)
    return sortBy(
        uniq([...Object.keys(was), ...Object.keys(now)]).filter(
            (key) => was[key] !== now[key]
        )
    )
}

/**
 * What changed in the shared `.git` outside the agent's reach, in words.
 * These are journaled, never blamed on the agent, and never undone.
 *
 * @example
 * outsideGitChanges({ before, after }) // ['the shared .git/config changed']
 */
export const outsideGitChanges = ({
    before,
    after,
}: {
    before: OutsideGitState
    after: OutsideGitState
}): string[] => [
    ...(before.config.join('\n') === after.config.join('\n')
        ? []
        : ['the shared .git/config changed']),
    ...(before.exclude === after.exclude
        ? []
        : ['the shared .git/info/exclude changed']),
    ...(before.hooks.join('\n') === after.hooks.join('\n')
        ? []
        : ['the shared .git/hooks changed']),
]

/** A clear error listing each violation, for the journal and the ticket. */
export const describeViolations = ({
    role,
    violations,
}: {
    role: GuardRole
    violations: Violation[]
}): string =>
    [
        `The ${role} broke its role's rules, so the engine undid it:`,
        ...violations.map((violation) => {
            if (violation.kind === 'git') return `- git: ${violation.detail}`
            if (violation.kind === 'undo_failed') {
                return `- could not undo: ${violation.detail}`
            }
            return `- ${violation.change} ${violation.path}, which a ${role} may not ${violation.change === 'deleted' ? 'delete' : 'write'}`
        }),
    ].join('\n')
