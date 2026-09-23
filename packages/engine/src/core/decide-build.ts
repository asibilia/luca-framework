import type { RunState } from '../journal/replay'

/** The next build step for a run whose intake passed. */
export type BuildAction = {
    /** Make the run branch, in its own worktree, from the base branch. */
    type: 'create_run_branch'
    spec_number: number
    base_branch: string
}

/**
 * The build half of the decision step: picks the next step of building the
 * run's tickets, one ticket at a time in snapshot order. Pure.
 */
export const decideBuild = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): BuildAction => ({
    type: 'create_run_branch',
    spec_number,
    base_branch: state.base_branch ?? 'main',
})
