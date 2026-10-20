/**
 * Each ticket's next build step (`ticketSteps`): its worktree, the step its
 * progress calls for, a skip, a crash, or its stuck steps, with the join queue
 * deciding which approved ticket joins the run branch. A ticket with no step
 * now because it waits on purpose (its `TicketWait`) waits for another
 * ticket's shared baseline, the join queue, or the start queue. Pure.
 */
import sortBy from 'lodash/sortBy'

import { stuck, type BuildAction } from './build-action'
import type { BuildView } from './decide-build-view'
import { crashDetail, crashedOut } from './decide-crashes'
import { skipDependent } from './decide-stuck'
import {
    baselineRunner,
    nextTicketStep,
    sharedBaselineStep,
} from './decide-ticket'

import type { RunState, TicketProgress } from '../journal/replay'

/**
 * A ticket held on purpose between steps (#559): for `baseline`, another
 * ticket's shared baseline tests; for `join`, the join queue; for `start`,
 * the start queue; each on `on_ticket`.
 */
export type TicketWait = {
    ticket: number
    for: 'baseline' | 'join' | 'start'
    on_ticket: number | null
}

/** A ticket's next steps, or the wait that holds it. */
type TicketPlan = { steps: BuildAction[]; wait: TicketWait | null }

const NOTHING: TicketPlan = { steps: [], wait: null }

/**
 * Whether a ticket's review finally approved it (no fix round open) and it
 * has not pushed yet: it waits in the join queue, or is joining.
 */
const inJoinQueue = (progress: TicketProgress): boolean =>
    progress.approved_seq !== null &&
    progress.review_fix === null &&
    progress.pushed === null

/** Each ticket's plan: its next step, at most one, or what it waits for. */
const ticketPlans = ({
    state,
    view,
}: {
    state: RunState
    view: BuildView
}): TicketPlan[] => {
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
    const can_move = (other: number) =>
        !finished(other) && !skipped(other) && !isStuck(other)

    return numbers.map((number): TicketPlan => {
        const ticket = snapshot.tickets[number]
        const ticketProgress = progress(number)
        if (ticket === undefined || finished(number)) return NOTHING
        if (skipped(number)) return NOTHING
        // The same step cut off by crashes too often is not taken again.
        const crash = crashedOut({
            crashes: state.crashes,
            keys: (key) => key === String(number),
        })
        if (crash !== null) {
            return {
                steps: [
                    stuck({
                        ticket: number,
                        reason: 'crashed',
                        detail: crashDetail({ crash }),
                    }),
                ],
                wait: null,
            }
        }
        if (isStuck(number)) return { steps: stuckSteps(number), wait: null }
        const skippedBlocker = ticket.blockers.find(skipped)
        if (skippedBlocker !== undefined) {
            return {
                steps: [
                    skipDependent({
                        ticket: number,
                        because: skippedBlocker,
                        spec_number,
                    }),
                ],
                wait: null,
            }
        }
        if (ticketProgress.worktree === null) {
            const unblocked =
                !stuckJoinOnRunBranch && ticket.blockers.every(finished)
            if (unblocked && queue.length === 0) {
                return {
                    steps: [
                        {
                            type: 'create_ticket_worktree',
                            ticket: number,
                            run_branch: run_branch.branch,
                        },
                    ],
                    wait: null,
                }
            }
            // Unblocked, it starts once the join queue is empty.
            return unblocked
                ? {
                      steps: [],
                      wait: {
                          ticket: number,
                          for: 'start',
                          on_ticket: queue[0] ?? null,
                      },
                  }
                : NOTHING
        }
        const baseline = { number, numbers, progress, can_move }
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
                    ? sharedBaselineStep(baseline)
                    : null,
        })
        if (step !== null) return { steps: [step], wait: null }
        if (ticketProgress.baseline === null) {
            return {
                steps: [],
                wait: {
                    ticket: number,
                    for: 'baseline',
                    on_ticket: baselineRunner(baseline),
                },
            }
        }
        return inJoinQueue(ticketProgress) && number !== joiner
            ? {
                  steps: [],
                  wait: { ticket: number, for: 'join', on_ticket: joiner },
              }
            : NOTHING
    })
}

/**
 * The next step of each ticket that can move now, at most one per ticket,
 * and the tickets that wait on purpose between steps now, in ticket order:
 * one decision, so a wait is only ever one that left its ticket no step.
 */
export const ticketSteps = (args: {
    state: RunState
    view: BuildView
}): { steps: BuildAction[]; waits: TicketWait[] } => {
    const plans = ticketPlans(args)
    return {
        steps: plans.flatMap(({ steps }) => steps),
        waits: plans.flatMap(({ wait }) => (wait === null ? [] : [wait])),
    }
}
