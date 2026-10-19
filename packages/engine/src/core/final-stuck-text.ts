/**
 * The comment on the spec issue when the final review is stuck.
 */
import compact from 'lodash/compact'

import { fenced, plural } from './stuck-format'
import { leftoverAllowHint, reasonLine } from './ticket-stuck-text'

import type { StuckReason } from '../journal/journal-record'
import type { FinalReviewState, ReplayedWorktree } from '../journal/replay'

/** Why the final review is stuck, in one line, where it differs from a ticket. */
const FINAL_REASON_LINES: Partial<Record<StuckReason, string>> = {
    changes_requested: 'The final review still asks for changes.',
    gates_failed: "The checks still fail after the final review's fixes.",
    bad_test:
        "While fixing the final review's findings, the implementer sent a test back as bad.",
    agent_failed: 'A final review agent failed on every try it had.',
    crashed:
        'The engine crashed in the same final review step, again and again.',
    environment_failed:
        "A fixer says the final checks' failure is not the branch's fault, but the rerun failed the same way, or its reruns ran out.",
}

/** What the owner could do about the stuck final review, per reason. */
const finalSuggestion = ({ reason }: { reason: StuckReason }): string => {
    switch (reason) {
        case 'changes_requested':
            return "Fix the open findings in the run branch's worktree, then reply `retry`; or reply `ship` if they can wait for review in the PR."
        case 'leftovers_found':
            return `Delete those files in the run branch's worktree, then reply \`retry\`. ${leftoverAllowHint({ retry: '`retry`' })}`
        case 'setup_change_needed':
            return "Make that change yourself in the run branch's worktree, then reply `retry`; or reply `ship` to open the PR anyway."
        default:
            return "Read the last error, fix what trips it in the run branch's worktree, then reply `retry`; or reply `ship` to open the PR anyway."
    }
}

/**
 * The comment on the spec issue when the final review is stuck: why (one
 * line), what was tried, the last error, a suggestion, and the replies:
 * `retry`, `stop`, and `ship` (never `skip`).
 *
 * @example
 * finalStuckComment({ review, run_branch })
 * // '**The final review is stuck**\n\nWhy: The final review still asks for changes. ...'
 */
export const finalStuckComment = ({
    review,
    run_branch,
}: {
    review: FinalReviewState
    run_branch: ReplayedWorktree
}): string => {
    const stuck = review.stuck ?? { reason: 'agent_failed', detail: '' }
    const tries = Object.entries(review.failed_tries).flatMap(
        ([role, count]) =>
            count === undefined || count === 0
                ? []
                : [`${plural(count, 'failed try')} by the ${role}`]
    )
    const tried = compact([
        review.round > 1 && plural(review.round - 1, 'fix round'),
        review.gate_fix_rounds > 0 &&
            `${plural(review.gate_fix_rounds, 'fix round')} on the checks`,
        ...tries,
    ])
    return [
        '**The final review is stuck**',
        [
            `Why: ${FINAL_REASON_LINES[stuck.reason] ?? reasonLine({ reason: stuck.reason })}`,
            `Tried: ${tried.length === 0 ? 'Nothing more: another try would fail the same way.' : `${tried.join(', ')}.`}`,
            `Suggestion: ${finalSuggestion({ reason: stuck.reason })}`,
            `Run branch worktree: \`${run_branch.path}\` (a \`retry\` keeps your edits there)`,
        ].join('\n'),
        `Last error:\n\n${fenced(stuck.detail)}`,
        [
            'Reply with one word on this issue:',
            '- `retry`: fix the open findings again with fresh agents and fresh counts, keeping your edits.',
            '- `ship`: open the PR anyway, with the open findings listed at the top.',
            '- `stop`: end the run without a PR. The branch is kept.',
            '',
            'Only the spec owner counts.',
        ].join('\n'),
    ].join('\n\n')
}
