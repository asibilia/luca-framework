import omit from 'lodash/omit'
import uniq from 'lodash/uniq'

import type {
    AgentFailure,
    CommitStage,
    JournalRecord,
    StuckReason,
} from './journal-record'

import type { RejoinContext } from '../agents/role-prompts'
import {
    isBlocking,
    type AgentRole,
    type BadTest,
    type Finding,
    type FindingResponse,
    type ImplementerResult,
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
    baseline: TestRun | null
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
    stuck: { reason: StuckReason; detail: string } | null
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
    /** The tickets whose usage is recorded, and whether the run's is. */
    usage_recorded: { tickets: number[]; run: boolean }
    /** The worktrees the engine removed at the end of the run. */
    removed_worktrees: string[]
    /**
     * Every run note from every finished agent in the run, oldest first
     * (journal order), word for word.
     */
    run_notes: ReplayedRunNote[]
    last_seq: number
}

/** A ticket nothing has happened to yet. */
export const EMPTY_TICKET_PROGRESS: TicketProgress = {
    worktree: null,
    install: null,
    baseline: null,
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
    },
    usage_recorded: { tickets: [], run: false },
    removed_worktrees: [],
    run_notes: [],
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
    }
>

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
            return { ...plan, wait: null }
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
    if (ticket === null || content.role === 'ticket-reviewer') {
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
    const next = { ...state, last_seq: record.seq }
    switch (record.kind) {
        case 'run_started':
            return {
                ...next,
                phase: 'started',
                spec_number: record.content.spec_number,
                config: record.content.config,
                base_branch: record.content.base_branch,
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
        case 'run_stopped':
        case 'limit_wait_started':
        case 'limit_wait_ended':
            return { ...next, plan: planAfter({ plan: state.plan, record }) }
        case 'usage_recorded': {
            const { scope, ticket } = record.content
            const { tickets, run } = state.usage_recorded
            return {
                ...next,
                usage_recorded:
                    scope === 'run' || ticket === null
                        ? { tickets, run: true }
                        : { tickets: [...tickets, ticket], run },
            }
        }
        case 'agent_finished':
            return applyTicketRecord({
                state: { ...next, run_notes: notesAfter({ state, record }) },
                record,
            })
        default:
            return applyTicketRecord({ state: next, record })
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
            | 'run_stopped'
            | 'limit_wait_started'
            | 'limit_wait_ended'
            | 'usage_recorded'
    }
>

type FinishedContent = Extract<
    JournalRecord,
    { kind: 'agent_finished' }
>['content']

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
    fix: ReviewFix | null
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
            return { baseline: record.content }
        case 'agent_started':
            return {}
        case 'agent_finished': {
            const finished = record.content
            return {
                agent_failure: null,
                engine_failures: 0,
                sessions: sessionsAfter({
                    sessions: progress.sessions,
                    role: finished.role,
                    session_id: finished.session_id,
                }),
                assumptions: [
                    ...progress.assumptions,
                    ...finished.result.assumptions,
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
            return { stuck: record.content }
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
