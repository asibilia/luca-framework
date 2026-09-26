import mapValues from 'lodash/mapValues'
import omit from 'lodash/omit'
import omitBy from 'lodash/omitBy'
import uniq from 'lodash/uniq'

import type {
    AgentFailure,
    CommitStage,
    JournalRecord,
    StuckReason,
    UsageLineWindow,
} from './journal-record'
import { crashesAfter, type CrashCounts } from './step-records'

import type { RejoinContext } from '../agents/role-prompts'
import {
    AgentRoleSchema,
    isBlocking,
    lensOf,
    type AgentRole,
    type BadTest,
    type Finding,
    type FindingResponse,
    type ImplementerResult,
    type LearnerResult,
    type LensName,
    type LensReviewResult,
    type TestWriterResult,
    type TicketReviewResult,
} from '../agents/role-results'
import type { EngineConfig } from '../config/engine-config'
import type {
    GateCheck,
    LeftoverHit,
    RedCheckResult,
    TestRun,
} from '../gates/gate-schemas'
import type {
    IntakeProblem,
    IntakeRead,
    SpecSnapshot,
    TicketSnapshot,
} from '../intake/intake-schemas'
import { sessionSignal } from '../limits/plan-signals'
import type {
    MemoryFeedback,
    MemorySave,
    RecallPoint,
    RecalledMemory,
} from '../memory/memory-schemas'

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
}

/** A worktree the engine made, as journaled. */
export type ReplayedWorktree = {
    branch: string
    path: string
    base_sha: string
}

/**
 * A ticket sent back to be fixed on top of the run branch (`ticket_rebased`):
 * why, where it starts now, the files that clashed, and the findings known
 * from its reviews. `tests_pending` and `code_pending` stay true until a
 * fresh test-writer (the clashed tests) or the implementer (the clashed
 * code) has answered.
 */
export type ReplayedRejoin = RejoinContext & {
    tests_pending: boolean
    code_pending: boolean
}

/** One gate run, as journaled. */
export type ReplayedGates = { ok: boolean; checks: GateCheck[] }

/** The red check's verdict, plus the test run's (clipped) output. */
export type ReplayedRedCheck = RedCheckResult & { output: string }

/**
 * The open review fix round: the blockers and should-fixes the latest ticket
 * review sent back, and which fixers have answered. Test findings go to a
 * fresh test-writer first, then code findings to the implementer.
 */
export type ReviewFix = {
    /** 1 after the first review, 2 after the first re-review, ... */
    round: number
    findings: Finding[]
    /** True once the test-writer answered, or when no finding is a test finding. */
    tests_answered: boolean
    /** True once the implementer answered, or when no finding is a code finding. */
    code_answered: boolean
    /** The fixers' answers, oldest first. */
    responses: FindingResponse[]
    /** A test the implementer sent back as bad while fixing, if any. */
    bad_test: BadTest | null
}

/**
 * A finding a fixer answered "won't fix" and the next reviewer let go: its
 * ruling was `accepted`, or it gave none and did not list the finding again.
 */
export type DeclinedFinding = {
    finding: Finding
    /** The fixer's reason. */
    reason: string
    /** The reviewer's reason for accepting it, if it gave one. */
    ruling: string
}

/**
 * How far one ticket got, from its journal records. Each field holds the
 * latest record of its kind; `null` means the step has not finished.
 *
 * The fix-loop counts are derived from record order, never written by hand,
 * so a crashed run counts them the same way again: a test-writer result that
 * comes after a red check answers a fix round (and the red check runs again),
 * and an implementer result after the gates does the same for the gates.
 */
export type TicketProgress = {
    worktree: ReplayedWorktree | null
    /** The install in the new worktree; its `check` is `null` with no manifest. */
    install: ReplayedInstall | null
    /** Its own baseline test run, or the one it reused (`baseline_reused`). */
    baseline: TestRun | null
    /**
     * The run-branch commit the baseline was taken at. It stays when a rebase
     * moves the worktree, so the baseline is only lent to tickets from there.
     */
    baseline_sha: string | null
    test_writer: TestWriterResult | null
    red_check: ReplayedRedCheck | null
    /** Follow-ups the test-writer answered after a failed red check. */
    red_fix_rounds: number
    implementer: ImplementerResult | null
    /** Follow-ups the implementer answered after failed gates. */
    gate_fix_rounds: number
    /** How many times an implementer sent a test back as bad. */
    bad_test_bounces: number
    /** The latest test sent back as bad, for the fresh test-writer's prompt. */
    bad_test: BadTest | null
    /** The session each role's latest turn ran in, for follow-ups. */
    sessions: Partial<Record<AgentRole, string>>
    /** Every assumption any agent on the ticket made, oldest first. */
    assumptions: string[]
    /** The latest ticket review's result. */
    review: TicketReviewResult | null
    /** Ticket reviews finished on this ticket. */
    review_rounds: number
    /** The commit the latest review looked at. */
    reviewed_sha: string | null
    /** The open review fix round; `null` before a review or once approved. */
    review_fix: ReviewFix | null
    /** Every nit reviewers reported, oldest first, one per id. */
    nits: Finding[]
    /** Findings declined through "won't fix", oldest first. */
    declined: DeclinedFinding[]
    /**
     * The seq of the review that finally approved the ticket (no blocker or
     * should-fix left), `null` until one does. Approved tickets join the run
     * branch in this order, one at a time.
     */
    approved_seq: number | null
    /** How many times the ticket was sent back onto the run branch. */
    rejoins: number
    /** The latest time it was sent back, `null` if it never was. */
    rejoin: ReplayedRejoin | null
    /**
     * The latest failed agent turn, if no agent finished after it: its role,
     * error, how it failed, and the session it ran in (for a follow-up).
     */
    agent_failure: {
        role: AgentRole
        error: string
        failure: AgentFailure
        session_id: string | null
    } | null
    /**
     * Failed tries (agent, result, and guard failures) each role has used on
     * this ticket, in all. Engine failures never count here.
     */
    failed_tries: Partial<Record<AgentRole, number>>
    /** Engine failures in a row; any other turn's end resets it. */
    engine_failures: number
    leftovers: Record<CommitStage, LeftoverHit[] | null>
    commits: Record<CommitStage, string | null>
    /** The files each stage's latest commit changed. */
    commit_files: Record<CommitStage, string[]>
    gates: ReplayedGates | null
    joined: { ok: true; shas: string[] } | { ok: false; error: string } | null
    join_gates: ReplayedGates | null
    pushed: string | null
    stuck: ReplayedStuck | null
    /** The spec issue's comment that told the owner, once posted. */
    stuck_report: { comment_id: number } | null
    /** The owner's reply to this stuck ticket, until the engine acts on it. */
    reply: { word: 'retry' | 'skip'; comment_id: number } | null
    /** Left out of the run: skipped by reply, or waits on a skipped ticket. */
    skipped: { because: number | null } | null
    /**
     * Why the ticket got stuck before its latest `retry` resumed it; the next
     * fresh agent is told. Cleared once an agent starts.
     */
    retried: ReplayedStuck | null
    /** A test setup file change an agent asked for; the ticket is stuck on it. */
    setup_change: { role: AgentRole; file: string; reason: string } | null
    /**
     * The role whose turn a crash cut off (`run_resumed`), so the fresh
     * agent that takes it again is told. Cleared once an agent starts.
     */
    crashed_turn: AgentRole | null
}

/** Why a ticket is stuck, as journaled. */
export type ReplayedStuck = { reason: StuckReason; detail: string }

/** A comment the engine read on the spec issue. */
export type ReplayedComment = {
    comment_id: number
    author: string
    body: string
}

/** A final review finding: its id namespaced as `<lens>-<id>`, and its lens. */
export type FinalFinding = Finding & { lens: LensName }

/** A finding declined in the final review, with the lens that let it go. */
export type FinalDeclined = DeclinedFinding & { lens: LensName }

/** A rule file for the rules lens, as the engine read it (`null`: unreadable). */
export type RuleFile = { path: string; text: string | null }

