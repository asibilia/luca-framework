/**
 * What the build half of the decision step reads about a run's tickets: the
 * tickets in order, each one's progress, whether it is skipped, pushed,
 * already done, finished, or stuck, and its stuck steps (`buildViewOf`). Pure.
 */
import type { BuildAction } from './build-action'
import { newestRunNotes } from './build-launch'
import { stuckTicketSteps } from './decide-stuck'

import {
    EMPTY_TICKET_PROGRESS,
    type ReplayedRunNote,
    type ReplayedSnapshot,
    type ReplayedWorktree,
    type RunState,
    type TicketProgress,
} from '../journal/replay'

/** The worktrees not removed yet, of these paths. */
export const notRemoved = ({
    paths,
    state,
}: {
    paths: string[]
    state: RunState
}): string[] => paths.filter((path) => !state.removed_worktrees.includes(path))

/** A run's tickets, as the build half of the decision step reads them. */
export type BuildView = {
    spec_number: number
    snapshot: ReplayedSnapshot
    run_branch: ReplayedWorktree
    base_branch: string
    run_notes: ReplayedRunNote[]
    /** The run's tickets that intake snapshotted, in order. */
    numbers: number[]
    progress: (number: number) => TicketProgress
    skipped: (number: number) => boolean
    pushed: (number: number) => boolean
    alreadyDone: (number: number) => boolean
    /** Pushed, or its work was already on the base branch (#484). */
    finished: (number: number) => boolean
    isStuck: (number: number) => boolean
    /** The steps that tell the owner a ticket is stuck, and take its reply. */
    stuckSteps: (number: number) => BuildAction[]
}

/** The view of a run that has a run branch and a snapshot. */
export const buildViewOf = ({
    state,
    spec_number,
    snapshot,
    run_branch,
}: {
    state: RunState
    spec_number: number
    snapshot: ReplayedSnapshot
    run_branch: ReplayedWorktree
}): BuildView => {
    const base_branch = state.base_branch ?? 'main'
    const run_notes = newestRunNotes({ run_notes: state.run_notes })
    const numbers = snapshot.ticket_order.filter(
        (number) => snapshot.tickets[number] !== undefined
    )
    const progress = (number: number): TicketProgress =>
        state.tickets[number] ?? EMPTY_TICKET_PROGRESS

    const skipped = (number: number) => progress(number).skipped !== null
    const pushed = (number: number) =>
        !numbers.includes(number) || progress(number).pushed !== null
    const alreadyDone = (number: number) =>
        progress(number).already_done !== null
    /** Pushed, or its work was already on the base branch (#484). */
    const finished = (number: number) => pushed(number) || alreadyDone(number)
    const stuckSteps = (number: number): BuildAction[] => {
        const ticket = snapshot.tickets[number]
        return ticket === undefined
            ? []
            : stuckTicketSteps({
                  spec_number,
                  ticket,
                  progress: progress(number),
              })
    }
    const isStuck = (number: number) =>
        progress(number).stuck !== null && !skipped(number)

    return {
        spec_number,
        snapshot,
        run_branch,
        base_branch,
        run_notes,
        numbers,
        progress,
        skipped,
        pushed,
        alreadyDone,
        finished,
        isStuck,
        stuckSteps,
    }
}
