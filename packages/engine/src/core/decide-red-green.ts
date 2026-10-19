/**
 * A ticket's test and code steps: the test-writer's tests, the red check and
 * red commit, then the implementer's code, the gates and the green commit.
 */

import { alreadyDoneStep, checkAlreadyDoneStep } from './already-done'
import {
    isRefactorTicket,
    stuck,
    type BuildAction,
    type StepArgs,
} from './build-action'
import { launch } from './build-launch'
import { environmentFailedDetail } from './environment-rerun'
import { failedChecks, gateFixMessage, redFixMessage } from './fix-loop-text'
import { MAX_BAD_TEST_BOUNCES, MAX_FIX_ROUNDS } from './loop-caps'
import { badTestDetail, badTestTwiceText } from './stuck-text'

import { findCase } from '../gates/red-check'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { CommitStage } from '../journal/journal-record'
import type { TicketProgress } from '../journal/replay'
import { REFACTOR_LABEL } from '../tracker/tracker'

/**
 * A red commit after a bad-test bounce says so, so the history shows it. A
 * refactor ticket's one commit says it is a refactor.
 */
const commitMessage = ({
    stage,
    ticket,
    progress,
}: {
    stage: CommitStage
    ticket: TicketSnapshot
    progress: TicketProgress
}): string => {
    if (stage === 'fix') {
        return `fix: review round ${progress.review_fix?.round ?? progress.review_rounds} for #${ticket.number} ${ticket.title}`
    }
    if (stage === 'green') {
        if (progress.rejoins > 0) {
            return `fix: rejoin #${ticket.number} ${ticket.title} onto the run branch`
        }
        return isRefactorTicket({ ticket })
            ? `refactor: #${ticket.number} ${ticket.title}`
            : `feat: build #${ticket.number} ${ticket.title}`
    }
    return progress.bad_test_bounces > 0
        ? `test: replace a bad test for #${ticket.number} ${ticket.title}`
        : `test: add failing tests for #${ticket.number} ${ticket.title}`
}

export const commitStep = ({
    stage,
    ticket,
    progress,
}: {
    stage: CommitStage
    ticket: TicketSnapshot
    progress: TicketProgress
}): BuildAction | null => {
    if (progress.commits[stage] !== null) return null
    const hits = progress.leftovers[stage]
    if (hits !== null && hits.length > 0) {
        return stuck({
            ticket: ticket.number,
            reason: 'leftovers_found',
            detail: hits
                .map(({ path, reason }) => `${path}: ${reason}`)
                .join('\n'),
        })
    }
    return {
        type: 'commit_ticket',
        ticket: ticket.number,
        stage,
        message: commitMessage({ stage, ticket, progress }),
    }
}

/** The latest bad test, for a stuck detail (#490). */
export const badTestText = ({
    progress,
}: {
    progress: TicketProgress
}): string => badTestDetail({ bad_test: progress.bad_test })

/**
 * The test-writer's half of a ticket: fresh tests, the red check and its fix
 * loop, then the red commit. `null` once the red commit is made. A ticket
 * whose work the test-writer found already on the base branch is marked
 * done instead (#484); one that changes no behavior is stuck, as a refactor
 * ticket without its label.
 */