/** A failed agent turn no agent of that role finished after. */
export type ReplayedAgentFailure = {
    role: AgentRole
    error: string
    failure: AgentFailure
    session_id: string | null
}

/**
 * The open final review fix round: the blocking findings of every lens due
 * in the round, and which fixers answered. Like a ticket's `ReviewFix`.
 */
export type FinalReviewFix = Omit<ReviewFix, 'findings'> & {
    findings: FinalFinding[]
}

/**
 * Where the final review stands, from its records: its round, the lenses
 * due, each lens's result this round, the open fix round and its fixers,
 * gates, commit, and push, and what goes in the PR. Ticket-less agent,
 * gate, scan, commit, and push records belong here once
 * `final_review_started` is journaled.
 */
export type FinalReviewState = {
    /** 0 before the final review starts, then 1, 2, ... */
    round: number
    from_sha: string | null
    head_sha: string | null
    /** The files `git diff <from_sha>..<head_sha>` changes. */
    files: string[]
    /** The lenses due this round. */
    lenses_due: LensName[]
    rules: RuleFile[]
    /** Each due lens's result this round, finding ids namespaced. */
    results: Partial<Record<LensName, LensReviewResult>>
    /** The open fix round; `null` before the first review settles or once clean. */
    fix: FinalReviewFix | null
    /** `final_review_fixing` is journaled for the open fix round. */
    fixing_started: boolean
    /** The session of each role's latest turn, for follow-ups. */
    sessions: Partial<Record<AgentRole, string>>
    /** Each role's failed turn, if no agent of that role finished after it. */
    agent_failures: Partial<Record<AgentRole, ReplayedAgentFailure>>
    /** Failed tries (agent, result, guard) per role, over the whole final review. */
    failed_tries: Partial<Record<AgentRole, number>>
    /** Engine failures in a row, per role. */
    engine_failures: Partial<Record<AgentRole, number>>
    /** The open fix round's gates, and its gate fix follow-ups. */
    gates: ReplayedGates | null
    gate_fix_rounds: number
    /** The open fix round's leftover scan and commit. */
    leftovers: LeftoverHit[] | null
    commit: { sha: string; files: string[] } | null
    /** The open fix round's push. */
    pushed: string | null
    /** Every nit the lenses reported, one per id. */
    nits: FinalFinding[]
    declined: FinalDeclined[]
    /** Every assumption a final review agent made, oldest first. */
    assumptions: string[]
    passed: boolean
    stuck: { reason: StuckReason; detail: string } | null
    shipped: boolean
    /** The fixer whose turn a crash cut off; cleared once a fixer starts. */
    crashed_turn: AgentRole | null
}

/** The final review before it starts. */
export const EMPTY_FINAL_REVIEW: FinalReviewState = {
    round: 0,
    from_sha: null,
    head_sha: null,
    files: [],
    lenses_due: [],
    rules: [],
    results: {},
    fix: null,
    fixing_started: false,
    sessions: {},
    agent_failures: {},
    failed_tries: {},
    engine_failures: {},
    gates: null,
    gate_fix_rounds: 0,
    leftovers: null,
    commit: null,
    pushed: null,
    nits: [],
    declined: [],
    assumptions: [],
    passed: false,
    stuck: null,
    shipped: false,
    crashed_turn: null,
}

/** The engine's install in a new worktree: `null` check means nothing to install. */
export type ReplayedInstall = { check: GateCheck | null }

/** The run's pull request, once opened. */
export type ReplayedPullRequest = { number: number; url: string }

/**
 * Where the run stands with the plan, from agents' rate-limit readings and
 * the limit-wait and stop records.
 */
export type PlanState = {
    /**
     * The latest rejected rate limit no limit wait has started for yet: the
     * window, its reset (seconds since the epoch), the agent that hit it, and
     * when the session was journaled.
     */
    hit: {
        rate_limit_type: string | null
        resets_at: number | null
        ticket: number | null
        role: AgentRole | null
        time: string
    } | null
    /** The limit wait under way: when it ends, and what it is for. */
    wait: {
        until: string
        resets_at: string | null
        rate_limit_type: string | null
    } | null
    /** Every limit wait's reset so far, oldest first; the spec hears of each new one once. */
    resets_announced: (string | null)[]
    /** The first sign of per-token billing in any session, if any. */
    billing: { reason: string } | null
    /** Set once a billing stop is journaled. It sticks. */
    billing_stopped: { reason: string } | null
    /** The usage-line wait under way: its window, line, reading, and end. */
    usage_wait: {
        window: UsageLineWindow
        line: number
        percent: number
        until: string
    } | null
    /**
     * The latest time the run is known to have waited until: the `until` of
     * a limit wait that ended, or of a usage-line wait that ended at its
     * reset. A reading whose window resets by then is out of date.
     */
    waited_until: string | null
}
/**
 * The learner at the end of a run (#370): its answer, or its failed tries,
 * or that the engine gave up on it. Learner records have `ticket: null` and
 * role `learner`; they never count as the final review's.
 */
export type LearnerState = {
    /** Its result, once it finished. */
    result: LearnerResult | null
    /** The seq of its `agent_finished`, for the saves' op ids. */
    result_seq: number | null
    /** Its latest failed turn, if none finished after it. */
    agent_failure: ReplayedAgentFailure | null
    /** Failed tries (agent, result, guard), in all. */
    failed_tries: number
    /** Engine failures in a row. */
    engine_failures: number
    /** Why the engine gave up on it (`learning_skipped`), if it did. */
    skipped: string | null
}

/** Where memory stands in a run (#370), from its records. */
export type MemoryState = {
    /** Memory is on for this run (`run_started.memory`). */
    on: boolean
    /** The project's vault; `null` searches only `default`. */
    project_vault: string | null
    /** Each recall point's memories, by its key, once searched. */
    recalls: Record<string, { point: RecallPoint; memories: RecalledMemory[] }>
    /** Every memory shown in the run, oldest first; may repeat. */
    shown: RecalledMemory[]
    learner: LearnerState
    /** The learner's memories as saved, and the feedback sent. */
    saved: { saves: MemorySave[]; feedback: MemoryFeedback[] } | null
    /** The new memories went on the spec issue (a run with no PR). */
    reported: boolean
}

/** A run with memory off, before any memory record. */
export const EMPTY_MEMORY: MemoryState = {
    on: false,
    project_vault: null,
    recalls: {},
    shown: [],
    learner: {
        result: null,
        result_seq: null,
        agent_failure: null,
        failed_tries: 0,
        engine_failures: 0,
        skipped: null,
    },
    saved: null,
    reported: false,
}

/** One run note, with the agent that wrote it. */
export type ReplayedRunNote = { ticket: number; role: AgentRole; note: string }

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

/** A ticket nothing has happened to yet. */
export const EMPTY_TICKET_PROGRESS: TicketProgress = {
    worktree: null,
    install: null,
    baseline: null,
    baseline_sha: null,
    test_writer: null,
    red_check: null,
    red_fix_rounds: 0,
    implementer: null,
    gate_fix_rounds: 0,
    bad_test_bounces: 0,
    bad_test: null,
    sessions: {},
    assumptions: [],
    review: null,
    review_rounds: 0,
    reviewed_sha: null,
    review_fix: null,
    nits: [],
    declined: [],
    approved_seq: null,
    rejoins: 0,
    rejoin: null,
    agent_failure: null,
    failed_tries: {},
    engine_failures: 0,
    leftovers: { red: null, green: null, fix: null },
    commits: { red: null, green: null, fix: null },
    commit_files: { red: [], green: [], fix: [] },
    gates: null,
    joined: null,
    join_gates: null,
    pushed: null,
    stuck: null,
    stuck_report: null,
    reply: null,
    skipped: null,
    retried: null,
    setup_change: null,
    crashed_turn: null,
}

