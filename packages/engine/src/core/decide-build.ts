import sortBy from 'lodash/sortBy'

import {
    clashFixMessage,
    failedChecks,
    failedTryMessage,
    gateFixMessage,
    redFixMessage,
} from './fix-loop-text'
import {
    MAX_BAD_TEST_BOUNCES,
    MAX_ENGINE_FAILURES,
    MAX_FIX_ROUNDS,
    MAX_REJOINS,
} from './loop-caps'
import { pullRequestText } from './pull-request-text'
import {
    openFindingsText,
    reviewFixMessage,
    reviewFixSection,
    reviewSections,
} from './review-text'

import { rejoinSection, rolePrompt } from '../agents/role-prompts'
import type { AgentRole, CriterionTests } from '../agents/role-results'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type {
    CommitStage,
    GateTarget,
    RejoinCause,
    StuckReason,
} from '../journal/journal-record'
import {
    EMPTY_TICKET_PROGRESS,
    type ReplayedInstall,
    type ReplayedRunNote,
    type ReplayedSnapshot,
    type ReplayedWorktree,
    type RunState,
    type TicketProgress,
} from '../journal/replay'
import { REFACTOR_LABEL } from '../tracker/tracker'

export {
    MAX_BAD_TEST_BOUNCES,
    MAX_ENGINE_FAILURES,
    MAX_FIX_ROUNDS,
    MAX_REJOINS,
} from './loop-caps'

/**
 * How many run notes a fresh agent is handed: the newest ones in the run,
 * whatever ticket or role wrote them.
 */
export const MAX_RUN_NOTES = 10

/**
 * The run notes a fresh agent gets: the `MAX_RUN_NOTES` newest, oldest
 * first. The same text written twice counts once, where it was last written.
 *
 * @example
 * newestRunNotes({ run_notes: state.run_notes }) // at most 10, oldest first
 */
export const newestRunNotes = ({
    run_notes,
}: {
    run_notes: ReplayedRunNote[]
}): ReplayedRunNote[] => {
    const seen = new Set<string>()
    const newest: ReplayedRunNote[] = []
    for (const entry of [...run_notes].reverse()) {
        if (newest.length === MAX_RUN_NOTES) break
        if (seen.has(entry.note)) continue
        seen.add(entry.note)
        newest.push(entry)
    }
    return newest.reverse()
}

/** The next build step for a run whose intake passed. */
export type BuildAction =
    /** Make the run branch, in its own worktree, from the base branch. */
    | { type: 'create_run_branch'; spec_number: number; base_branch: string }
    /** Make the ticket's worktree on a new branch from the run branch. */
    | { type: 'create_ticket_worktree'; ticket: number; run_branch: string }
    /**
     * Install the dependencies from the lockfile, without changing it, in a
     * new ticket worktree or the run branch's checkout (`ticket` is `null`),
     * before any agent or gate runs there.
     */
    | {
          type: 'install_dependencies'
          target: GateTarget
          ticket: number | null
      }
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
    /**
     * Put a joined ticket's whole change back on top of the run branch, as
     * uncommitted changes in its worktree, after a clash or failed gates
     * after joining. With `undo_first_sha`, first undo the join on the run
     * branch, back to before that commit.
     */
    | {
          type: 'rebase_ticket'
          ticket: number
          cause: RejoinCause
          undo_first_sha: string | null
      }
    /** Remove these git worktrees at the end of the run; branches stay. */
    | { type: 'remove_worktrees'; paths: string[] }
    /** No ticket can move, and not every ticket has joined. */
    | { type: 'invalid_journal'; reason: string }
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

/**
 * Whether an agent of this role may edit test files on this ticket: only
 * the test-writer, and a refactor ticket's implementer (who may follow
 * renames into tests). The engine hands it to the launcher's guards and
 * uses it for its own after-turn check, on launches and follow-ups alike.
 *
 * @example
 * mayEditTests({ role: 'implementer', ticket }) // true only on a refactor ticket
 */
export const mayEditTests = ({
    role,
    ticket,
}: {
    role: AgentRole
    ticket: TicketSnapshot
}): boolean =>
    role === 'test-writer' ||
    (role === 'implementer' && isRefactorTicket({ ticket }))

/**
 * The sections a launch adds: the review's (see `reviewPromptSections`),
 * and, for a test-writer or implementer fixing a ticket on top of the run
 * branch, the files that clashed. The reviewer's re-review after a rebase
 * is the review's own.
 */
const promptSections = ({
    role,
    progress,
}: {
    role: AgentRole
    progress: TicketProgress
}): string[] => {
    const review = reviewPromptSections({ role, progress })
    const { rejoin } = progress
    if (rejoin === null || role === 'ticket-reviewer') return review
    // A review fix round after the rejoin has its own findings.
    if (progress.commits.green !== null) return review
    const section = rejoinSection({ role, rejoin })
    return section === null ? review : [...review, section]
}

