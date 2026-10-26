import { isAbsolute, join } from 'node:path'

import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk'

import { isWriter } from './guard-roles'
import { LOCKFILES, type GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'

/** Files under the home folder no agent may read, even from the shell. */
export const SECRET_PATHS = [
    '.claude.json',
    '.claude',
    '.paseo',
    '.ssh',
    '.config/gh',
]

const mustBeAbsolute = (paths: Record<string, string>): void => {
    for (const [name, path] of Object.entries(paths)) {
        if (!isAbsolute(path)) {
            throw new Error(
                `The sandbox needs an absolute ${name}, got "${path}".`
            )
        }
    }
}

/**
 * The OS sandbox a role's shell commands run in. Every rule is an absolute
 * path: relative globs do not hold on macOS. Pass real paths (macOS reaches
 * temp folders through `/private/var`), as the launcher does.
 *
 * Every role: no network, no local ports, no unsandboxed commands, no shell
 * call approved just for being sandboxed, no writes to git, to what the
 * package install writes (`node_modules`, lockfiles), or to test setup files. The implementer also may not write test files unless
 * it may edit tests (a refactor ticket's implementer); reviewers, the
 * learner, and a test-writer that may not edit tests may not write the
 * worktree at all.
 *
 * Test-writers and implementers, who run the test commands, may also write
 * macOS's per-user temp folder (`user_temp_dir`), where Foundation stages
 * atomic writes: without it, `swift test` and `xcodebuild` can't rebuild.
 * Nothing else is opened, and nothing at all without that folder.
 *
 * @example
 * const sandbox = sandboxSettings({ role: 'implementer', may_edit_tests: false, worktree, common_git_dir, home, user_temp_dir, config })
 */
export const sandboxSettings = ({
    role,
    may_edit_tests,
    worktree,
    common_git_dir,
    home,
    user_temp_dir,
    config,
}: {
    role: GuardRole
    /** Whether the agent may edit test files. */
    may_edit_tests: boolean
    /** The agent's worktree, real and absolute. */
    worktree: string
    /** The repo's shared `.git` folder (`git rev-parse --git-common-dir`). */
    common_git_dir: string
    home: string
    /**
     * macOS's per-user temp folder (`darwinUserTempDir`), real and
     * absolute, or `null` off macOS or when it can't be found.
     */
    user_temp_dir: string | null
    config: EngineConfig
}): SandboxSettings => {
    mustBeAbsolute({
        worktree,
        common_git_dir,
        home,
        ...(user_temp_dir === null ? {} : { user_temp_dir }),
    })
    const git = [common_git_dir, join(worktree, '.git')]
    const inWorktree = (patterns: string[]) =>
        patterns.map((pattern) => join(worktree, pattern))
    const setup = inWorktree(config.test_setup_files)
    const install = inWorktree([
        'node_modules',
        '**/node_modules',
        ...LOCKFILES,
    ])
    const byRole: Record<GuardRole, string[]> = {
        'test-writer': may_edit_tests ? [...install, ...setup] : [worktree],
        implementer: may_edit_tests
            ? [...install, ...setup]
            : [...install, ...inWorktree(config.test_file_patterns), ...setup],
        reviewer: [worktree],
        learner: [worktree],
    }
    return {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: false,
        allowUnsandboxedCommands: false,
        network: {
            allowedDomains: [],
            strictAllowlist: true,
            allowLocalBinding: false,
        },
        filesystem: {
            ...(user_temp_dir !== null && isWriter(role)
                ? { allowWrite: [user_temp_dir] }
                : {}),
            denyWrite: [...git, ...byRole[role]],
            denyRead: SECRET_PATHS.map((path) => join(home, path)),
        },
    }
}
