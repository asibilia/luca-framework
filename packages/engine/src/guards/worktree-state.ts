import omitBy from 'lodash/omitBy'

import {
    branchConfigChanges,
    gitViolations,
    outsideGitChanges,
    pathViolations,
    type Violation,
} from './after-turn-check'
import type { GuardRole } from './role-rules'
import { withExcludeFile } from './worktree-git'
import {
    fileStates,
    gitState,
    inPackages,
    type TurnSnapshot,
} from './worktree-snapshot'
import {
    headIsNew,
    reinstallPackages,
    restoreBranchConfig,
    restoreGit,
    restorePath,
} from './worktree-undo'

import type { EngineConfig } from '../config/engine-config'

export { snapshotWorktree, type TurnSnapshot } from './worktree-snapshot'

/**
 * The after-turn check: compares the worktree and its git state with the
 * snapshot from before the turn, against the role's rules. Undoes every
 * violation: HEAD, the branch, the index, the new refs the agent made at a
 * commit it made, new stash entries, and the ticket branch's own settings
 * in the shared `.git/config` (key by key), then each path the role may not
 * write (tracked paths as they were, new paths removed, `node_modules`
 * reinstalled).
 *
 * The rest of the shared `.git` (other config keys, `info/exclude`, hooks)
 * is other processes' to change: a change there is returned in `outside`,
 * never blamed on the agent, and never undone. So it can't fool the check,
 * every git command runs with no fsmonitor, hooks, or content filters, and
 * files are listed with the ignore rules from before the turn.
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
    leave_out,
}: {
    cwd: string
    branch: string
    role: GuardRole
    /** Whether the agent may edit test files, as it was launched. */
    may_edit_tests: boolean
    config: EngineConfig
    before: TurnSnapshot
    /**
     * Paths the prepare command made (`prepare_made`): never judged, so an
     * agent that runs the build again is not blamed for its output. Left
     * out, none.
     */
    leave_out?: string[]
}): Promise<{ violations: Violation[]; outside: string[] }> => {
    const { common_dir } = before.saved_git
    const { gitProblems, outside, configFailed, files } = await withExcludeFile(
        {
            rules: before.saved_git.exclude_rules,
            use: async (exclude_file) => {
                const listFiles = () =>
                    fileStates({
                        cwd,
                        config,
                        exclude_file,
                        also: Object.keys(before.files),
                    })
                // Both only read, so the files are listed while git is.
                const [now, listed] = await Promise.all([
                    gitState({ cwd, branch, common_dir }),
                    listFiles(),
                ])
                const head_is_new = await headIsNew({
                    cwd,
                    before: before.git,
                    after: now.state,
                    saved: before.saved_git,
                })
                const problems = gitViolations({
                    before: before.git,
                    after: now.state,
                    head_is_new,
                })
                if (problems.length > 0) {
                    await restoreGit({
                        cwd,
                        branch,
                        before: before.git,
                        after: now.state,
                        saved: before.saved_git,
                        head_is_new,
                    })
                }
                const failed =
                    branchConfigChanges({
                        before: before.git,
                        after: now.state,
                    }).length === 0
                        ? null
                        : await restoreBranchConfig({
                              cwd,
                              before: before.git,
                              after: now.state,
                              common_dir,
                          })
                return {
                    gitProblems: problems,
                    outside: now.outside,
                    configFailed: failed,
                    // After a git undo, what the agent committed or staged
                    // shows as files, so they are listed again.
                    files: problems.length > 0 ? await listFiles() : listed,
                }
            },
        }
    )
    // What the prepare command made is not the agent's to be judged on.
    const skipped = new Set(leave_out)
    const judged = (states: Record<string, string>) =>
        omitBy(states, (_state, path) => skipped.has(path))
    const pathProblems = pathViolations({
        role,
        may_edit_tests,
        config,
        before: judged(before.files),
        after: judged(files),
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
