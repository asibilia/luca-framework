import type { BuildAction } from './build-action'
import { withChangesetsSections, withWriterSection } from './build-launch'
import { haltSteps, installSteps } from './decide-build-early'
import { finishSteps } from './decide-build-ending'
import { ticketSteps, type TicketWait } from './decide-build-tickets'
import { buildViewOf } from './decide-build-view'
import { replySteps } from './decide-stuck'

import { featureMapSection, prepareSection } from '../agents/role-prompts'
import { featureMapPath } from '../config/engine-config'
import type { RunState } from '../journal/replay'

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
export const decideBuild = (args: {
    state: RunState
    spec_number: number
}): BuildAction[] => decideBuildPlan(args).steps

/**
 * `decideBuild`'s steps, and beside them the tickets that wait on purpose
 * between steps now (#559): the same decision, so a wait is only ever one
 * that left its ticket no step. None while the run is halted, holds on its
 * install, or has yet to make its run branch.
 *
 * @example
 * decideBuildPlan({ state, spec_number })
 * // { steps: [{ type: 'run_baseline_tests', ticket: 11 }], waits: [{ ticket: 12, for: 'baseline', on_ticket: 11 }] }
 */
export const decideBuildPlan = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): { steps: BuildAction[]; waits: TicketWait[] } => {
    const { steps, waits } = buildSteps({ state, spec_number })
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
    return {
        steps: state.changesets ? mapped.map(withChangesetsSections) : mapped,
        waits,
    }
}

/**
 * `decideBuild`'s steps, before the prepare command joins any prompt: the run
 * branch, then the steps that end the run or hold it on the run branch's
 * install, each ticket's next step, and last the finish (`finishSteps`);
 * with the tickets' waits once they are decided.
 */
const buildSteps = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): { steps: BuildAction[]; waits: TicketWait[] } => {
    const { snapshot, run_branch } = state
    if (run_branch === null || snapshot === null) {
        return {
            steps: [
                {
                    type: 'create_run_branch',
                    spec_number,
                    base_branch: state.base_branch ?? 'main',
                },
            ],
            waits: [],
        }
    }
    const view = buildViewOf({ state, spec_number, snapshot, run_branch })
    const halted = haltSteps({ state, view })
    if (halted !== null) return { steps: halted, waits: [] }
    const replies = replySteps({ state, spec_number, numbers: view.numbers })
    const installing = installSteps({ state, view, replies })
    if (installing !== null) return { steps: installing, waits: [] }
    const { steps, waits } = ticketSteps({ state, view })
    if (steps.length > 0 || replies.length > 0) {
        return { steps: [...steps, ...replies], waits }
    }
    return { steps: finishSteps({ state, view, replies }), waits }
}
