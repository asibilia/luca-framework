/**
 * The shape of a run's state as replay rebuilds it, with its run-wide parts
 * (snapshot, comments, PR, notes, budget), its empty value, and the small
 * run-wide updates: the snapshot's phase, run notes, and engine comments.
 */
import { EMPTY_FINAL_REVIEW, type FinalReviewState } from './final-review-state'
import type { JournalRecord, RunStuckReason } from './journal-record'
import { EMPTY_MEMORY, type MemoryState } from './memory-replay'
import type { PlanState } from './plan-replay'
import type { CrashCounts } from './step-records'
import type {
    ReplayedGates,
    ReplayedInstall,
    ReplayedWorktree,
    TicketProgress,
} from './ticket-progress'

import type { AgentRole } from '../agents/role-results'
import type { EngineConfig } from '../config/engine-config'
import type { TestCaseRef } from '../gates/gate-schemas'
import type {
    IntakeProblem,
    IntakeRead,
    LeftOutTicket,
    SpecSnapshot,
    TicketSnapshot,
} from '../intake/intake-schemas'

/** Where a run stands, as far as intake goes. */
export type RunPhase =
    | 'new'
    | 'started'
    | 'intake_read'
    | 'refused'
    | 'nothing_to_do'
    /** The spec snapshot is written but some ticket snapshots are not. */
    | 'snapshotting'
    | 'intake_passed'

/** The snapshot as replayed from `spec_snapshot` and `ticket_snapshot`. */
export type ReplayedSnapshot = {
    spec: SpecSnapshot
    ticket_order: number[]
    closed_tickets: number[]
    /** The latest snapshot of each ticket, keyed by ticket number. */
    tickets: Record<number, TicketSnapshot>
    /** The open tickets intake left out for a person, and why (#499). */
    left_out: LeftOutTicket[]
}

/** A comment the engine read on the spec issue. */
export type ReplayedComment = {
    comment_id: number
    author: string
    body: string
}

/** The run's pull request, once opened. */
export type ReplayedPullRequest = { number: number; url: string }

/** One run note, with the agent that wrote it. */
export type ReplayedRunNote = { ticket: number; role: AgentRole; note: string }

/**
 * The run budget (#435): whether the run is stuck on it (or on its PR,
 * #508) and told, and how many more full budgets the owner's `retry`
 * replies added.
 */
export type RunBudgetState = {
    /** The run is stuck, until the owner's `retry`. */
    stuck: { reason: RunStuckReason; detail: string } | null
    /** The spec issue's comment that told the owner the run is stuck. */
    report: { comment_id: number } | null
    /** Full budgets added by `retry`: the run may use `1 + retries` budgets. */
    retries: number
}

/**
 * The repo wait (#615), before intake: not begun (`none`), waiting for an
 * earlier run on the repo, over, or skipped (`luca-run --alongside`).
 */
export type RepoWaitState = {
    status: 'none' | 'waiting' | 'ended' | 'skipped'
    /**
     * When the wait began, or the owner's `retry` of a run stuck on it
     * (`repo_busy`): its 24 hours count from here.
     */
    since: string | null
}

/** An old test that failed in a ticket's check, at its record's time (#544). */
export type OldTestFailure = TestCaseRef & { ticket: number; time: string }