export const testStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
    base_branch,
}: StepArgs & { base_branch: string }): BuildAction | null => {
    const number = ticket.number
    const { test_writer, red_check } = progress
    if (test_writer === null) {
        return launch({
            role: 'test-writer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    }
    if (test_writer.outcome === 'already_done') {
        // Its evidence is checked first (#495). A failed check is a failed
        // try, which `failedTurnStep` takes before this step; checking the
        // same evidence again would only loop, so one left here is stuck.
        const check = progress.already_done_check
        if (check === null) {
            return checkAlreadyDoneStep({
                ticket,
                base_sha: progress.worktree?.base_sha ?? 'HEAD',
                result: test_writer,
            })
        }
        if (!check.ok) {
            return stuck({
                ticket: number,
                reason: 'agent_failed',
                detail: `The test-writer's "already_done" evidence did not check out:\n${check.problems.map((problem) => `- ${problem}`).join('\n')}`,
            })
        }
        return alreadyDoneStep({
            spec_number: snapshot.spec.number,
            base_branch,
            ticket,
            result: test_writer,
        })
    }
    if (test_writer.outcome === 'nothing_new_to_test') {
        return stuck({
            ticket: number,
            reason: 'nothing_new_to_test',
            detail:
                `The test-writer says this ticket changes no behavior, so no new test can fail first: ${test_writer.summary || 'no reason given'}\n` +
                `A ticket like that is a refactor ticket: add the \`${REFACTOR_LABEL}\` label and retry it.`,
        })
    }
    const blamed = environmentFailedDetail({
        environment:
            progress.environment?.check === 'red_check'
                ? progress.environment
                : null,
        reruns: progress.environment_reruns,
        latest: red_check,
    })
    if (blamed !== null) {
        return stuck({
            ticket: number,
            reason: 'environment_failed',
            detail: blamed,
        })
    }
    if (red_check === null) {
        return {
            type: 'run_red_check',
            ticket: number,
            criteria_ids: ticket.criteria.map(({ id }) => id),
            mapping: test_writer.criteria,
        }
    }
    if (!red_check.ok) {
        const problems = red_check.problems.join('\n')
        if (progress.red_fix_rounds >= MAX_FIX_ROUNDS) {
            return stuck({
                ticket: number,
                reason: 'red_check_failed',
                detail: `The red check still fails after ${MAX_FIX_ROUNDS} fix rounds:\n${problems}`,
            })
        }
        const session_id = progress.sessions['test-writer']
        const message = redFixMessage({ red_check })
        if (session_id === undefined) {
            return launch({
                role: 'test-writer',
                snapshot,
                ticket,
                progress,
                run_notes,
                follow_up: message,
            })
        }
        return {
            type: 'follow_up_agent',
            ticket: number,
            role: 'test-writer',
            session_id,
            message,
        }
    }
    return commitStep({ stage: 'red', ticket, progress })
}

/**
 * The implementer's half of a ticket: the code, the gates and their fix
 * loop, then the green commit. `null` once the green commit is made.
 */
export const codeStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction | null => {
    const number = ticket.number
    const { implementer } = progress
    if (implementer === null) {
        return launch({
            role: 'implementer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    }
    if (implementer.outcome === 'bad_test') {
        if (isRefactorTicket({ ticket })) {
            return stuck({
                ticket: number,
                reason: 'bad_test',
                detail: `The implementer of a refactor ticket sent a test back as bad; there is no test-writer to fix it: ${badTestText({ progress })}`,
            })
        }
        if (progress.bad_test_bounces > MAX_BAD_TEST_BOUNCES) {
            return stuck({
                ticket: number,
                reason: 'bad_test',
                detail: `${badTestTwiceText({ earlier: progress.bad_test_sources.at(-2) ?? 'implementer', latest: 'implementer' })}: ${badTestText({ progress })}`,
            })
        }
        // Throw away the implementer's work; replay then clears the ticket's
        // tests and code, so a fresh test-writer replaces the bad test.
        return { type: 'reset_ticket_worktree', ticket: number }
    }
    return (
        gateStep({ snapshot, ticket, progress, run_notes }) ??
        emptyTestStep({ ticket, progress }) ??
        commitStep({ stage: 'green', ticket, progress })
    )
}

/** Why the engine sends back a mapped test that checks nothing (#581). */
export const EMPTY_TEST_REASON =
    'It passes but runs no expect(), so it checks nothing (#581).'

/**
 * After a ticket's gates pass: a mapped test that passed with no `expect()`
 * goes back to a fresh test-writer, like a bad test (#581), and counts toward
 * the same cap. Not on a refactor ticket (it has no map), and not after a
 * rebase (the code is already reviewed). An older journal's cases carry no
 * count, so nothing is sent back. `null`: go on.
 *
 * It is not part of `gateStep`, which the review's fixes also use: their
 * tests are not red-checked.
 */
const emptyTestStep = ({
    ticket,
    progress,
}: {
    ticket: TicketSnapshot
    progress: TicketProgress
}): BuildAction | null => {
    if (isRefactorTicket({ ticket }) || progress.rejoin !== null) return null
    const cases = progress.gates?.cases ?? []
    const empty = progress.red_tests.find((test) => {
        const found = findCase({ cases, test })
        return found?.status === 'passed' && found.assertions === 0
    })
    if (empty === undefined) return null
    if (progress.bad_test_bounces >= MAX_BAD_TEST_BOUNCES) {
        return stuck({
            ticket: ticket.number,
            reason: 'bad_test',
            detail: `${badTestTwiceText({ earlier: progress.bad_test_sources.at(-1) ?? 'implementer', latest: 'engine' })}: "${empty.name}" in ${empty.file} runs no expect().`,
        })
    }
    return {
        type: 'reset_ticket_worktree',
        ticket: ticket.number,
        bad_test: {
            file: empty.file,
            name: empty.name,
            reason: EMPTY_TEST_REASON,
        },
    }
}

/**
 * The ticket's gates and their fix loop: failed gates go back to the same
 * implementer session (a fresh one with the same message if it is gone),
 * up to `MAX_FIX_ROUNDS` follow-ups. An `environment` answer reruns them
 * without a fix round; a rerun that fails the same way, or one past
 * `MAX_ENVIRONMENT_RERUNS`, is stuck (#613). `null` once the gates pass.
 */
export const gateStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction | null => {
    const number = ticket.number
    const { gates } = progress
    const blamed = environmentFailedDetail({
        environment:
            progress.environment?.check === 'gates'
                ? progress.environment
                : null,
        reruns: progress.environment_reruns,
        latest: gates,
    })
    if (blamed !== null) {
        return stuck({
            ticket: number,
            reason: 'environment_failed',
            detail: blamed,
        })
    }
    if (gates === null) {
        return { type: 'run_gates', ticket: number, target: 'ticket' }
    }
    if (gates.ok) return null
    if (progress.gate_fix_rounds >= MAX_FIX_ROUNDS) {
        return stuck({
            ticket: number,
            reason: 'gates_failed',
            detail: `The gates still fail after ${MAX_FIX_ROUNDS} fix rounds:\n${failedChecks({ gates })}`,
        })
    }
    const session_id = progress.sessions.implementer
    const message = gateFixMessage({ gates })
    if (session_id === undefined) {
        return launch({
            role: 'implementer',
            snapshot,
            ticket,
            progress,
            run_notes,
            follow_up: message,
        })
    }
    return {
        type: 'follow_up_agent',
        ticket: number,
        role: 'implementer',
        session_id,
        message,
    }
}
