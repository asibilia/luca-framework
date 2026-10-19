/**
 * Each ticket's next build step (`ticketSteps`): its worktree, the step its
 * progress calls for, a skip, a crash, or its stuck steps, with the join queue
 * deciding which approved ticket joins the run branch. Pure.
 */
import sortBy from 'lodash/sortBy'

import { stuck, type BuildAction } from './build-action'
import type { BuildView } from './decide-build-view'
import { crashDetail, crashedOut } from './decide-crashes'
import { skipDependent } from './decide-stuck'
import { nextTicketStep, sharedBaselineStep } from './decide-ticket'

import type { RunState, TicketProgress } from '../journal/replay'

/**
 * Whether a ticket's review finally approved it (no fix round open) and it
 * has not pushed yet: it waits in the join queue, or is joining.
 */
const inJoinQueue = (progress: TicketProgress): boolean =>
    progress.approved_seq !== null &&
    progress.review_fix === null &&
    progress.pushed === null

/** The next step of each ticket that can move now, at most one per ticket. */
export const ticketSteps = ({
    state,
    view,
}: {
    state: RunState
    view: BuildView
}): BuildAction[] => {
    const {
        spec_number,
        snapshot,
        run_branch,
        base_branch,
        run_notes,
        numbers,
        progress,
        skipped,
        finished,
        isStuck,
        stuckSteps,
    } = view

    // A ticket already on the run branch finishes its join first (#519): a
    // retried ticket approved earlier never joins on top of it.
    const queue = sortBy(
        numbers.filter(
            (number) =>
                inJoinQueue(progress(number)) &&
                !isStuck(number) &&
                !skipped(number)
        ),
        [
            (number) => progress(number).joined === null,
            (number) => progress(number).approved_seq,
        ]
    )
    // A stuck ticket's join is undone before any new ticket starts on it
    // or joins on top of it (#519): a join on top would be undone with it.
    const stuckJoinOnRunBranch = numbers.some(
        (number) =>
            isStuck(number) &&
            progress(number).joined?.ok === true &&
            progress(number).pushed === null
    )
    const joiner = stuckJoinOnRunBranch ? null : (queue[0] ?? null)

    const steps = numbers.flatMap((number): BuildAction[] => {
        const ticket = snapshot.tickets[number]
        const ticketProgress = progress(number)
        if (ticket === undefined || finished(number)) return []
        if (skipped(number)) return []
        // The same step cut off by crashes too often is not taken again.
        const crash = crashedOut({
            crashes: state.crashes,
            keys: (key) => key === String(number),
        })
        if (crash !== null) {
            return [
                stuck({
                    ticket: number,
                    reason: 'crashed',
                    detail: crashDetail({ crash }),
                }),
            ]
        }
        if (isStuck(number)) return stuckSteps(number)
        const skippedBlocker = ticket.blockers.find(skipped)
        if (skippedBlocker !== undefined) {
            return [
                skipDependent({
                    ticket: number,
                    because: skippedBlocker,
                    spec_number,
                }),
            ]
        }
        if (ticketProgress.worktree === null) {
            const ready =
                queue.length === 0 &&
                !stuckJoinOnRunBranch &&
                ticket.blockers.every(finished)
            return ready
                ? [
                      {
                          type: 'create_ticket_worktree',
                          ticket: number,
                          run_branch: run_branch.branch,
                      },
                  ]
                : []
        }
        const step = nextTicketStep({
            snapshot,
            ticket,
            progress: ticketProgress,
            run_notes,
            run_branch,
            base_branch,
            joiner: number === joiner,
            setup_files: state.config?.test_setup_files ?? [],
            baseline_step:
                ticketProgress.baseline === null
                    ? sharedBaselineStep({
                          number,
                          numbers,
                          progress,
                          can_move: (other) =>
                              !finished(other) &&
                              !skipped(other) &&
                              !isStuck(other),
                      })
                    : null,
        })
        return step === null ? [] : [step]
    })

    return steps
}
