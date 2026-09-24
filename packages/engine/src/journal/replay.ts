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
    lensOf,
    type AgentRole,
    type BadTest,
    type Finding,
    type FindingResponse,
    type ImplementerResult,
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
    /** The latest gates on the run branch: after a join, or a final review fix. */
    run_branch_gates: ReplayedGates | null
    final_review: FinalReviewState
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
    run_branch_gates: null,
    final_review: EMPTY_FINAL_REVIEW,
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
    const base = { ...state, last_seq: record.seq }
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
    const finalRecord = finalRecordOf({ state, record })
    if (finalRecord !== null) {
        const final_review = finalReviewAfter({
            review: state.final_review,
            record: finalRecord,
        })
        // A session's readings still count for the plan.
        return record.kind === 'agent_session'
            ? {
                  ...next,
                  final_review,
                  plan: planAfter({ plan: state.plan, record }),
              }
            : { ...next, final_review }
    }
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
        // Agent messages change no ticket's progress; the message rules
        // read them from the records themselves.
        case 'agent_message':
        case 'agent_message_delivered':
            return next
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
        case 'lens_started':
        case 'lens_finished':
        case 'agent_started':
        case 'agent_session':
            return review
        case 'final_review_fixing':
            return review.fix !== null && record.content.round === review.fix.round
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
                        ...finished.result.assumptions,
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
            | 'run_stopped'
            | 'limit_wait_started'
            | 'limit_wait_ended'
            | 'usage_recorded'
            | 'agent_message'
            | 'agent_message_delivered'
            | 'final_review_started'
            | 'lens_started'
            | 'lens_finished'
            | 'final_review_fixing'
            | 'final_review_stuck'
            | 'final_review_passed'
            | 'final_review_shipped'
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