const EMPTY_STATE: RunState = {
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
    final_review: EMPTY_FINAL_REVIEW,
    comments: [],
    handled_comments: [],
    engine_comments: [],
    stop: null,
    final_stuck_report: null,
    final_reply: null,
    memory: EMPTY_MEMORY,
    crashes: {},
    crash_stopped: null,
    last_seq: 0,
}

const snapshotPhase = ({
    snapshot,
}: {
    snapshot: ReplayedSnapshot
}): RunPhase =>
    snapshot.ticket_order.every((number) => number in snapshot.tickets)
        ? 'intake_passed'
        : 'snapshotting'

type PlanRecord = Extract<
    JournalRecord,
    {
        kind:
            | 'agent_session'
            | 'run_stopped'
            | 'limit_wait_started'
            | 'limit_wait_ended'
            | 'usage_line_wait_started'
            | 'usage_line_wait_ended'
    }
>

/** The later of two ISO times; the first may be missing. */
const laterOf = (a: string | null, b: string): string =>
    a !== null && Date.parse(a) >= Date.parse(b) ? a : b

/** The plan state after one record. */
const planAfter = ({
    plan,
    record,
}: {
    plan: PlanState
    record: PlanRecord
}): PlanState => {
    switch (record.kind) {
        case 'agent_session': {
            const signal = sessionSignal({ session: record.content.session })
            if (signal.kind === 'billing') {
                return {
                    ...plan,
                    billing: plan.billing ?? { reason: signal.reason },
                }
            }
            if (signal.kind === 'ok') return plan
            return {
                ...plan,
                hit: {
                    rate_limit_type: signal.rate_limit_type,
                    resets_at: signal.resets_at,
                    ticket: record.ticket,
                    role: record.content.role,
                    time: record.time,
                },
            }
        }
        case 'run_stopped':
            return record.content.billing
                ? {
                      ...plan,
                      billing: plan.billing ?? {
                          reason: record.content.reason,
                      },
                      billing_stopped: { reason: record.content.reason },
                  }
                : plan
        case 'limit_wait_started': {
            const { until, resets_at, rate_limit_type } = record.content
            return {
                ...plan,
                hit: null,
                wait: { until, resets_at, rate_limit_type },
                resets_announced: [...plan.resets_announced, resets_at],
            }
        }
        case 'limit_wait_ended':
            return {
                ...plan,
                wait: null,
                waited_until: laterOf(plan.waited_until, record.content.until),
            }
        case 'usage_line_wait_started': {
            const { window, line, percent, until } = record.content
            return { ...plan, usage_wait: { window, line, percent, until } }
        }
        case 'usage_line_wait_ended':
            return {
                ...plan,
                usage_wait: null,
                waited_until:
                    record.content.reason === 'reset'
                        ? laterOf(plan.waited_until, record.content.until)
                        : plan.waited_until,
            }
    }
}

