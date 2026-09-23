import { failedChecks, gateFixMessage, redFixMessage } from './fix-loop-text'
import { pullRequestText } from './pull-request-text'

import { rolePrompt } from '../agents/role-prompts'
import type { AgentRole, CriterionTests } from '../agents/role-results'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type {
    CommitStage,
    GateTarget,
    StuckReason,
} from '../journal/journal-record'
import {
    EMPTY_TICKET_PROGRESS,
    type ReplayedSnapshot,
    type ReplayedWorktree,
    type RunState,
    type TicketProgress,
} from '../journal/replay'
import { REFACTOR_LABEL } from '../tracker/tracker'

/**
 * Follow-ups an agent gets to fix a failed red check or failed gates, after
 * its first try. A failure after the last follow-up makes the ticket stuck.
 */
export const MAX_FIX_ROUNDS = 3

/**
 * Times an implementer may send a test back as bad, each to a fresh
 * test-writer. The bounce after these makes the ticket stuck.
 */
export const MAX_BAD_TEST_BOUNCES = 1

/** The next build step for a run whose intake passed. */
export type BuildAction =
    /** Make the run branch, in its own worktree, from the base branch. */
    | { type: 'create_run_branch'; spec_number: number; base_branch: string }
    /** Make the ticket's worktree on a new branch from the run branch. */
    | { type: 'create_ticket_worktree'; ticket: number; run_branch: string }
    /** Run the tests before any agent works, to know the old tests. */
    | { type: 'run_baseline_tests'; ticket: number }
    /**
     * Start a fresh agent session in the ticket's worktree with this prompt.
     * `may_edit_tests` is true for the test-writer and for a refactor
     * ticket's implementer; the launcher's guards enforce it.
     */
    | {
          type: 'launch_agent'
          ticket: number
          role: AgentRole
          prompt: string
          may_edit_tests: boolean
      }
    /**
     * Send a follow-up message, such as a failed check's output, to the agent
     * session that is still open, in a fix loop.
     */
    | {
          type: 'follow_up_agent'
          ticket: number
          role: AgentRole
          session_id: string
          message: string
      }
    /**
     * Throw away every uncommitted change in the ticket's worktree, so a
     * fresh test-writer starts clean after a bad test.
     */
    | { type: 'reset_ticket_worktree'; ticket: number }
    /** Prove every criterion has a test, new tests fail, old tests pass. */
    | {
          type: 'run_red_check'
          ticket: number
          criteria_ids: string[]
          mapping: CriterionTests[]
      }
    /** Scan for leftovers, then commit everything in the worktree. */
    | {
          type: 'commit_ticket'
          ticket: number
          stage: CommitStage
          message: string
      }
    /** Run the engine config's gates in the ticket worktree or on the run branch. */
    | { type: 'run_gates'; ticket: number; target: GateTarget }
    /** Replay the approved ticket's commits onto the run branch. */
    | { type: 'join_run_branch'; ticket: number }
    /** Push the run branch to `origin`. */
    | { type: 'push_run_branch'; ticket: number; branch: string }
    /** The engine can't safely pick this ticket's next step by itself. */
    | {
          type: 'mark_stuck'
          ticket: number
          reason: StuckReason
          detail: string
      }
    /** Open the run's one pull request from the run branch. */
    | {
          type: 'open_pull_request'
          head: string
          base: string
          title: string
          body: string
      }
    /** Every ticket joined and the PR is open. */
    | {
          type: 'done'
          outcome: 'pr_opened'
          pull_request: { number: number; url: string }
      }
    /**
     * A ticket is stuck. For now the run ends here; escalation and replies
     * (later tickets) let the rest of the run carry on.
     */
    | {
          type: 'done'
          outcome: 'stuck'
          ticket: number
          reason: StuckReason
          detail: string
      }

/** Whether a ticket is a refactor ticket: it skips the test-writer and red check. */
export const isRefactorTicket = ({
    ticket,
}: {
    ticket: TicketSnapshot
}): boolean => ticket.labels.includes(REFACTOR_LABEL)

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
    if (stage === 'green') {
        return isRefactorTicket({ ticket })
            ? `refactor: #${ticket.number} ${ticket.title}`
            : `feat: build #${ticket.number} ${ticket.title}`
    }
    return progress.bad_test_bounces > 0
        ? `test: replace a bad test for #${ticket.number} ${ticket.title}`
        : `test: add failing tests for #${ticket.number} ${ticket.title}`
}