/** A run's state, rebuilt only from its journal. There is no status file. */
export type RunState = {
    phase: RunPhase
    spec_number: number | null
    config: EngineConfig | null
    base_branch: string | null
    intake: IntakeRead | null
    problems: IntakeProblem[] | null
    snapshot: ReplayedSnapshot | null
    run_branch: ReplayedWorktree | null
    /** The install in the run branch's checkout, once it ran. */
    run_branch_install: ReplayedInstall | null
    tickets: Record<number, TicketProgress>
    /**
     * The repo had a changesets config when the run branch was made, so a
     * changeset is written before the PR (#461).
     */
    changesets: boolean
    /** The run's changeset, once written and pushed. */
    changeset: { path: string | null; sha: string } | null
    pull_request: ReplayedPullRequest | null
    plan: PlanState
    /**
     * The seq of each ticket's latest usage record (a retried ticket that
     * finishes again gets another), and whether the run's is recorded.
     */
    usage_recorded: { tickets: Record<number, number>; run: boolean }
    /** The worktrees the engine removed at the end of the run. */
    removed_worktrees: string[]
    /**
     * Every run note from every finished agent in the run, oldest first
     * (journal order), word for word.
     */
    run_notes: ReplayedRunNote[]
    /** The latest gates on the run branch: after a join, or a final review fix. */
    run_branch_gates: ReplayedGates | null
    /**
     * Every untracked path a prepare run made in any of the run's checkouts
     * (`prepare_made`), in journal order. Never an agent's work: the engine
     * leaves them out of commits, the leftover scan, and role rules.
     */
    prepare_made: string[]
    /**
     * Every old test (one that passed at its ticket's baseline) that failed
     * in a ticket's red check, gates or join gates, oldest first (#544).
     */
    old_test_failures: OldTestFailure[]
    final_review: FinalReviewState
    /** Comments read on the spec issue while waiting for replies, oldest first. */
    comments: ReplayedComment[]
    /** Comments already taken as a reply, or sent back. */
    handled_comments: number[]
    /** Comments the engine itself posted on the spec issue. */
    engine_comments: number[]
    /** The owner replied `stop`: nothing new starts, and the run ends without a PR. */
    stop: { comment_id: number } | null
    /** The spec issue's comment that told the owner the final review is stuck. */
    final_stuck_report: { comment_id: number } | null
    /** The owner's reply to the stuck final review, until the engine acts on it. */
    final_reply: { word: 'retry' | 'ship'; comment_id: number } | null
    /** The run's budget of tokens: stuck on it, and the budgets added (#435). */
    run_budget: RunBudgetState
    /** The wait for earlier runs on the same repo (#615). */
    repo_wait: RepoWaitState
    /** Memory's recalls, the learner, and the saves (#370). */
    memory: MemoryState
    /**
     * Crashes in a row per scheduler key (`run_resumed`), until a step under
     * the key ends. A ticket's `retry`, or the final review's, clears its own.
     */
    crashes: CrashCounts
    /** Set once a stop for crashes is journaled. It sticks. */
    crash_stopped: { reason: string } | null
    last_seq: number
}

export const EMPTY_STATE: RunState = {
    phase: 'new',
    spec_number: null,
    config: null,
    base_branch: null,
    intake: null,
    problems: null,
    snapshot: null,
    run_branch: null,
    run_branch_install: null,
    tickets: {},
    changesets: false,
    changeset: null,
    pull_request: null,
    plan: {
        hit: null,
        wait: null,
        resets_announced: [],
        billing: null,
        billing_stopped: null,
        usage_wait: null,
        waited_until: null,
    },
    usage_recorded: { tickets: {}, run: false },
    removed_worktrees: [],
    run_notes: [],
    run_branch_gates: null,
    prepare_made: [],
    old_test_failures: [],
    final_review: EMPTY_FINAL_REVIEW,
    comments: [],
    handled_comments: [],
    engine_comments: [],
    stop: null,
    final_stuck_report: null,
    final_reply: null,
    run_budget: { stuck: null, report: null, retries: 0 },
    repo_wait: { status: 'none', since: null },
    memory: EMPTY_MEMORY,
    crashes: {},
    crash_stopped: null,
    last_seq: 0,
}

export const snapshotPhase = ({
    snapshot,
}: {
    snapshot: ReplayedSnapshot
}): RunPhase =>
    snapshot.ticket_order.every((number) => number in snapshot.tickets)
        ? 'intake_passed'
        : 'snapshotting'

/** The run's notes after an agent finished: its own go at the end. */
export const notesAfter = ({
    state,
    record,
}: {
    state: RunState
    record: Extract<JournalRecord, { kind: 'agent_finished' }>
}): ReplayedRunNote[] => {
    const { ticket, content } = record
    // Reviewers (the ticket reviewer and the lenses) leave no run notes.
    if (ticket === null || !('run_notes' in content.result)) {
        return state.run_notes
    }
    return [
        ...state.run_notes,
        ...content.result.run_notes.map((note) => ({
            ticket,
            role: content.role,
            note,
        })),
    ]
}

/** The spec comments the engine posted, plus this one if it posted one. */
export const engineCommentsAfter = ({
    state,
    comment_id,
}: {
    state: RunState
    comment_id: number | null
}): number[] =>
    comment_id === null
        ? state.engine_comments
        : [...state.engine_comments, comment_id]
