/**
 * The texts of the repo wait (#615): the spec issue's comment when the run
 * starts waiting for earlier runs on its repo, and when it is stuck on them.
 */
import type { RepoWaitRun } from './decide-repo-wait'

/** The runs, as a list of lines. */
const runLines = (runs: RepoWaitRun[]): string =>
    runs
        .map(
            ({ run_id, spec }) =>
                `- run \`${run_id}\`${spec === null ? ' (a demo)' : ` (spec #${spec})`}`
        )
        .join('\n')

/**
 * The comment on the spec issue when the run waits for earlier runs on its
 * repo: which ones, and that it goes on by itself.
 *
 * @example
 * repoWaitComment({ runs: [{ run_id: 'run-a', spec: 7 }] })
 * // '**The run waits for another run on this repo**\n\n- run `run-a` (spec #7)\n\n...'
 */
export const repoWaitComment = ({ runs }: { runs: RepoWaitRun[] }): string =>
    [
        '**The run waits for another run on this repo**',
        runLines(runs),
        'Two runs on one repo slow each other down, so this one starts once none of these is going. It checks every minute and goes on by itself. After 24 hours it stops and asks you. To run two at once on purpose, start a run with `luca-run --alongside`.',
    ].join('\n\n')

/**
 * Why the run is stuck on its repo wait, in one line, naming the `ps`
 * failure when the wait couldn't check whether those runs are going (#624).
 *
 * @example
 * repoBusyDetail({ runs: [{ run_id: 'run-a', spec: 7 }], ps_error: null })
 * // 'The run waited 24 hours for an earlier run on this repo: run-a (spec #7).'
 */
export const repoBusyDetail = ({
    runs,
    ps_error = null,
}: {
    runs: RepoWaitRun[]
    ps_error?: string | null
}): string => {
    const named = runs
        .map(
            ({ run_id, spec }) =>
                `${run_id}${spec === null ? ' (a demo)' : ` (spec #${spec})`}`
        )
        .join(', ')
    const ps =
        ps_error === null
            ? ''
            : ` Luca couldn't list the processes (${ps_error}), so it couldn't tell whether those runs are still going.`
    return `The run waited 24 hours for an earlier run on this repo: ${named}.${ps}`
}

/**
 * The comment on the spec issue when the run is stuck after 24 hours of
 * its repo wait (`repo_busy`): why, and the replies `retry` and `stop`.
 *
 * @example
 * repoBusyStuckComment({ detail })
 * // '**The run is stuck: another run on this repo is still going**\n\nWhy: ...'
 */
export const repoBusyStuckComment = ({ detail }: { detail: string }): string =>
    [
        '**The run is stuck: another run on this repo is still going**',
        [
            `Why: ${detail}`,
            'Nothing has started yet: no ticket was read and no worktree made.',
        ].join('\n'),
        [
            'Reply with one word on this issue:',
            '- `retry`: wait up to 24 hours more, then go on once no earlier run on the repo is going.',
            '- `stop`: end the run. Start it again later, or with `luca-run --alongside` to run both at once.',
            '',
            'Only the spec owner counts.',
        ].join('\n'),
    ].join('\n\n')