/**
 * A fresh agent session. Only the test-writer and a refactor ticket's
 * implementer may edit tests.
 */
const launch = ({
    role,
    snapshot,
    ticket,
    progress,
}: {
    role: AgentRole
    snapshot: ReplayedSnapshot
    ticket: TicketSnapshot
    progress: TicketProgress
}): BuildAction => ({
    type: 'launch_agent',
    ticket: ticket.number,
    role,
    prompt: rolePrompt({
        role,
        spec: snapshot.spec,
        ticket,
        refactor: isRefactorTicket({ ticket }),
        bad_test: progress.bad_test,
    }),
    may_edit_tests:
        role === 'test-writer' ||
        (role === 'implementer' && isRefactorTicket({ ticket })),
})

const stuck = ({
    ticket,
    reason,
    detail,
}: {
    ticket: number
    reason: StuckReason
    detail: string
}): BuildAction => ({ type: 'mark_stuck', ticket, reason, detail })

const commitStep = ({
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

const badTestText = ({ progress }: { progress: TicketProgress }): string => {
    const { bad_test } = progress
    if (bad_test === null) return 'no reason given'
    const where = [bad_test.file, bad_test.name].filter(Boolean).join(' > ')
    return where === '' ? bad_test.reason : `${where}: ${bad_test.reason}`
}

type StepArgs = {
    snapshot: ReplayedSnapshot
    ticket: TicketSnapshot
    progress: TicketProgress
}

/**
 * The test-writer's half of a ticket: fresh tests, the red check and its fix
 * loop, then the red commit. `null` once the red commit is made.
 */
const testStep = ({
    snapshot,
    ticket,
    progress,
}: StepArgs): BuildAction | null => {
    const number = ticket.number
    const { test_writer, red_check } = progress
    if (test_writer === null) {
        return launch({ role: 'test-writer', snapshot, ticket, progress })
    }
    if (test_writer.outcome === 'nothing_new_to_test') {
        return stuck({
            ticket: number,
            reason: 'nothing_new_to_test',
            detail:
                `The test-writer found nothing new to test: ${test_writer.summary || 'no reason given'}\n` +
                `If this ticket changes no behavior, add the \`${REFACTOR_LABEL}\` label and start the run again.`,
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
        if (session_id === undefined) {
            return stuck({
                ticket: number,
                reason: 'red_check_failed',
                detail: `The red check failed and there is no test-writer session to send it back to:\n${problems}`,
            })
        }
        return {
            type: 'follow_up_agent',
            ticket: number,
            role: 'test-writer',
            session_id,
            message: redFixMessage({ red_check }),
        }
    }
    return commitStep({ stage: 'red', ticket, progress })
}

/**
 * The implementer's half of a ticket: the code, the gates and their fix
 * loop, then the green commit. `null` once the green commit is made.
 */
const codeStep = ({
    snapshot,
    ticket,
    progress,
}: StepArgs): BuildAction | null => {
    const number = ticket.number
    const { implementer, gates } = progress
    if (implementer === null) {
        return launch({ role: 'implementer', snapshot, ticket, progress })
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
                detail: `The implementer sent a test back as bad a second time: ${badTestText({ progress })}`,
            })
        }
        // Throw away the implementer's work; replay then clears the ticket's
        // tests and code, so a fresh test-writer replaces the bad test.
        return { type: 'reset_ticket_worktree', ticket: number }
    }
    if (gates === null) {
        return { type: 'run_gates', ticket: number, target: 'ticket' }
    }
    if (!gates.ok) {
        if (progress.gate_fix_rounds >= MAX_FIX_ROUNDS) {
            return stuck({
                ticket: number,
                reason: 'gates_failed',
                detail: `The gates still fail after ${MAX_FIX_ROUNDS} fix rounds:\n${failedChecks({ gates })}`,
            })
        }
        const session_id = progress.sessions.implementer
        if (session_id === undefined) {
            return stuck({
                ticket: number,
                reason: 'gates_failed',
                detail: `The gates failed and there is no implementer session to send them back to:\n${failedChecks({ gates })}`,
            })
        }
        return {
            type: 'follow_up_agent',
            ticket: number,
            role: 'implementer',
            session_id,
            message: gateFixMessage({ gates }),
        }
    }
    return commitStep({ stage: 'green', ticket, progress })
}

/** The next step for one ticket, or `null` once it has joined and pushed. */
const nextTicketStep = ({
    snapshot,
    ticket,
    progress,
    run_branch,
}: StepArgs & { run_branch: ReplayedWorktree }): BuildAction | null => {
    const number = ticket.number
    if (progress.stuck !== null) {
        return {
            type: 'done',
            outcome: 'stuck',
            ticket: number,
            ...progress.stuck,
        }
    }
    if (progress.agent_failure !== null) {
        return stuck({
            ticket: number,
            reason: 'agent_failed',
            detail: `The ${progress.agent_failure.role} failed: ${progress.agent_failure.error}`,
        })
    }
    if (progress.worktree === null) {
        return {
            type: 'create_ticket_worktree',
            ticket: number,
            run_branch: run_branch.branch,
        }
    }
    if (progress.baseline === null) {
        return { type: 'run_baseline_tests', ticket: number }
    }
    const tests = isRefactorTicket({ ticket })
        ? null
        : testStep({ snapshot, ticket, progress })
    if (tests !== null) return tests
    const code = codeStep({ snapshot, ticket, progress })
    if (code !== null) return code
    if (progress.review === null) {
        return launch({ role: 'ticket-reviewer', snapshot, ticket, progress })
    }
    if (progress.review.verdict !== 'approve') {
        return stuck({
            ticket: number,
            reason: 'changes_requested',
            detail: progress.review.findings
                .map(
                    ({ id, severity, title }) => `${id} (${severity}): ${title}`
                )
                .join('\n'),
        })
    }
    if (progress.joined === null) {
        return { type: 'join_run_branch', ticket: number }
    }
    if (!progress.joined.ok) {
        return stuck({
            ticket: number,
            reason: 'join_failed',
            detail: progress.joined.error,
        })
    }
    if (progress.join_gates === null) {
        return { type: 'run_gates', ticket: number, target: 'run_branch' }
    }
    if (!progress.join_gates.ok) {
        return stuck({
            ticket: number,
            reason: 'join_gates_failed',
            detail: failedChecks({ gates: progress.join_gates }),
        })
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

/**
 * The build half of the decision step: picks the next step of building the
 * run's tickets, one ticket at a time in snapshot order, then the PR. Pure.
 *
 * Fix loops: a failed red check goes back to the same test-writer session,
 * and failed gates to the same implementer session, with their output, for
 * up to `MAX_FIX_ROUNDS` follow-ups; then the ticket is stuck. A bad test
 * throws away the implementer's work and goes to a fresh test-writer, whose
 * tests get their own red check and red commit; the next bad test is stuck.
 * "Nothing new to test" is stuck at once. A refactor ticket skips the
 * test-writer and the red check. A review asking for changes, a leftover, a
 * failed agent, and a failed join are still stuck.
 */
export const decideBuild = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): BuildAction => {
    const { snapshot, run_branch, pull_request, tickets } = state
    const base_branch = state.base_branch ?? 'main'
    if (run_branch === null || snapshot === null) {
        return { type: 'create_run_branch', spec_number, base_branch }
    }
    for (const number of snapshot.ticket_order) {
        const ticket = snapshot.tickets[number]
        if (ticket === undefined) continue
        const step = nextTicketStep({
            snapshot,
            ticket,
            progress: tickets[number] ?? EMPTY_TICKET_PROGRESS,
            run_branch,
        })
        if (step !== null) return step
    }
    if (pull_request !== null) {
        return { type: 'done', outcome: 'pr_opened', pull_request }
    }
    return {
        type: 'open_pull_request',
        head: run_branch.branch,
        base: base_branch,
        ...pullRequestText({ snapshot, tickets }),
    }
}