/**
 * The sections a launch adds for the ticket review: the reviewer's diff and
 * gate results (a re-review's new changes and earlier findings), or a
 * review fixer's findings while a review fix round is open.
 */
const reviewPromptSections = ({
    role,
    progress,
}: {
    role: AgentRole
    progress: TicketProgress
}): string[] => {
    const fix = progress.review_fix
    if (role === 'ticket-reviewer') {
        return reviewSections({
            progress,
            base_sha: progress.worktree?.base_sha ?? 'HEAD',
        })
    }
    if (fix === null || progress.commits.green === null) return []
    if (role === 'test-writer' && !fix.tests_answered) {
        return [reviewFixSection({ fix, kind: 'test' })]
    }
    if (role === 'implementer' && !fix.code_answered) {
        return [reviewFixSection({ fix, kind: 'code' })]
    }
    return []
}

type StepArgs = {
    snapshot: ReplayedSnapshot
    ticket: TicketSnapshot
    progress: TicketProgress
    /** The run notes a fresh agent gets (`newestRunNotes`). */
    run_notes: ReplayedRunNote[]
}

/** A fresh agent session, handed the run's newest notes. */
const launch = ({
    role,
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs & { role: AgentRole }): BuildAction => ({
    type: 'launch_agent',
    ticket: ticket.number,
    role,
    prompt: rolePrompt({
        role,
        spec: snapshot.spec,
        ticket,
        refactor: isRefactorTicket({ ticket }),
        bad_test: progress.bad_test,
        sections: promptSections({ role, progress }),
        run_notes,
    }),
    may_edit_tests: mayEditTests({ role, ticket }),
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

/** Why an install failed, for the stuck detail, or `null` if it passed. */
const installFailure = ({
    install,
    where,
}: {
    install: ReplayedInstall
    where: string
}): string | null => {
    const { check } = install
    if (check === null || check.ok) return null
    return `\`${check.command}\` failed in ${where} (exit ${check.exit_code ?? 'none'}). Agents never run the install, so fix the manifest or lockfile on the base branch and retry.\n${check.output}`
}

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

/**
 * The test-writer's half of a ticket: fresh tests, the red check and its fix
 * loop, then the red commit. `null` once the red commit is made.
 */
const testStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction | null => {
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
                detail: `The implementer sent a test back as bad a second time: ${badTestText({ progress })}`,
            })
        }
        // Throw away the implementer's work; replay then clears the ticket's
        // tests and code, so a fresh test-writer replaces the bad test.
        return { type: 'reset_ticket_worktree', ticket: number }
    }
    return (
        gateStep({ ticket, progress }) ??
        commitStep({ stage: 'green', ticket, progress })
    )
}

/**
 * The ticket's gates and their fix loop: failed gates go back to the same
 * implementer session, up to `MAX_FIX_ROUNDS` follow-ups. `null` once the
 * gates pass.
 */
