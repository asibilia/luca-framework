import sortBy from 'lodash/sortBy'

import { closeTicketStep } from './already-done'
import { stuck, type BuildAction } from './build-action'
import {
    newestRunNotes,
    withChangesetsSections,
    withWriterSection,
} from './build-launch'
import { changesetStep } from './changeset'
import { crashDetail, crashedOut } from './decide-crashes'
import { decideFinalReview } from './decide-final-review'
import {
    finalStuckSteps,
    replySteps,
    skipDependent,
    stuckTicketSteps,
} from './decide-stuck'
import {
    installFailure,
    nextTicketStep,
    sharedBaselineStep,
} from './decide-ticket'
import { pullRequestText } from './pull-request-text'

import { featureMapSection, prepareSection } from '../agents/role-prompts'
import { featureMapPath } from '../config/engine-config'
import {
    EMPTY_TICKET_PROGRESS,
    type RunState,
    type TicketProgress,
} from '../journal/replay'

export { isRefactorTicket, type BuildAction } from './build-action'
export { MAX_RUN_NOTES, mayEditTests, newestRunNotes } from './build-launch'
export { EMPTY_TEST_REASON } from './decide-red-green'
export {
    MAX_BAD_TEST_BOUNCES,
    MAX_ENGINE_FAILURES,
    MAX_FIX_ROUNDS,
    MAX_REJOINS,
    MAX_TEST_UPDATES,
    MAX_TESTS_PER_CRITERION,
} from './loop-caps'

/**
 * Whether a ticket's review finally approved it (no fix round open) and it
 * has not pushed yet: it waits in the join queue, or is joining.
 */
const inJoinQueue = (progress: TicketProgress): boolean =>
    progress.approved_seq !== null &&
    progress.review_fix === null &&
    progress.pushed === null

/** The worktrees not removed yet, of these paths. */
const notRemoved = ({
    paths,
    state,
}: {
    paths: string[]
    state: RunState
}): string[] => paths.filter((path) => !state.removed_worktrees.includes(path))

/**
 * The build half of the decision step: every step of building the run's
 * tickets that can run now, at most one per ticket, then the PR. Pure.
 *
 * Tickets build at the same time. A ticket starts (gets its worktree from
 * the run branch's tip, then its install) once every ticket it waits on has
 * pushed, and while no ticket waits to join, so it never builds on joined
 * commits whose gates have not passed yet. Approved tickets join one at a
 * time, in the order their reviews finally approved them, except that one
 * already joining finishes first. A clash or failed
 * gates after joining puts the ticket's change back on top of the run
 * branch to be fixed there (up to `MAX_REJOINS` times), then re-reviewed.
 * While a stuck ticket's join is still on the run branch, no ticket starts
 * or joins until it is undone (#519), so no join lands on top of a join
 * that is going away. A stuck ticket ends the run: no ticket starts or
 * moves on, and the worktrees of pushed tickets are removed. Once every
 * ticket pushed, the final review looks at the whole run branch
 * (`decideFinalReview`) before the PR opens; a stuck final review ends the run with the run branch's worktree kept. In a
 * repo with changesets, the run's changeset is written just before the PR
 * (`write_changeset`), once. Once
 * the PR is open, every worktree is removed. Branches and the journal stay.
 *
 * Fix loops: a failed red check goes back to the same test-writer session,
 * and failed gates to the same implementer session, with their output, for
 * up to `MAX_FIX_ROUNDS` follow-ups; then the ticket is stuck. A bad test
 * throws away the implementer's work and goes to a fresh test-writer, whose
 * tests get their own red check and red commit; the next bad test is stuck.
 * After a rebase, a bad test can't throw the work away: the tests go back
 * to the test-writer to fit the run branch, with the code kept, up to
 * `MAX_TEST_UPDATES` times (#489). "Nothing new to test" is stuck at once.
 * A refactor ticket skips the test-writer and the red check. The ticket
 * review's findings go back for fixing in capped rounds, each re-reviewed.
 *
 * Already done (#484): a ticket whose test-writer found its work already on
 * the base branch has that evidence checked first (`check_already_done`,
 * #495); evidence that doesn't check out is a failed try for the
 * test-writer. Once it checks out, the ticket is marked done
 * (`mark_already_done`), not stuck. It counts
 * as pushed for the tickets that wait on it, and the PR closes it. With no
 * ticket pushed, the engine closes the already-done tickets itself
 * (`close_ticket`); if every ticket was already done, the run ends with
 * nothing to do (`finish_nothing_to_do`).
 *
 * Failed tries: a failed agent turn goes back to the same session with what
 * failed (a reviewer gets a fresh launch), up to `MAX_FIX_ROUNDS` failed
 * tries per role on a ticket; an engine failure starts a fresh agent without
 * using up a try, up to `MAX_ENGINE_FAILURES` in a row. A leftover is still
 * stuck.
 *
 * @example
 * decideBuild({ state, spec_number })
 * // [{ type: 'create_ticket_worktree', ticket: 11, ... }, { type: 'create_ticket_worktree', ticket: 12, ... }]
 */
export const decideBuild = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): BuildAction[] => {
    const steps = buildSteps({ state, spec_number })
    const command = state.config?.prepare
    const prepared =
        command === undefined
            ? steps
            : steps.map((step) =>
                  withWriterSection({
                      step,
                      section: prepareSection({ command }),
                  })
              )
    const map =
        state.config === null ? null : featureMapPath({ config: state.config })
    const mapped =
        map === null
            ? prepared
            : prepared.map((step) =>
                  withWriterSection({
                      step,
                      section: featureMapSection({ path: map }),
                      only: 'test-writer',
                  })
              )
    return state.changesets ? mapped.map(withChangesetsSections) : mapped
}

/** `decideBuild`'s steps, before the prepare command joins any prompt. */
const buildSteps = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): BuildAction[] => {
    const { snapshot, run_branch, run_branch_install, pull_request } = state
    const base_branch = state.base_branch ?? 'main'
    const run_notes = newestRunNotes({ run_notes: state.run_notes })
    if (run_branch === null || snapshot === null) {
        return [{ type: 'create_run_branch', spec_number, base_branch }]
    }
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
    const replies = replySteps({ state, spec_number, numbers })
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
    if (steps.length > 0 || replies.length > 0) return [...steps, ...replies]

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
