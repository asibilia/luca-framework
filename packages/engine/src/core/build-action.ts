/**
 * The build step's actions (`BuildAction`), and what every ticket step
 * shares: its arguments, a stuck action, and whether a ticket is a refactor.
 */

import type { AlreadyDoneAction, CheckAlreadyDoneAction } from './already-done'
import type { FinalReviewAction } from './decide-final-review'
import type { StuckAction } from './decide-stuck'

import type { AgentRole, BadTest, CriterionTests } from '../agents/role-results'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type {
    ChangesetBump,
    CommitStage,
    GateTarget,
    RejoinCause,
    StuckReason,
} from '../journal/journal-record'
import type {
    ReplayedRunNote,
    ReplayedSnapshot,
    TicketProgress,
} from '../journal/replay'
import { REFACTOR_LABEL } from '../tracker/tracker'

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
     * Take `from_ticket`'s baseline instead of running the tests again: both
     * worktrees start from the same run-branch commit, `base_sha`.
     */
    | {
          type: 'reuse_baseline_tests'
          ticket: number
          from_ticket: number
          base_sha: string
      }
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
     * fresh test-writer starts clean after a bad test. With a `bad_test`, the
     * engine itself found the test checks nothing (#581); without one, the
     * implementer sent it back.
     */
    | { type: 'reset_ticket_worktree'; ticket: number; bad_test?: BadTest }
    /**
     * Prove every criterion has a test, new tests fail, old tests pass. A
     * lone rerun (`exclusive`, #544) runs its tests alone.
     */
    | {
          type: 'run_red_check'
          ticket: number
          criteria_ids: string[]
          mapping: CriterionTests[]
          exclusive?: true
      }
    /** Scan for leftovers, then commit everything in the worktree. */
    | {
          type: 'commit_ticket'
          ticket: number
          stage: CommitStage
          message: string
      }
    /**
     * Run the engine config's gates in the ticket worktree or on the run
     * branch. A lone rerun (`exclusive`, #544) runs its tests alone.
     */
    | {
          type: 'run_gates'
          ticket: number
          target: GateTarget
          exclusive?: true
      }
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
    /**
     * After a rebase, send the test the implementer called bad back to the
     * ticket's test-writer to update (#489), keeping the implementer's code.
     * The engine looks up what joined the run branch between `from_sha` and
     * `base_sha` and journals it all as `tests_sent_back`.
     */
    | {
          type: 'send_tests_back'
          ticket: number
          round: number
          bad_test: BadTest
          from_sha: string
          base_sha: string
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
    /**
     * In a repo with changesets, commit the run's one changeset to the run
     * branch and push it, before the PR (#461).
     */
    | {
          type: 'write_changeset'
          branch: string
          bump: ChangesetBump
          summary: string
          message: string
      }
    /** Open the run's one pull request from the run branch. */
    | {
          type: 'open_pull_request'
          head: string
          base: string
          title: string
          body: string
      }
    /** Every ticket joined (or was skipped) and the PR is open. */
    | {
          type: 'done'
          outcome: 'pr_opened'
          pull_request: { number: number; url: string }
      }
    /** The final review of the whole run branch (`decide-final-review.ts`). */
    | FinalReviewAction
    /** The owner replied `stop`: the run ends without a PR; its branch stays. */
    | { type: 'done'; outcome: 'stopped_by_user' }
    /** Every ticket was skipped, so there is nothing to open a PR for. */
    | { type: 'done'; outcome: 'all_skipped' }
    /** Telling the owner about stuck work, and acting on their replies. */
    | StuckAction
    /** A ticket whose work was already on the base branch (#484). */
    | AlreadyDoneAction
    /** Check a test-writer's evidence that the work is already done (#495). */
    | CheckAlreadyDoneAction

/** Whether a ticket is a refactor ticket: it skips the test-writer and red check. */
export const isRefactorTicket = ({
    ticket,
}: {
    ticket: TicketSnapshot
}): boolean => ticket.labels.includes(REFACTOR_LABEL)

export type StepArgs = {
    snapshot: ReplayedSnapshot
    ticket: TicketSnapshot
    progress: TicketProgress
    /** The run notes a fresh agent gets (`newestRunNotes`). */
    run_notes: ReplayedRunNote[]
}

export const stuck = ({
    ticket,
    reason,
    detail,
}: {
    ticket: number
    reason: StuckReason
    detail: string
}): BuildAction => ({ type: 'mark_stuck', ticket, reason, detail })
