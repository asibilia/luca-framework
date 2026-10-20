/**
 * One ticket's next step once it has its worktree: a failed turn, its
 * install and prepare, its shared baseline, then its tests, code, review
 * and join.
 */

import {
    isRefactorTicket,
    stuck,
    type BuildAction,
    type StepArgs,
} from './build-action'
import { launch } from './build-launch'
import { codeStep, testStep } from './decide-red-green'
import { joinStep, rejoinStep } from './decide-rejoin'
import { reviewStep } from './decide-ticket-review'
import { failedTryMessage } from './fix-loop-text'
import { MAX_ENGINE_FAILURES, MAX_FIX_ROUNDS } from './loop-caps'
import { setupChangeDetail } from './stuck-text'

import { endedText } from '../gates/gate-schemas'
import type {
    ReplayedInstall,
    ReplayedWorktree,
    TicketProgress,
} from '../journal/replay'

/** Why an install failed, for the stuck detail, or `null` if it passed. */
export const installFailure = ({
    install,
    where,
}: {
    install: ReplayedInstall
    where: string
}): string | null => {
    const { check } = install
    if (check === null || check.ok) return null
    return `\`${check.command}\` failed in ${where} (${endedText(check)}). Agents never run the install, so fix the manifest or lockfile on the base branch and retry.\n${check.output}`
}

/**
 * The next step after a failed agent turn. An engine failure starts a fresh
 * agent of the same role without using up a try, until
 * `MAX_ENGINE_FAILURES` in a row. Any other failure uses up one of the
 * role's tries on the ticket; with tries left, a test-writer or implementer
 * gets a follow-up in the session that failed (a fresh launch with the same
 * message if it has none, such as after a crash), and a reviewer a fresh
 * launch. The last try's failure is stuck.
 */
const failedTurnStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
    failed,
}: StepArgs & {
    failed: NonNullable<TicketProgress['agent_failure']>
}): BuildAction => {
    const { role, error, failure, session_id } = failed
    if (failure === 'engine') {
        if (progress.engine_failures >= MAX_ENGINE_FAILURES) {
            return stuck({
                ticket: ticket.number,
                reason: 'agent_failed',
                detail: `The engine failed to run the ${role} ${progress.engine_failures} times in a row: ${error}`,
            })
        }
        return launch({ role, snapshot, ticket, progress, run_notes })
    }
    const tries = progress.failed_tries[role] ?? 0
    if (tries >= MAX_FIX_ROUNDS) {
        return stuck({
            ticket: ticket.number,
            reason: 'agent_failed',
            detail: `The ${role} failed ${tries} tries; the last one: ${error}`,
        })
    }
    if (role === 'ticket-reviewer') {
        return launch({ role, snapshot, ticket, progress, run_notes })
    }
    const message = failedTryMessage({ failure, error })
    if (session_id === null) {
        return launch({
            role,
            snapshot,
            ticket,
            progress,
            run_notes,
            follow_up: message,
        })
    }
    return {
        type: 'follow_up_agent',
        ticket: ticket.number,
        role,
        session_id,
        message,
    }
}

type SharedBaselineArgs = {
    number: number
    /** The run's tickets, in order. */
    numbers: number[]
    progress: (number: number) => TicketProgress
    /** Whether a ticket is neither pushed, skipped, nor stuck. */
    can_move: (number: number) => boolean
}

/**
 * The ticket that runs the baseline tests a ticket with no baseline shares:
 * the first ticket still able to move whose worktree starts from the same
 * run-branch commit and has no baseline yet. `null` with no worktree.
 */
export const baselineRunner = ({
    number,
    numbers,
    progress,
    can_move,
}: SharedBaselineArgs): number | null => {
    const base_sha = progress(number).worktree?.base_sha
    if (base_sha === undefined) return null
    return (
        numbers.find(
            (other) =>
                can_move(other) &&
                progress(other).baseline === null &&
                progress(other).worktree?.base_sha === base_sha
        ) ?? null
    )
}

/**
 * How a ticket with no baseline gets one. Tickets whose worktrees start from
 * the same run-branch commit share one baseline test run: a ticket reuses a
 * baseline taken at its commit, or else the first such ticket still able to
 * move runs the tests (`baselineRunner`) and the rest wait for it. `null`:
 * it waits.
 */
export const sharedBaselineStep = (
    args: SharedBaselineArgs
): BuildAction | null => {
    const { number, numbers, progress } = args
    const base_sha = progress(number).worktree?.base_sha
    if (base_sha === undefined) return null
    const lender = numbers.find(
        (other) =>
            other !== number &&
            progress(other).baseline !== null &&
            progress(other).baseline_sha === base_sha
    )
    if (lender !== undefined) {
        return {
            type: 'reuse_baseline_tests',
            ticket: number,
            from_ticket: lender,
            base_sha,
        }
    }
    return baselineRunner(args) === number
        ? { type: 'run_baseline_tests', ticket: number }
        : null
}

/**
 * The next step for one ticket that has its worktree, or `null` when it has
 * nothing to do now: it pushed, or its review approved and it waits its turn
 * to join.
 */
export const nextTicketStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
    run_branch,
    joiner,
    setup_files,
    baseline_step,
    base_branch,
}: StepArgs & {
    run_branch: ReplayedWorktree
    /** The branch the run started from. */
    base_branch: string
    /** Whether the ticket is first in the join queue. */
    joiner: boolean
    /** The config's test setup files. */
    setup_files: string[]
    /** How it gets its baseline, if it has none (`sharedBaselineStep`). */
    baseline_step: BuildAction | null
}): BuildAction | null => {
    const number = ticket.number
    if (progress.agent_failure !== null) {
        return failedTurnStep({
            snapshot,
            ticket,
            progress,
            run_notes,
            failed: progress.agent_failure,
        })
    }
    if (progress.setup_change !== null) {
        return stuck({
            ticket: number,
            reason: 'setup_change_needed',
            detail: setupChangeDetail({
                ...progress.setup_change,
                setup_files,
            }),
        })
    }
    if (progress.install === null) {
        return {
            type: 'install_dependencies',
            target: 'ticket',
            ticket: number,
        }
    }
    const ticketFailure = installFailure({
        install: progress.install,
        where: `the worktree of #${number}`,
    })
    if (ticketFailure !== null) {
        return stuck({
            ticket: number,
            reason: 'install_failed',
            detail: ticketFailure,
        })
    }
    const { prepare } = progress
    if (prepare !== null && !prepare.ok) {
        return stuck({
            ticket: number,
            reason: 'prepare_failed',
            detail: `\`${prepare.command}\` failed in the worktree of #${number} (${endedText(prepare)}) before any agent worked on it. Agents never run the prepare command, so fix what it needs (a missing tool, say) and retry.\n${prepare.output}`,
        })
    }
    if (progress.baseline === null) return baseline_step
    if (progress.commits.green === null) {
        const rejoin = rejoinStep({
            snapshot,
            ticket,
            progress,
            run_notes,
        })
        if (rejoin !== null) return rejoin
        const tests = isRefactorTicket({ ticket })
            ? null
            : testStep({
                  snapshot,
                  ticket,
                  progress,
                  run_notes,
                  base_branch,
              })
        if (tests !== null) return tests
        const code = codeStep({ snapshot, ticket, progress, run_notes })
        if (code !== null) return code
    }
    const review = reviewStep({
        snapshot,
        ticket,
        progress,
        run_notes,
    })
    if (review !== null) return review
    return joiner ? joinStep({ ticket, progress, run_branch }) : null
}