const gateStep = ({
    ticket,
    progress,
}: {
    ticket: TicketSnapshot
    progress: TicketProgress
}): BuildAction | null => {
    const number = ticket.number
    const { gates } = progress
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

/**
 * The ticket review and its fix loop, after the green commit. A fresh
 * reviewer checks the committed diff. Blockers and should-fixes open a fix
 * round: test findings go to a fresh test-writer first, then code findings
 * to the same implementer session (a fresh one if it is gone). The fixes
 * pass the gates, get their own commit, and a fresh reviewer checks only
 * the new changes. A review that still asks for changes after
 * `MAX_FIX_ROUNDS` fix rounds is stuck. `null` once a review approves.
 */
const reviewStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction | null => {
    const number = ticket.number
    const reviewer = () =>
        launch({
            role: 'ticket-reviewer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    if (progress.review === null) return reviewer()
    const fix = progress.review_fix
    if (fix === null) return null
    if (fix.round > MAX_FIX_ROUNDS) {
        return stuck({
            ticket: number,
            reason: 'changes_requested',
            detail: `The ticket review still asks for changes after ${MAX_FIX_ROUNDS} fix rounds:\n${openFindingsText({ findings: fix.findings })}`,
        })
    }
    if (!fix.tests_answered) {
        return launch({
            role: 'test-writer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    }
    if (!fix.code_answered) {
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
            ticket: number,
            role: 'implementer',
            session_id,
            message: reviewFixMessage({ fix }),
        }
    }
    if (fix.bad_test !== null) {
        return stuck({
            ticket: number,
            reason: 'bad_test',
            detail: `While fixing review findings, the implementer sent a test back as bad: ${badTestText({ progress: { ...progress, bad_test: fix.bad_test } })}`,
        })
    }
    return (
        gateStep({ ticket, progress }) ??
        commitStep({ stage: 'fix', ticket, progress }) ??
        reviewer()
    )
}

/**
 * The next step after a failed agent turn. An engine failure starts a fresh
 * agent of the same role without using up a try, until
 * `MAX_ENGINE_FAILURES` in a row. Any other failure uses up one of the
 * role's tries on the ticket; with tries left, a test-writer or implementer
 * gets a follow-up in the session that failed, and a reviewer (or an agent
 * with no session) a fresh launch. The last try's failure is stuck.
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
    if (role === 'ticket-reviewer' || session_id === null) {
        return launch({ role, snapshot, ticket, progress, run_notes })
    }
    return {
        type: 'follow_up_agent',
        ticket: ticket.number,
        role,
        session_id,
        message: failedTryMessage({ failure, error }),
    }
}

/**
 * The fix on top of the run branch after a rebase: first a fresh test-writer
 * for clashed tests, then the implementer for clashed code. `null` once both
 * have answered; the gates, the green commit, and a fresh review of the new
 * changes follow as usual. A bad test here is stuck: resetting the worktree
 * would throw away the ticket's uncommitted change.
 */
const rejoinStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction | null => {
    const { rejoin } = progress
    if (rejoin === null) return null
    if (progress.implementer?.outcome === 'bad_test') {
        return stuck({
            ticket: ticket.number,
            reason: 'bad_test',
            detail: `The implementer sent a test back as bad while fixing the ticket on top of the run branch; resetting the worktree would throw the ticket's change away: ${badTestText({ progress })}`,
        })
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
 * The join section of an approved ticket, for the first ticket in the join
 * queue only: join, the gates on the run branch, the push. A clash or failed
 * gates sends the ticket back onto the run branch, up to `MAX_REJOINS`
 * times; after that it is stuck. `null` once pushed.
 */
const joinStep = ({
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

/**
 * The next step for one ticket that has its worktree, or `null` when it has
 * nothing to do now: it pushed, or its review approved and it waits its turn
 * to join.
 */
const nextTicketStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
    run_branch,
    joiner,
}: StepArgs & {
    run_branch: ReplayedWorktree
    /** Whether the ticket is first in the join queue. */
    joiner: boolean
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
    if (progress.baseline === null) {
        return { type: 'run_baseline_tests', ticket: number }
    }
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
            : testStep({ snapshot, ticket, progress, run_notes })
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
 * time, in the order their reviews finally approved them. A clash or failed
 * gates after joining puts the ticket's change back on top of the run
 * branch to be fixed there (up to `MAX_REJOINS` times), then re-reviewed. A
 * stuck ticket ends the run: no ticket starts or moves on, and the worktrees
 * of pushed tickets are removed. Once the PR is open, every worktree is
 * removed. Branches and the journal stay.
 *
 * Fix loops: a failed red check goes back to the same test-writer session,
 * and failed gates to the same implementer session, with their output, for
 * up to `MAX_FIX_ROUNDS` follow-ups; then the ticket is stuck. A bad test
 * throws away the implementer's work and goes to a fresh test-writer, whose
 * tests get their own red check and red commit; the next bad test is stuck.
 * "Nothing new to test" is stuck at once. A refactor ticket skips the
 * test-writer and the red check. The ticket review's findings go back for
 * fixing in capped rounds, each re-reviewed.
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

    const stuckTicket = numbers.find((number) => progress(number).stuck)
    const stuckWhy =
        stuckTicket === undefined ? null : progress(stuckTicket).stuck
    if (stuckTicket !== undefined && stuckWhy !== null) {
        const paths = notRemoved({
            state,
            paths: numbers.flatMap((number) => {
                const { pushed, worktree } = progress(number)
                return pushed !== null && worktree !== null
                    ? [worktree.path]
                    : []
            }),
        })
        if (paths.length > 0) return [{ type: 'remove_worktrees', paths }]
        return [
            {
                type: 'done',
                outcome: 'stuck',
                ticket: stuckTicket,
                ...stuckWhy,
            },
        ]
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
    const pushed = (number: number) =>
        !numbers.includes(number) || progress(number).pushed !== null
    if (runBranchFailure !== null) {
        const first = numbers.find((number) => !pushed(number))
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

    const queue = sortBy(
        numbers.filter((number) => inJoinQueue(progress(number))),
        (number) => progress(number).approved_seq
    )
    const joiner = queue[0] ?? null

    const steps = numbers.flatMap((number): BuildAction[] => {
        const ticket = snapshot.tickets[number]
        const ticketProgress = progress(number)
        if (ticket === undefined || ticketProgress.pushed !== null) return []
        if (ticketProgress.worktree === null) {
            const ready = queue.length === 0 && ticket.blockers.every(pushed)
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
            joiner: number === joiner,
        })
        return step === null ? [] : [step]
    })
    if (steps.length > 0) return steps

    if (numbers.every(pushed)) {
        return [
            {
                type: 'open_pull_request',
                head: run_branch.branch,
                base: base_branch,
                ...pullRequestText({ snapshot, tickets: state.tickets }),
            },
        ]
    }
    return [
        {
            type: 'invalid_journal',
            reason: `No ticket can move: ${numbers
                .filter((number) => !pushed(number))
                .map((number) => `#${number}`)
                .join(', ')} wait on tickets that never join.`,
        },
    ]
}