/** The run's notes after an agent finished: its own go at the end. */
const notesAfter = ({
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

const applyRecord = ({
    state,
    record,
}: {
    state: RunState
    record: JournalRecord
}): RunState => {
    const base = {
        ...state,
        last_seq: record.seq,
        crashes: crashesAfter({ crashes: state.crashes, record }),
    }
    const next =
        record.kind === 'gates_run' && record.content.target === 'run_branch'
            ? {
                  ...base,
                  run_branch_gates: {
                      ok: record.content.ok,
                      checks: record.content.checks,
                  },
              }
            : base
    const learnerRecord = learnerRecordOf({ record })
    if (learnerRecord !== null) {
        const memory = {
            ...state.memory,
            learner: learnerAfter({
                learner: state.memory.learner,
                record: learnerRecord,
            }),
        }
        // A session's readings still count for the plan.
        return learnerRecord.kind === 'agent_session'
            ? {
                  ...next,
                  memory,
                  plan: planAfter({ plan: state.plan, record: learnerRecord }),
              }
            : { ...next, memory }
    }
    const finalRecord = finalRecordOf({ state, record })
    if (finalRecord !== null) {
        const replies = finalRepliesAfter({ state, record })
        const final_review = finalReviewAfter({
            review: state.final_review,
            record: finalRecord,
        })
        // A session's readings still count for the plan.
        return record.kind === 'agent_session'
            ? {
                  ...next,
                  ...replies,
                  final_review,
                  plan: planAfter({ plan: state.plan, record }),
              }
            : { ...next, ...replies, final_review }
    }
    switch (record.kind) {
        case 'run_started': {
            const { memory } = record.content
            return {
                ...next,
                phase: 'started',
                spec_number: record.content.spec_number,
                config: record.content.config,
                base_branch: record.content.base_branch,
                memory: {
                    ...EMPTY_MEMORY,
                    on: memory !== null,
                    project_vault: memory?.project_vault ?? null,
                },
            }
        }
        case 'memory_recalled': {
            const { point, key, memories } = record.content
            return {
                ...next,
                memory: {
                    ...state.memory,
                    recalls: {
                        ...state.memory.recalls,
                        [key]: { point, memories },
                    },
                    shown: [...state.memory.shown, ...memories],
                },
            }
        }
        case 'memories_saved':
            return {
                ...next,
                memory: { ...state.memory, saved: record.content },
            }
        case 'learning_skipped':
            return {
                ...next,
                memory: {
                    ...state.memory,
                    learner: {
                        ...state.memory.learner,
                        skipped: record.content.reason,
                    },
                },
            }
        case 'memories_reported':
            return {
                ...next,
                memory: { ...state.memory, reported: true },
                engine_comments: engineCommentsAfter({
                    state,
                    comment_id: record.content.comment_id,
                }),
            }
        case 'intake_read':
            return { ...next, phase: 'intake_read', intake: record.content }
        case 'intake_refused':
            return {
                ...next,
                phase: 'refused',
                problems: record.content.problems,
            }
        case 'nothing_to_do':
            return { ...next, phase: 'nothing_to_do' }
        case 'spec_snapshot': {
            const snapshot = {
                spec: record.content.spec,
                ticket_order: record.content.ticket_order,
                closed_tickets: record.content.closed_tickets,
                tickets: {},
            }
            return { ...next, snapshot, phase: snapshotPhase({ snapshot }) }
        }
        case 'ticket_snapshot': {
            if (state.snapshot === null) return next
            const snapshot = {
                ...state.snapshot,
                tickets: {
                    ...state.snapshot.tickets,
                    [record.content.number]: record.content,
                },
            }
            return { ...next, snapshot, phase: snapshotPhase({ snapshot }) }
        }
        case 'run_branch_created':
            return { ...next, run_branch: record.content }
        case 'baseline_reused':
            return reusedBaselineAfter({ state: next, record })
        case 'dependencies_installed':
            if (record.content.target === 'run_branch') {
                return {
                    ...next,
                    run_branch_install: { check: record.content.check },
                }
            }
            return applyTicketRecord({ state: next, record })
        case 'worktrees_removed':
            return {
                ...next,
                removed_worktrees: uniq([
                    ...state.removed_worktrees,
                    ...record.content.paths,
                ]),
            }
        case 'pull_request_opened':
            return {
                ...next,
                pull_request: {
                    number: record.content.number,
                    url: record.content.url,
                },
            }
        // Jev's shadow-mode records change nothing: the engine ignores them.
        case 'jev_asked':
        case 'jev_answered':
        case 'jev_failed':
            return next
        // A session's readings and the stops and limit waits change no
        // ticket: the step they cut off is picked up again afterwards.
        case 'agent_session':
        case 'limit_wait_started':
        case 'limit_wait_ended':
        case 'usage_line_wait_started':
        case 'usage_line_wait_ended':
            return { ...next, plan: planAfter({ plan: state.plan, record }) }
        case 'run_stopped':
            return {
                ...next,
                plan: planAfter({ plan: state.plan, record }),
                crash_stopped: record.content.crashed
                    ? { reason: record.content.reason }
                    : state.crash_stopped,
            }
        // The crash counts (see `crashesAfter`) are all a step record changes.
        case 'step_started':
        case 'step_ended':
            return next
        // Only a join's redo reads it (see `openJoin`).
        case 'join_started':
            return next
        // Only a redo of `save_memories` reads them (see `execute-memory.ts`).
        case 'memory_write_started':
        case 'memory_write_done':
            return next
        case 'run_resumed':
            return resumedAfter({ state: next, record })
        case 'comment_read':
            return { ...next, comments: [...state.comments, record.content] }
        case 'reply_ignored': {
            const { comment_id, answer_id } = record.content
            return {
                ...next,
                handled_comments: [...state.handled_comments, comment_id],
                engine_comments: engineCommentsAfter({
                    state,
                    comment_id: answer_id,
                }),
            }
        }
        case 'final_review_retried':
            return {
                ...next,
                crashes: omitFinalKeys({ crashes: next.crashes }),
                final_stuck_report: null,
                final_reply: null,
                final_review: resumedFinalReview({
                    review: state.final_review,
                }),
            }
        case 'reply_received': {
            const handled = {
                ...next,
                handled_comments: [
                    ...state.handled_comments,
                    record.content.comment_id,
                ],
            }
            const { word, comment_id, ticket } = record.content
            if (word === 'stop') return { ...handled, stop: { comment_id } }
            if (ticket === null && (word === 'retry' || word === 'ship')) {
                return { ...handled, final_reply: { word, comment_id } }
            }
            return applyTicketRecord({ state: handled, record })
        }
        case 'stuck_reported': {
            const reported = {
                ...next,
                engine_comments: engineCommentsAfter({
                    state,
                    comment_id: record.content.comment_id,
                }),
            }
            // A report with no ticket is the final review's.
            return record.ticket === null
                ? {
                      ...reported,
                      final_stuck_report: {
                          comment_id: record.content.comment_id,
                      },
                  }
                : applyTicketRecord({ state: reported, record })
        }
        case 'ticket_retried': {
            const { answer_id, mode } = record.content
            const install = state.run_branch_install?.check
            // A run branch whose install failed is installed again on a retry.
            const run_branch_install =
                mode === 'refused' ||
                install === undefined ||
                install?.ok !== false
                    ? state.run_branch_install
                    : null
            return applyTicketRecord({
                state: {
                    ...next,
                    // A retry gives the ticket fresh crash counts too.
                    crashes:
                        record.ticket === null
                            ? next.crashes
                            : omit(next.crashes, String(record.ticket)),
                    run_branch_install,
                    engine_comments: engineCommentsAfter({
                        state,
                        comment_id: answer_id,
                    }),
                },
                record,
            })
        }
        case 'usage_recorded': {
            const { scope, ticket } = record.content
            const { tickets, run } = state.usage_recorded
            return {
                ...next,
                usage_recorded:
                    scope === 'run' || ticket === null
                        ? { tickets, run: true }
                        : {
                              tickets: { ...tickets, [ticket]: record.seq },
                              run,
                          },
            }
        }
        // Agent messages change no ticket's progress; the message rules
        // read them from the records themselves.
        case 'agent_message':
        case 'agent_message_delivered':
            return next
        // Others' changes to the shared .git: noted, never acted on.
        case 'shared_git_changed':
            return next
        case 'agent_session_closed':
            return closedSessionAfter({
                state: next,
                session_id: record.content.session_id,
            })
        case 'agent_finished':
            return applyTicketRecord({
                state: { ...next, run_notes: notesAfter({ state, record }) },
                record,
            })
        // Always the final review's (see finalRecordOf above).
        case 'final_review_started':
        case 'lens_started':
        case 'lens_finished':
        case 'final_review_fixing':
        case 'final_review_stuck':
        case 'final_review_passed':
        case 'final_review_shipped':
            return next
        default:
            return applyTicketRecord({ state: next, record })
    }
}

/** The agent kinds a learner's turn journals. */
type LearnerRecord = Extract<
    JournalRecord,
    {
        kind:
            | 'agent_started'
            | 'agent_finished'
            | 'agent_failed'
            | 'agent_session'
    }
>

/** The record if it is one of the learner's agent records, else `null`. */
const learnerRecordOf = ({
    record,
}: {
    record: JournalRecord
}): LearnerRecord | null => {
    switch (record.kind) {
        case 'agent_started':
        case 'agent_finished':
        case 'agent_failed':
        case 'agent_session':
            return record.content.role === 'learner' ? record : null
        default:
            return null
    }
}

/**
 * The learner after one of its records: its answer ends any failure; a
 * failed turn counts a try (or an engine failure in a row), like any
 * agent's.
 */
const learnerAfter = ({
    learner,
    record,
}: {
    learner: LearnerState
    record: LearnerRecord
}): LearnerState => {
    switch (record.kind) {
        case 'agent_started':
        case 'agent_session':
            return learner
        case 'agent_finished':
            return record.content.role === 'learner'
                ? {
                      ...learner,
                      result: record.content.result,
                      result_seq: record.seq,
                      agent_failure: null,
                      engine_failures: 0,
                  }
                : learner
        case 'agent_failed': {
            const { role, error, failure, session_id } = record.content
            const agent_failure = { role, error, failure, session_id }
            return failure === 'engine'
                ? {
                      ...learner,
                      agent_failure,
                      engine_failures: learner.engine_failures + 1,
                  }
                : {
                      ...learner,
                      agent_failure,
                      engine_failures: 0,
                      failed_tries: learner.failed_tries + 1,
                  }
        }
    }
}

/** The final review's own kinds, and the kinds it shares with tickets. */
type FinalRecord = Extract<
    JournalRecord,
    {
        kind:
            | 'final_review_started'
            | 'lens_started'
            | 'lens_finished'
            | 'final_review_fixing'
            | 'final_review_stuck'
            | 'final_review_passed'
            | 'final_review_shipped'
            | 'agent_started'
            | 'agent_finished'
            | 'agent_failed'
            | 'agent_session'
            | 'gates_run'
            | 'leftover_scan'
            | 'commit_made'
            | 'run_branch_pushed'
    }
>

const FINAL_KINDS = new Set<JournalRecord['kind']>([
    'final_review_started',
    'lens_started',
    'lens_finished',
    'final_review_fixing',
    'final_review_stuck',
    'final_review_passed',
    'final_review_shipped',
])

/** Kinds tickets journal too; ticket-less ones are the final review's once it started. */
const SHARED_KINDS = new Set<JournalRecord['kind']>([
    'agent_started',
    'agent_finished',
    'agent_failed',
    'agent_session',
    'gates_run',
    'leftover_scan',
    'commit_made',
    'run_branch_pushed',
])

/**
 * The record if it is the final review's, else `null`: one of its own
 * kinds, or a ticket-less agent, gate, scan, commit, or push record once
 * the final review started. Before that, ticket-less records keep their old
 * meaning (such as the run branch's gates after a join).
 */
const finalRecordOf = ({
    state,
    record,
}: {
    state: RunState
    record: JournalRecord
}): FinalRecord | null => {
    const mine =
        FINAL_KINDS.has(record.kind) ||
        (record.ticket === null &&
            state.final_review.round > 0 &&
            SHARED_KINDS.has(record.kind))
    return mine ? (record as FinalRecord) : null
}

/**
 * A lens's finding id, namespaced by its lens (`<lens>-<id>`), since lenses
 * choose their ids on their own. An id that already starts with the lens's
 * prefix is kept, so a re-review listing a finding again keeps its id.
 */
export const namespacedId = ({
    lens,
    id,
}: {
    lens: LensName
    id: string
}): string => (id.startsWith(`${lens}-`) ? id : `${lens}-${id}`)

/** A lens's result with every finding and ruling id namespaced. */
const namespaced = ({
    lens,
    result,
}: {
    lens: LensName
    result: LensReviewResult
}): LensReviewResult => ({
    ...result,
    findings: result.findings.map((entry) => ({
        ...entry,
        id: namespacedId({ lens, id: entry.id }),
    })),
    rulings: result.rulings.map((entry) => ({
        ...entry,
        finding_id: namespacedId({ lens, id: entry.finding_id }),
    })),
})

/**
 * The final review once every due lens finished its round: settles the
 * last fix round's "won't fix" answers per lens (see `declinedBy`), keeps
 * the nits, and opens a fix round on the blocking findings of every due
 * lens, with its fixers, gates, commit, and push afresh (and fresh fixer
 * sessions). No blocking finding leaves `fix` null: the review is clean.
 */
const settleRound = ({
    review,
}: {
    review: FinalReviewState
}): FinalReviewState => {
    const due = review.lenses_due.flatMap((lens) => {
        const result = review.results[lens]
        return result === undefined ? [] : [{ lens, result }]
    })
    const tagged = (lens: LensName, findings: Finding[]): FinalFinding[] =>
        findings.map((entry) => ({ ...entry, lens }))
    const declined = due.flatMap(({ lens, result }) =>
        declinedBy({
            fix:
                review.fix === null
                    ? null
                    : {
                          ...review.fix,
                          findings: review.fix.findings.filter(
                              (entry) => entry.lens === lens
                          ),
                      },
            review: result,
        }).map((entry) => ({ ...entry, lens }))
    )
    const nits = due.flatMap(({ lens, result }) =>
        tagged(
            lens,
            result.findings.filter((entry) => !isBlocking(entry))
        )
    )
    const blocking = due.flatMap(({ lens, result }) =>
        tagged(lens, result.findings.filter(isBlocking))
    )
    const settled: FinalReviewState = {
        ...review,
        declined: [...review.declined, ...declined],
        nits: [
            ...review.nits,
            ...nits.filter(
                (entry, index) =>
                    !review.nits.some(({ id }) => id === entry.id) &&
                    nits.findIndex(({ id }) => id === entry.id) === index
            ),
        ],
    }
    if (blocking.length === 0) return { ...settled, fix: null }
    return {
        ...settled,
        fix: {
            round: review.round,
            findings: blocking,
            tests_answered: !blocking.some(({ kind }) => kind === 'test'),
            code_answered: !blocking.some(({ kind }) => kind === 'code'),
            responses: [],
            bad_test: null,
        },
        fixing_started: false,
        sessions: omit(review.sessions, ['test-writer', 'implementer']),
        gates: null,
        gate_fix_rounds: 0,
        leftovers: null,
        commit: null,
        pushed: null,
    }
}

/** A fixer's bad test, or the implementer's summary as its reason. */
const badTestOf = (result: ImplementerResult): BadTest | null =>
    result.outcome === 'bad_test'
        ? (result.bad_test ?? { file: '', name: '', reason: result.summary })
        : null

/**
 * Where a finished agent's result goes in the final review: a lens's
 * result this round (settling the round once every due lens finished), or
 * a fixer's answer to the open fix round. An implementer result after
 * failed gates answers a gate fix round, like a ticket's.
 */
const finalResultChange = ({
    review,
    finished,
}: {
    review: FinalReviewState
    finished: FinishedContent
}): FinalReviewState => {
    const lens = lensOf({ role: finished.role })
    const { fix } = review
    if (lens !== null && 'verdict' in finished.result) {
        if (!review.lenses_due.includes(lens)) return review
        const next = {
            ...review,
            results: {
                ...review.results,
                [lens]: namespaced({ lens, result: finished.result }),
            },
        }
        const pending = next.lenses_due.some(
            (due) => next.results[due] === undefined
        )
        return pending ? next : settleRound({ review: next })
    }
    if (finished.role === 'test-writer') {
        if (fix === null || fix.tests_answered) return review
        return {
            ...review,
            fix: {
                ...fix,
                tests_answered: true,
                responses: [
                    ...fix.responses,
                    ...finished.result.finding_responses,
                ],
            },
        }
    }
    if (finished.role === 'implementer') {
        const { result } = finished
        if (fix !== null && fix.tests_answered && !fix.code_answered) {
            return {
                ...review,
                fix: {
                    ...fix,
                    code_answered: true,
                    responses: [...fix.responses, ...result.finding_responses],
                    bad_test: badTestOf(result),
                },
            }
        }
        if (review.gates === null) return review
        return {
            ...review,
            gates: null,
            gate_fix_rounds: review.gate_fix_rounds + 1,
        }
    }
    return review
}

/** The final review after one of its records. */
const finalReviewAfter = ({
    review,
    record,
}: {
    review: FinalReviewState
    record: FinalRecord
}): FinalReviewState => {
    switch (record.kind) {
        case 'final_review_started': {
            const { round, from_sha, head_sha, lenses, files, rules } =
                record.content
            return {
                ...review,
                round,
                from_sha,
                head_sha,
                files,
                lenses_due: lenses,
                rules,
                results: {},
            }
        }
        case 'agent_started':
            return isFixerRole(record.content.role)
                ? { ...review, crashed_turn: null }
                : review
        case 'lens_started':
        case 'lens_finished':
        case 'agent_session':
            return review
        case 'final_review_fixing':
            return review.fix !== null &&
                record.content.round === review.fix.round
                ? { ...review, fixing_started: true }
                : review
        case 'final_review_stuck':
            return { ...review, stuck: record.content }
        case 'final_review_passed':
            return { ...review, passed: true }
        case 'final_review_shipped':
            return review.stuck === null ? review : { ...review, shipped: true }
        case 'agent_finished': {
            const finished = record.content
            const { role } = finished
            return finalResultChange({
                review: {
                    ...review,
                    agent_failures: omit(review.agent_failures, role),
                    engine_failures: omit(review.engine_failures, role),
                    sessions: sessionsAfter({
                        sessions: review.sessions,
                        role,
                        session_id: finished.session_id,
                    }),
                    assumptions: [
                        ...review.assumptions,
                        ...assumptionsOf(finished),
                    ],
                },
                finished,
            })
        }
        case 'agent_failed': {
            const { role, error, failure, session_id } = record.content
            const agent_failures = {
                ...review.agent_failures,
                [role]: { role, error, failure, session_id },
            }
            if (failure === 'engine') {
                return {
                    ...review,
                    agent_failures,
                    engine_failures: {
                        ...review.engine_failures,
                        [role]: (review.engine_failures[role] ?? 0) + 1,
                    },
                }
            }
            return {
                ...review,
                agent_failures,
                engine_failures: omit(review.engine_failures, role),
                failed_tries: {
                    ...review.failed_tries,
                    [role]: (review.failed_tries[role] ?? 0) + 1,
                },
            }
        }
        case 'gates_run':
            return {
                ...review,
                gates: { ok: record.content.ok, checks: record.content.checks },
            }
        case 'leftover_scan':
            return { ...review, leftovers: record.content.hits }
        case 'commit_made':
            return {
                ...review,
                commit: {
                    sha: record.content.sha,
                    files: record.content.files,
                },
            }
        case 'run_branch_pushed':
            return { ...review, pushed: record.content.sha }
    }
}

type TicketRecord = Exclude<
    JournalRecord,
    {
        kind:
            | 'run_started'
            | 'intake_read'
            | 'intake_refused'
            | 'nothing_to_do'
            | 'spec_snapshot'
            | 'ticket_snapshot'
            | 'run_branch_created'
            | 'worktrees_removed'
            | 'pull_request_opened'
            | 'jev_asked'
            | 'jev_answered'
            | 'jev_failed'
            | 'agent_session'
            | 'agent_session_closed'
            | 'run_stopped'
            | 'limit_wait_started'
            | 'limit_wait_ended'
            | 'usage_line_wait_started'
            | 'usage_line_wait_ended'
            | 'usage_recorded'
            | 'agent_message'
            | 'agent_message_delivered'
            | 'shared_git_changed'
            | 'final_review_started'
            | 'lens_started'
            | 'lens_finished'
            | 'final_review_fixing'
            | 'final_review_stuck'
            | 'final_review_passed'
            | 'final_review_shipped'
            | 'comment_read'
            | 'reply_ignored'
            | 'final_review_retried'
            | 'memory_recalled'
            | 'memories_saved'
            | 'learning_skipped'
            | 'memories_reported'
            | 'step_started'
            | 'step_ended'
            | 'run_resumed'
            | 'join_started'
            | 'memory_write_started'
            | 'memory_write_done'
            | 'baseline_reused'
    }
>

type FinishedContent = Extract<
    JournalRecord,
    { kind: 'agent_finished' }
>['content']

/** A finished agent's assumptions; the learner makes none. */
const assumptionsOf = (finished: FinishedContent): string[] =>
    'assumptions' in finished.result ? finished.result.assumptions : []

/**
 * Where a finished agent's result goes in its ticket's progress. A result
 * that answers a fix-loop follow-up counts a round and clears the failed
 * check, so it runs again.
 */
const resultChange = ({
    progress,
    finished,
    seq,
}: {
    progress: TicketProgress
    finished: FinishedContent
    seq: number
}): Partial<TicketProgress> => {
    const fix = progress.review_fix
    const { rejoin } = progress
    switch (finished.role) {
        case 'test-writer':
            // The fresh test-writer after a rebase fixed the clashed tests:
            // no fix round, and the red check stands.
            if (rejoin?.tests_pending) {
                return { rejoin: { ...rejoin, tests_pending: false } }
            }
            if (fix !== null && !fix.tests_answered) {
                return {
                    review_fix: {
                        ...fix,
                        tests_answered: true,
                        responses: [
                            ...fix.responses,
                            ...finished.result.finding_responses,
                        ],
                    },
                }
            }
            return progress.red_check === null
                ? { test_writer: finished.result }
                : {
                      test_writer: finished.result,
                      red_check: null,
                      red_fix_rounds: progress.red_fix_rounds + 1,
                  }
        case 'implementer': {
            const { result } = finished
            // The implementer's answer to the clash message is no fix round.
            if (rejoin?.code_pending) {
                return {
                    implementer: result,
                    rejoin: { ...rejoin, code_pending: false },
                }
            }
            if (fix !== null && fix.tests_answered && !fix.code_answered) {
                return {
                    review_fix: {
                        ...fix,
                        code_answered: true,
                        responses: [
                            ...fix.responses,
                            ...result.finding_responses,
                        ],
                        bad_test:
                            result.outcome === 'bad_test'
                                ? (result.bad_test ?? {
                                      file: '',
                                      name: '',
                                      reason: result.summary,
                                  })
                                : null,
                    },
                }
            }
            const bounce: Partial<TicketProgress> =
                result.outcome === 'bad_test'
                    ? {
                          bad_test_bounces: progress.bad_test_bounces + 1,
                          bad_test: result.bad_test ?? {
                              file: '',
                              name: '',
                              reason: result.summary,
                          },
                      }
                    : {}
            const round: Partial<TicketProgress> =
                progress.gates === null
                    ? {}
                    : {
                          gates: null,
                          gate_fix_rounds: progress.gate_fix_rounds + 1,
                      }
            return { implementer: result, ...round, ...bounce }
        }
        case 'ticket-reviewer':
            return reviewChange({ progress, review: finished.result, seq })
        // Lenses review the run branch, never a ticket.
        default:
            return {}
    }
}

/**
 * The fixers' "won't fix" answers the new review let go: its ruling was
 * `accepted`, or it gave none and did not list the finding again.
 */
const declinedBy = ({
    fix,
    review,
}: {
    fix: Pick<ReviewFix, 'findings' | 'responses'> | null
    review: TicketReviewResult
}): DeclinedFinding[] => {
    if (fix === null) return []
    const listed = new Set(review.findings.map(({ id }) => id))
    return fix.responses.flatMap(({ finding_id, response, reason }) => {
        if (response !== 'wont_fix') return []
        const finding = fix.findings.find(({ id }) => id === finding_id)
        if (finding === undefined) return []
        const ruling = review.rulings.find(
            (entry) => entry.finding_id === finding_id
        )
        const accepted =
            ruling === undefined
                ? !listed.has(finding_id)
                : ruling.ruling === 'accepted'
        return accepted
            ? [{ finding, reason, ruling: ruling?.reason ?? '' }]
            : []
    })
}

/**
 * A finished ticket review: counts the round, settles the last round's
 * "won't fix" answers, keeps its nits, and opens a fix round when a finding
 * is a blocker or a should-fix. A new fix round starts its gates, gate fix
 * rounds, and fix commit afresh.
 */
const reviewChange = ({
    progress,
    review,
    seq,
}: {
    progress: TicketProgress
    review: TicketReviewResult
    /** The review's record, for the join queue's order once it approves. */
    seq: number
}): Partial<TicketProgress> => {
    const review_rounds = progress.review_rounds + 1
    const blocking = review.findings.filter(isBlocking)
    const newNits = review.findings.filter(
        (finding) =>
            !isBlocking(finding) &&
            !progress.nits.some(({ id }) => id === finding.id)
    )
    const settled: Partial<TicketProgress> = {
        review,
        review_rounds,
        reviewed_sha: progress.commits.fix ?? progress.commits.green,
        nits: [...progress.nits, ...newNits],
        declined: [
            ...progress.declined,
            ...declinedBy({ fix: progress.review_fix, review }),
        ],
    }
    if (blocking.length === 0) {
        return { ...settled, review_fix: null, approved_seq: seq }
    }
    return {
        ...settled,
        approved_seq: null,
        review_fix: {
            round: review_rounds,
            findings: blocking,
            tests_answered: !blocking.some(({ kind }) => kind === 'test'),
            code_answered: !blocking.some(({ kind }) => kind === 'code'),
            responses: [],
            bad_test: null,
        },
        gates: null,
        gate_fix_rounds: 0,
        leftovers: { ...progress.leftovers, fix: null },
        commits: { ...progress.commits, fix: null },
        commit_files: { ...progress.commit_files, fix: [] },
    }
}

/** The sessions after a turn: the role's latest, or none if unknown. */
const sessionsAfter = ({
    sessions,
    role,
    session_id,
}: {
    sessions: Partial<Record<AgentRole, string>>
    role: AgentRole
    session_id: string | null
}): Partial<Record<AgentRole, string>> => {
    const rest = omit(sessions, role)
    return session_id === null ? rest : { ...rest, [role]: session_id }
}

const progressChange = ({
    progress,
    record,
}: {
    progress: TicketProgress
    record: TicketRecord
}): Partial<TicketProgress> => {
    switch (record.kind) {
        case 'ticket_worktree_created':
            return { worktree: record.content }
        case 'dependencies_installed':
            return { install: { check: record.content.check } }
        case 'baseline_tests':
            return {
                baseline: record.content,
                baseline_sha: progress.worktree?.base_sha ?? null,
            }
        case 'agent_started':
            return { retried: null, crashed_turn: null }
        case 'agent_finished': {
            const finished = record.content
            return {
                setup_change: setupChangeOf({ finished }),
                agent_failure: null,
                engine_failures: 0,
                sessions: sessionsAfter({
                    sessions: progress.sessions,
                    role: finished.role,
                    session_id: finished.session_id,
                }),
                assumptions: [
                    ...progress.assumptions,
                    ...assumptionsOf(finished),
                ],
                ...resultChange({ progress, finished, seq: record.seq }),
            }
        }
        case 'agent_failed': {
            const { role, error, failure, session_id } = record.content
            const agent_failure = { role, error, failure, session_id }
            if (failure === 'engine') {
                return {
                    agent_failure,
                    engine_failures: progress.engine_failures + 1,
                }
            }
            // The engine's side worked this time, so the run of engine
            // failures is over.
            return {
                agent_failure,
                engine_failures: 0,
                failed_tries: {
                    ...progress.failed_tries,
                    [role]: (progress.failed_tries[role] ?? 0) + 1,
                },
            }
        }
        case 'red_check': {
            const { ok, problems, notes, tests } = record.content
            return { red_check: { ok, problems, notes, output: tests.output } }
        }
        case 'worktree_reset':
            // A fresh test-writer and implementer start over on a clean
            // worktree; the bad test and its count stay.
            return {
                test_writer: null,
                red_check: null,
                red_fix_rounds: 0,
                implementer: null,
                gates: null,
                gate_fix_rounds: 0,
                leftovers: { red: null, green: null, fix: null },
                commits: { ...progress.commits, red: null },
                sessions: omit(progress.sessions, [
                    'test-writer',
                    'implementer',
                ]),
            }
        case 'leftover_scan':
            return {
                leftovers: {
                    ...progress.leftovers,
                    [record.content.stage]: record.content.hits,
                },
            }
        case 'commit_made':
            return {
                commits: {
                    ...progress.commits,
                    [record.content.stage]: record.content.sha,
                },
                commit_files: {
                    ...progress.commit_files,
                    [record.content.stage]: record.content.files,
                },
            }
        case 'gates_run': {
            const { ok, checks } = record.content
            return record.content.target === 'ticket'
                ? { gates: { ok, checks } }
                : { join_gates: { ok, checks } }
        }
        case 'ticket_joined':
            return { joined: record.content }
        case 'ticket_rebased':
            return rebasedChange({ progress, rebased: record.content })
        case 'run_branch_pushed':
            return { pushed: record.content.sha }
        case 'ticket_stuck':
            return { stuck: record.content, stuck_report: null, reply: null }
        case 'stuck_reported':
            return { stuck_report: { comment_id: record.content.comment_id } }
        case 'reply_received': {
            const { word, comment_id } = record.content
            // `stop` is the run's, and `ship` the final review's.
            return word === 'retry' || word === 'skip'
                ? { reply: { word, comment_id } }
                : {}
        }
        case 'ticket_retried':
            return retriedChange({ progress, retried: record.content })
        case 'ticket_skipped':
            return {
                skipped: { because: record.content.because },
                reply: null,
            }
        case 'join_undone':
            return { joined: null, join_gates: null }
    }
}

/**
 * The final review's report and reply after one of its records: a new
 * stuck is told afresh, and a ship settles the reply.
 */
const finalRepliesAfter = ({
    state,
    record,
}: {
    state: RunState
    record: JournalRecord
}): Pick<RunState, 'final_stuck_report' | 'final_reply'> => {
    switch (record.kind) {
        case 'final_review_stuck':
            return { final_stuck_report: null, final_reply: null }
        case 'final_review_shipped':
            return {
                final_stuck_report: state.final_stuck_report,
                final_reply: null,
            }
        default:
            return {
                final_stuck_report: state.final_stuck_report,
                final_reply: state.final_reply,
            }
    }
}

/**
 * The stuck final review resumed by `retry`, like a resumed ticket: fresh
 * fixers (no session kept) and fresh counts, and the owner's edits in the
 * run branch's worktree kept. A leftover scan, failed gates, or a step
 * crashes cut off just run again; a failed lens gets a fresh one; otherwise the open fix round
 * starts over as round 1, so the fixes (and the owner's edits) are gated,
 * committed, pushed, and re-reviewed.
 */
const resumedFinalReview = ({
    review,
}: {
    review: FinalReviewState
}): FinalReviewState => {
    const base: FinalReviewState = {
        ...review,
        stuck: null,
        shipped: false,
        sessions: {},
        agent_failures: {},
        failed_tries: {},
        engine_failures: {},
        gate_fix_rounds: 0,
        gates: review.commit === null ? null : review.gates,
        leftovers: review.commit === null ? null : review.leftovers,
    }
    const { fix, stuck } = review
    if (
        fix === null ||
        stuck?.reason === 'leftovers_found' ||
        stuck?.reason === 'gates_failed' ||
        stuck?.reason === 'agent_failed' ||
        stuck?.reason === 'crashed'
    ) {
        return base
    }
    return {
        ...base,
        round: 1,
        fix: {
            ...fix,
            round: 1,
            tests_answered: !fix.findings.some(({ kind }) => kind === 'test'),
            code_answered: !fix.findings.some(({ kind }) => kind === 'code'),
            responses: [],
            bad_test: null,
        },
        fixing_started: false,
        commit: null,
        pushed: null,
    }
}

/** The spec comments the engine posted, plus this one if it posted one. */
const engineCommentsAfter = ({
    state,
    comment_id,
}: {
    state: RunState
    comment_id: number | null
}): number[] =>
    comment_id === null
        ? state.engine_comments
        : [...state.engine_comments, comment_id]

/** The test setup change an agent asked for in its result, if any. */
const setupChangeOf = ({
    finished,
}: {
    finished: FinishedContent
}): TicketProgress['setup_change'] => {
    if (finished.role !== 'test-writer' && finished.role !== 'implementer') {
        return null
    }
    const { outcome, setup_change } = finished.result
    if (outcome !== 'needs_setup_change') return null
    return {
        role: finished.role,
        file: setup_change?.file ?? '',
        reason: setup_change?.reason ?? finished.result.summary,
    }
}

type RetriedContent = Extract<
    JournalRecord,
    { kind: 'ticket_retried' }
>['content']

/**
 * A `retry` of a stuck ticket. `refused` leaves it stuck, waiting for the
 * next reply. `restart` starts it over from scratch (its new snapshot was
 * journaled just before), in its worktree reset to the run branch's tip.
 * `resume` picks up where it stopped (see `resumedProgress`).
 */
const retriedChange = ({
    progress,
    retried,
}: {
    progress: TicketProgress
    retried: RetriedContent
}): Partial<TicketProgress> => {
    switch (retried.mode) {
        case 'refused':
            return { reply: null }
        case 'restart':
            return {
                ...EMPTY_TICKET_PROGRESS,
                worktree:
                    progress.worktree === null || retried.base_sha === null
                        ? progress.worktree
                        : { ...progress.worktree, base_sha: retried.base_sha },
            }
        case 'resume':
            return resumedProgress({ progress })
    }
}

/**
 * A stuck ticket resumed by `retry`: it picks up where it stopped, with a
 * fresh agent (no session is kept) and fresh counts (fix rounds, failed
 * tries, bad-test bounces, rebases), and keeps whatever the user changed in
 * its worktree. The step that got stuck runs again:
 * - before the red commit, a fresh test-writer writes the tests;
 * - before the green commit, a fresh implementer builds (on top of the run
 *   branch after a rebase), then the gates;
 * - in a review fix round, the round starts over as round 1 with fresh
 *   fixers, so the user's changes are gated, committed, and re-reviewed;
 * - a leftover scan, a failed install, a reviewer's failed tries, a
 *   failed join, or a step crashes cut off just run again.
 */
const resumedProgress = ({
    progress,
}: {
    progress: TicketProgress
}): Partial<TicketProgress> => {
    const { stuck, commits, review_fix, rejoin } = progress
    const base: Partial<TicketProgress> = {
        stuck: null,
        stuck_report: null,
        reply: null,
        retried: stuck,
        setup_change: null,
        agent_failure: null,
        failed_tries: {},
        engine_failures: 0,
        sessions: {},
        red_fix_rounds: 0,
        gate_fix_rounds: 0,
        bad_test_bounces: 0,
        rejoins: 0,
        install:
            progress.install?.check?.ok === false ? null : progress.install,
        leftovers: {
            red: commits.red === null ? null : progress.leftovers.red,
            green: commits.green === null ? null : progress.leftovers.green,
            fix: commits.fix === null ? null : progress.leftovers.fix,
        },
    }
    const reason = stuck?.reason
    const reviewerFailed = progress.agent_failure?.role === 'ticket-reviewer'
    if (
        reason === 'leftovers_found' ||
        reason === 'install_failed' ||
        reason === 'join_failed' ||
        reason === 'join_gates_failed' ||
        reason === 'crashed' ||
        reviewerFailed
    ) {
        return base
    }
    if (commits.green === null) {
        if (
            rejoin === null &&
            commits.red === null &&
            progress.test_writer !== null
        ) {
            return { ...base, test_writer: null, red_check: null }
        }
        return { ...base, implementer: null, gates: null }
    }
    if (review_fix === null) return base
    return {
        ...base,
        review_rounds: 1,
        review_fix: {
            ...review_fix,
            round: 1,
            tests_answered: !review_fix.findings.some(
                ({ kind }) => kind === 'test'
            ),
            code_answered: !review_fix.findings.some(
                ({ kind }) => kind === 'code'
            ),
            responses: [],
            bad_test: null,
        },
        gates: null,
        leftovers: { ...base.leftovers!, fix: null },
        commits: { ...commits, fix: null },
        commit_files: { ...progress.commit_files, fix: [] },
    }
}

type RebasedContent = Extract<
    JournalRecord,
    { kind: 'ticket_rebased' }
>['content']

/**
 * A ticket sent back onto the run branch: its change now sits uncommitted on
 * the run branch's tip. Its tests and code are fixed there, then the gates,
 * one green commit, a fresh review of the new changes (with its own fix
 * rounds), and a new join. The review loop starts over, but its nits and
 * declined findings stay for the PR. The implementer keeps its session; the
 * test-writer and reviewer start fresh. A worktree whose dependencies moved
 * under it is installed again.
 */
const rebasedChange = ({
    progress,
    rebased,
}: {
    progress: TicketProgress
    rebased: RebasedContent
}): Partial<TicketProgress> => {
    const { cause, base_sha, tests, code, reinstall } = rebased
    return {
        worktree:
            progress.worktree === null
                ? null
                : { ...progress.worktree, base_sha },
        install: reinstall ? null : progress.install,
        rejoins: progress.rejoins + 1,
        rejoin: {
            cause,
            base_sha,
            tests,
            code,
            tests_pending: tests.length > 0,
            code_pending: code.length > 0,
            earlier_findings: [
                ...(progress.review?.findings ?? []),
                ...progress.declined.map(({ finding }) => finding),
            ],
        },
        gates: null,
        gate_fix_rounds: 0,
        leftovers: { ...progress.leftovers, green: null, fix: null },
        commits: { ...progress.commits, green: null, fix: null },
        commit_files: { ...progress.commit_files, green: [], fix: [] },
        review: null,
        review_rounds: 0,
        reviewed_sha: null,
        review_fix: null,
        approved_seq: null,
        joined: null,
        join_gates: null,
        pushed: null,
        agent_failure: null,
        engine_failures: 0,
        sessions: omit(progress.sessions, ['test-writer', 'ticket-reviewer']),
    }
}

/** The final review's scheduler keys: `final`, and `lens:<lens>`. */
export const isFinalKey = (key: string): boolean =>
    key === 'final' || key.startsWith('lens:')

/** The crash counts without the final review's keys, for its `retry`. */
const omitFinalKeys = ({ crashes }: { crashes: CrashCounts }): CrashCounts =>
    Object.fromEntries(
        Object.entries(crashes).filter(([key]) => !isFinalKey(key))
    )

const isFixerRole = (role: AgentRole): boolean =>
    role === 'test-writer' || role === 'implementer'

/** A failed turn's session forgotten, when it is this role's. */
const failureWithoutSession = <
    Failure extends { role: AgentRole; session_id: string | null },
>({
    failure,
    role,
}: {
    failure: Failure | null | undefined
    role: AgentRole
}): Failure | null =>
    failure === null || failure === undefined
        ? null
        : failure.role === role
          ? { ...failure, session_id: null }
          : failure

/**
 * A restarted engine's `run_resumed`: each agent turn a crash cut off is
 * taken again in a fresh session, so its role's session (and a failed
 * turn's session, for a follow-up) is forgotten, on its ticket or in the
 * final review, and the fresh agent is told of the crash. The counts it
 * adds live in `crashes`.
 */
const resumedAfter = ({
    state,
    record,
}: {
    state: RunState
    record: Extract<JournalRecord, { kind: 'run_resumed' }>
}): RunState =>
    record.content.interrupted.reduce((current, { key, ticket, role }) => {
        const parsed = AgentRoleSchema.safeParse(role)
        if (!parsed.success) return current
        const agent = parsed.data
        if (key === 'final') {
            const review = current.final_review
            const failed = failureWithoutSession({
                failure: review.agent_failures[agent],
                role: agent,
            })
            return {
                ...current,
                final_review: {
                    ...review,
                    sessions: omit(review.sessions, agent),
                    agent_failures:
                        failed === null
                            ? review.agent_failures
                            : { ...review.agent_failures, [agent]: failed },
                    crashed_turn: isFixerRole(agent)
                        ? agent
                        : review.crashed_turn,
                },
            }
        }
        if (ticket === null || key !== String(ticket)) return current
        const progress = current.tickets[ticket] ?? EMPTY_TICKET_PROGRESS
        return {
            ...current,
            tickets: {
                ...current.tickets,
                [ticket]: {
                    ...progress,
                    sessions: omit(progress.sessions, agent),
                    agent_failure: failureWithoutSession({
                        failure: progress.agent_failure,
                        role: agent,
                    }),
                    crashed_turn: agent,
                },
            },
        }
    }, state)

/**
 * A closed session can take no follow-up: it is forgotten wherever the
 * decision step would follow it up (a role's latest session, or a failed
 * turn's), on its ticket, in the final review, or the learner's, so a fix
 * round that would have gone to it goes to a fresh agent.
 */
const closedSessionAfter = ({
    state,
    session_id,
}: {
    state: RunState
    session_id: string
}): RunState => {
    const forget = <Failure extends { session_id: string | null }>(
        failure: Failure
    ): Failure =>
        failure.session_id === session_id
            ? { ...failure, session_id: null }
            : failure
    const withoutIt = (sessions: Partial<Record<AgentRole, string>>) =>
        omitBy(sessions, (id) => id === session_id)
    const review = state.final_review
    const { learner } = state.memory
    return {
        ...state,
        tickets: mapValues(state.tickets, (progress) => ({
            ...progress,
            sessions: withoutIt(progress.sessions),
            agent_failure:
                progress.agent_failure === null
                    ? null
                    : forget(progress.agent_failure),
        })),
        final_review: {
            ...review,
            sessions: withoutIt(review.sessions),
            agent_failures: mapValues(review.agent_failures, (failure) =>
                failure === undefined ? failure : forget(failure)
            ),
        },
        memory: {
            ...state.memory,
            learner: {
                ...learner,
                agent_failure:
                    learner.agent_failure === null
                        ? null
                        : forget(learner.agent_failure),
            },
        },
    }
}

const applyTicketRecord = ({
    state,
    record,
}: {
    state: RunState
    record: TicketRecord
}): RunState => {
    if (record.ticket === null) return state
    const progress = state.tickets[record.ticket] ?? EMPTY_TICKET_PROGRESS
    return {
        ...state,
        tickets: {
            ...state.tickets,
            [record.ticket]: {
                ...progress,
                ...progressChange({ progress, record }),
            },
        },
    }
}

/**
 * A ticket took another ticket's baseline, as it stood when the reuse was
 * journaled, so a replay gives it the same one.
 */
const reusedBaselineAfter = ({
    state,
    record,
}: {
    state: RunState
    record: Extract<JournalRecord, { kind: 'baseline_reused' }>
}): RunState => {
    if (record.ticket === null) return state
    const { from_ticket, base_sha } = record.content
    const baseline = state.tickets[from_ticket]?.baseline ?? null
    if (baseline === null) return state
    const progress = state.tickets[record.ticket] ?? EMPTY_TICKET_PROGRESS
    return {
        ...state,
        tickets: {
            ...state.tickets,
            [record.ticket]: { ...progress, baseline, baseline_sha: base_sha },
        },
    }
}

/**
 * Rebuilds a run's state purely from its journal records, in order.
 *
 * @example
 * const state = replayRun({ records: journal.read() })
 * if (state.phase === 'refused') console.log(state.problems)
 */
export const replayRun = ({
    records,
}: {
    records: JournalRecord[]
}): RunState =>
    records.reduce(
        (state, record) => applyRecord({ state, record }),
        EMPTY_STATE
    )
