/**
 * The build steps that settle the run before any ticket moves: a `stop`
 * reply or an open PR winds the run down (`haltSteps`), and the run branch's
 * install (`installSteps`), which a failure holds every ticket back on. Pure.
 */
import { stuck, type BuildAction } from './build-action'
import { notRemoved, type BuildView } from './decide-build-view'
import { installFailure } from './decide-ticket'

import type { RunState } from '../journal/replay'

/**
 * The steps that end the run (a `stop` reply, or an open PR), or `null` when
 * the run goes on.
 */
export const haltSteps = ({
    state,
    view,
}: {
    state: RunState
    view: BuildView
}): BuildAction[] | null => {
    const { run_branch, numbers, progress, finished } = view
    const { pull_request } = state
    if (state.stop !== null) {
        // Nothing new starts; finished tickets' worktrees go, the rest stay.
        const paths = notRemoved({
            state,
            paths: numbers.flatMap((number) => {
                const { worktree } = progress(number)
                return finished(number) && worktree !== null
                    ? [worktree.path]
                    : []
            }),
        })
        if (paths.length > 0) return [{ type: 'remove_worktrees', paths }]
        return [{ type: 'done', outcome: 'stopped_by_user' }]
    }

    if (pull_request !== null) {
        const paths = notRemoved({
            state,
            paths: [
                ...numbers.flatMap((number) => {
                    const { worktree } = progress(number)
                    return worktree === null ? [] : [worktree.path]
                }),
                run_branch.path,
            ],
        })
        if (paths.length > 0) return [{ type: 'remove_worktrees', paths }]
        return [{ type: 'done', outcome: 'pr_opened', pull_request }]
    }

    return null
}

/**
 * The run branch's install, or the stuck ticket a failed one holds the run on
 * (with the owner's `replies`), or `null` when the run branch is installed.
 */
export const installSteps = ({
    state,
    view,
    replies,
}: {
    state: RunState
    view: BuildView
    replies: BuildAction[]
}): BuildAction[] | null => {
    const { numbers, finished, skipped, isStuck, stuckSteps } = view
    const { run_branch_install } = state
    if (run_branch_install === null) {
        return [
            {
                type: 'install_dependencies',
                target: 'run_branch',
                ticket: null,
            },
        ]
    }
    const runBranchFailure = installFailure({
        install: run_branch_install,
        where: "the run branch's checkout",
    })

    if (runBranchFailure !== null) {
        // Nothing builds on a run branch whose install failed: the first
        // ticket is stuck on it until a retry installs it again.
        if (numbers.some(isStuck)) {
            return [...numbers.filter(isStuck).flatMap(stuckSteps), ...replies]
        }
        const first = numbers.find(
            (number) => !finished(number) && !skipped(number)
        )
        if (first !== undefined) {
            return [
                stuck({
                    ticket: first,
                    reason: 'install_failed',
                    detail: runBranchFailure,
                }),
            ]
        }
    }

    return null
}
