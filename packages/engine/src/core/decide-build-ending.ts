/**
 * The build steps once no ticket can move: closing the already-done tickets
 * when none joined, the final review, the changeset, and the PR
 * (`finishSteps`). Pure.
 */
import { closeTicketStep } from './already-done'
import type { BuildAction } from './build-action'
import { changesetStep } from './changeset'
import { notRemoved, type BuildView } from './decide-build-view'
import { decideFinalReview } from './decide-final-review'
import { finalStuckSteps } from './decide-stuck'
import { pullRequestText } from './pull-request-text'

import type { RunState } from '../journal/replay'

/**
 * The steps when no ticket can move now: the already-done tickets closed, the
 * final review, the changeset, and the PR. `replies` are the owner's replies
 * a stuck final review takes.
 */
export const finishSteps = ({
    state,
    view,
    replies,
}: {
    state: RunState
    view: BuildView
    replies: BuildAction[]
}): BuildAction[] => {
    const {
        spec_number,
        snapshot,
        run_branch,
        base_branch,
        run_notes,
        numbers,
        progress,
        pushed,
        alreadyDone,
        finished,
        skipped,
    } = view

    if (
        numbers.every((number) => finished(number) || skipped(number)) &&
        !numbers.some(pushed)
    ) {
        // No ticket joined the run branch: no PR, and nothing left to build.
        // The engine closes the already-done tickets itself (#484).
        const closing = numbers.filter(
            (number) => alreadyDone(number) && !progress(number).closed
        )
        if (closing.length > 0) {
            return closing.map((number) =>
                closeTicketStep({
                    spec_number,
                    base_branch,
                    ticket: number,
                    shas: progress(number).already_done?.shas ?? [],
                })
            )
        }
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
        if (numbers.some(skipped)) {
            return [{ type: 'done', outcome: 'all_skipped' }]
        }
        // Every ticket's work was already done: nothing to do.
        return [
            {
                type: 'finish_nothing_to_do',
                closed_tickets: snapshot.closed_tickets,
                already_done: numbers.filter(alreadyDone),
            },
        ]
    }
    if (numbers.every((number) => finished(number) || skipped(number))) {
        const final = decideFinalReview({
            review: state.final_review,
            crashes: state.crashes,
            snapshot,
            run_branch,
            run_branch_gates: state.run_branch_gates,
            run_notes,
            setup_files: state.config?.test_setup_files ?? [],
        })
        if (final.status === 'working') return final.actions
        if (final.status === 'stuck') {
            // The run branch's worktree stays for a retry.
            const paths = notRemoved({
                state,
                paths: numbers.flatMap((number) => {
                    const { worktree } = progress(number)
                    return worktree === null ? [] : [worktree.path]
                }),
            })
            if (paths.length > 0) return [{ type: 'remove_worktrees', paths }]
            // The owner hears of it, and the run waits for their reply.
            return [
                ...finalStuckSteps({ state, spec_number, run_branch }),
                ...replies,
            ]
        }
        if (state.changesets && state.changeset === null) {
            return [
                {
                    type: 'write_changeset',
                    branch: run_branch.branch,
                    ...changesetStep({ spec: snapshot.spec }),
                },
            ]
        }
        return [
            {
                type: 'open_pull_request',
                head: run_branch.branch,
                base: base_branch,
                ...pullRequestText({
                    snapshot,
                    tickets: state.tickets,
                    final_review: state.final_review,
                    memory_saves: state.memory.saved?.saves ?? [],
                }),
            },
        ]
    }
    return [
        {
            type: 'invalid_journal',
            reason: `No ticket can move: ${numbers
                .filter((number) => !finished(number))
                .map((number) => `#${number}`)
                .join(', ')} wait on tickets that never join.`,
        },
    ]
}
