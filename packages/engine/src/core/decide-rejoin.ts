/**
 * A ticket's join and rebase steps: joining the run branch, and fixing the
 * ticket on top of it after a clash or failed gates, with its test updates.
 */

import {
    isRefactorTicket,
    stuck,
    type BuildAction,
    type StepArgs,
} from './build-action'
import { launch } from './build-launch'
import { badTestText } from './decide-red-green'
import {
    clashFixMessage,
    failedChecks,
    testsUpdatedMessage,
} from './fix-loop-text'
import { MAX_REJOINS, MAX_TEST_UPDATES } from './loop-caps'
import { badTestDetail } from './stuck-text'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { ReplayedWorktree, TicketProgress } from '../journal/replay'

/**
 * The fix on top of the run branch after a rebase: first a fresh test-writer
 * for clashed tests, then the implementer for clashed code. `null` once both
 * have answered; the gates, the green commit, and a fresh review of the new
 * changes follow as usual.
 *
 * A bad test here can't reset the worktree, which would throw the ticket's
 * uncommitted change away. Instead its tests go back to the test-writer
 * (`send_tests_back`, #489), up to `MAX_TEST_UPDATES` times per ticket, then
 * it is stuck. A refactor ticket has no test-writer, so it is stuck at once.
 */
export const rejoinStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction | null => {
    const { rejoin } = progress
    if (rejoin === null) return null
    if (progress.test_update !== null) {
        return testUpdateStep({ snapshot, ticket, progress, run_notes })
    }
    if (progress.implementer?.outcome === 'bad_test') {
        return sendTestsBackStep({ ticket, progress, rejoin })
    }
    if (rejoin.tests_pending) {
        return launch({
            role: 'test-writer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    }
    if (rejoin.code_pending) {
        const session_id = progress.sessions.implementer
        if (session_id === undefined) {
            return launch({
                role: 'implementer',
                snapshot,
                ticket,
                progress,
                run_notes,
            })
        }
        return {
            type: 'follow_up_agent',
            ticket: ticket.number,
            role: 'implementer',
            session_id,
            message: clashFixMessage({ rejoin }),
        }
    }
    return null
}

/**
 * A bad test after a rebase: its tests go back to the test-writer, or, past
 * the cap or on a refactor ticket, it is stuck with the implementer's reason.
 */
const sendTestsBackStep = ({
    ticket,
    progress,
    rejoin,
}: {
    ticket: TicketSnapshot
    progress: TicketProgress
    rejoin: NonNullable<TicketProgress['rejoin']>
}): BuildAction => {
    const number = ticket.number
    if (isRefactorTicket({ ticket })) {
        return stuck({
            ticket: number,
            reason: 'bad_test',
            detail: `The implementer of a refactor ticket sent a test back as bad while fixing the ticket on top of the run branch; there is no test-writer to update it: ${badTestText({ progress })}`,
        })
    }
    if (progress.test_updates >= MAX_TEST_UPDATES) {
        return stuck({
            ticket: number,
            reason: 'bad_test',
            detail: `The implementer sent a test back as bad on top of the run branch after the test-writer updated the tests ${MAX_TEST_UPDATES} times: ${badTestText({ progress })}`,
        })
    }
    return {
        type: 'send_tests_back',
        ticket: number,
        round: progress.test_updates + 1,
        bad_test: progress.bad_test ?? {
            file: '',
            name: '',
            reason: progress.implementer?.summary ?? '',
        },
        from_sha: rejoin.from_sha,
        base_sha: rejoin.base_sha,
    }
}

/**
 * The open test update after a rebase (#489): a fresh test-writer updates
 * the tests (its prompt says what joined and why the test is wrong), then
 * the implementer finishes the ticket (a follow-up in its session, or a
 * fresh one). There is no red check here: the implementer's code is already
 * in the worktree, so the updated tests may pass, and the red commit already
 * proved the ticket's tests failed first. The test-writer's mapping must
 * still give every criterion a test; then the gates run every test, the
 * updated ones and the run branch's together, and a fresh reviewer checks
 * the whole change.
 */
const testUpdateStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction => {
    const update = progress.test_update
    if (update === null || update.result === null) {
        return launch({
            role: 'test-writer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    }
    const { result } = update
    if (result.outcome !== 'tests_written') {
        return stuck({
            ticket: ticket.number,
            reason: 'bad_test',
            detail:
                `The implementer sent a test back as bad on top of the run branch, and the test-writer answered "${result.outcome}" instead of updating the tests: ${result.summary || 'no reason given'}\n` +
                `The bad test: ${badTestDetail({ bad_test: update.bad_test })}`,
        })
    }
    const unmapped = ticket.criteria
        .map(({ id }) => id)
        .filter(
            (id) =>
                !result.criteria.some(
                    ({ criterion_id, tests }) =>
                        criterion_id === id && tests.length > 0
                )
        )
    if (unmapped.length > 0) {
        return stuck({
            ticket: ticket.number,
            reason: 'red_check_failed',
            detail: `After updating the tests on top of the run branch, the test-writer mapped no test to ${unmapped.join(', ')}. Every criterion needs a test.`,
        })
    }
    const session_id = progress.sessions.implementer
    if (session_id === undefined) {
        return launch({
            role: 'implementer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    }
    return {
        type: 'follow_up_agent',
        ticket: ticket.number,
        role: 'implementer',
        session_id,
        message: testsUpdatedMessage({
            bad_test: update.bad_test,
            summary: result.summary,
        }),
    }
}

/**
 * The join section of an approved ticket, for the first ticket in the join
 * queue only: join, the gates on the run branch, the push. A clash or failed
 * gates sends the ticket back onto the run branch, up to `MAX_REJOINS`
 * times; after that it is stuck. `null` once pushed.
 */
export const joinStep = ({
    ticket,
    progress,
    run_branch,
}: {
    ticket: TicketSnapshot
    progress: TicketProgress
    run_branch: ReplayedWorktree
}): BuildAction | null => {
    const number = ticket.number
    const { joined, join_gates } = progress
    if (joined === null) {
        return { type: 'join_run_branch', ticket: number }
    }
    if (!joined.ok) {
        if (progress.rejoins >= MAX_REJOINS) {
            return stuck({
                ticket: number,
                reason: 'join_failed',
                detail: `The ticket still clashes with the run branch after ${MAX_REJOINS} rebases:\n${joined.error}`,
            })
        }
        return {
            type: 'rebase_ticket',
            ticket: number,
            cause: 'clash',
            undo_first_sha: null,
        }
    }
    if (join_gates === null) {
        return { type: 'run_gates', ticket: number, target: 'run_branch' }
    }
    if (!join_gates.ok) {
        if (progress.rejoins >= MAX_REJOINS) {
            return stuck({
                ticket: number,
                reason: 'join_gates_failed',
                detail: `The gates still fail after joining, after ${MAX_REJOINS} rebases:\n${failedChecks({ gates: join_gates })}`,
            })
        }
        return {
            type: 'rebase_ticket',
            ticket: number,
            cause: 'join_gates',
            undo_first_sha: joined.shas[0] ?? null,
        }
    }
    if (progress.pushed === null) {
        return {
            type: 'push_run_branch',
            ticket: number,
            branch: run_branch.branch,
        }
    }
    return null
}
