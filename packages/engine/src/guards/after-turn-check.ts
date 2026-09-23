import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import { mayWrite, type GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'

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
    /** Hash of the shared `.git/config`. */
    config_hash: string
    /** Name, mode, and content hash of each shared `.git/hooks` entry. */
    hooks: string[]
}

/** A worktree as the after-turn check sees it. */
export type WorktreeState = {
    /** Content hash (or `DELETED`) of every path `git status` lists. */
    files: Record<string, string>
    git: GitState
}

/** One thing an agent changed that its role may not change. */
export type Violation =
    | { kind: 'path'; path: string; change: 'wrote' | 'deleted' }
    | { kind: 'git'; detail: string }

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
    if (before.config_hash !== after.config_hash) {
        details.push('the shared .git/config changed')
    }
    if (before.hooks.join('\n') !== after.hooks.join('\n')) {
        details.push('the shared .git/hooks changed')
    }
    return details.map((detail) => ({ kind: 'git', detail }))
}

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
        ...violations.map((violation) =>
            violation.kind === 'git'
                ? `- git: ${violation.detail}`
                : `- ${violation.change} ${violation.path}, which a ${role} may not ${violation.change === 'deleted' ? 'delete' : 'write'}`
        ),
    ].join('\n')
