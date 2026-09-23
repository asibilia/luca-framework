import omit from 'lodash/omit'

import type { CommitStage, JournalRecord, StuckReason } from './journal-record'

import type {
    AgentRole,
    BadTest,
    ImplementerResult,
    TestWriterResult,
    TicketReviewResult,
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

/** One gate run, as journaled. */
export type ReplayedGates = { ok: boolean; checks: GateCheck[] }

/** The red check's verdict, plus the test run's (clipped) output. */
export type ReplayedRedCheck = RedCheckResult & { output: string }

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
    review: TicketReviewResult | null
    /** The latest failed agent turn, if it came after that role's last result. */
    agent_failure: { role: string; error: string } | null
    leftovers: Record<CommitStage, LeftoverHit[] | null>
    commits: Record<CommitStage, string | null>
    gates: ReplayedGates | null
    joined: { ok: true; shas: string[] } | { ok: false; error: string } | null
    join_gates: ReplayedGates | null
    pushed: string | null
    stuck: { reason: StuckReason; detail: string } | null
}

/** The run's pull request, once opened. */
export type ReplayedPullRequest = { number: number; url: string }

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
    tickets: Record<number, TicketProgress>
    pull_request: ReplayedPullRequest | null
    last_seq: number
}

/** A ticket nothing has happened to yet. */
export const EMPTY_TICKET_PROGRESS: TicketProgress = {
    worktree: null,
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
    agent_failure: null,
    leftovers: { red: null, green: null },
    commits: { red: null, green: null },
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
    tickets: {},
    pull_request: null,
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
        case 'pull_request_opened':
            return {
                ...next,
                pull_request: {
                    number: record.content.number,
                    url: record.content.url,
                },
            }
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
            | 'pull_request_opened'
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
}: {
    progress: TicketProgress
    finished: FinishedContent
}): Partial<TicketProgress> => {
    switch (finished.role) {
        case 'test-writer':
            return progress.red_check === null
                ? { test_writer: finished.result }
                : {
                      test_writer: finished.result,
                      red_check: null,
                      red_fix_rounds: progress.red_fix_rounds + 1,
                  }
        case 'implementer': {
            const { result } = finished
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
            return { review: finished.result }
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
        case 'baseline_tests':
            return { baseline: record.content }
        case 'agent_started':
            return {}
        case 'agent_finished': {
            const finished = record.content
            return {
                agent_failure: null,
                sessions: sessionsAfter({
                    sessions: progress.sessions,
                    role: finished.role,
                    session_id: finished.session_id,
                }),
                assumptions: [
                    ...progress.assumptions,
                    ...finished.result.assumptions,
                ],
                ...resultChange({ progress, finished }),
            }
        }
        case 'agent_failed': {
            const { role, error } = record.content
            return { agent_failure: { role, error } }
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
                leftovers: { red: null, green: null },
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
            }
        case 'gates_run': {
            const { ok, checks } = record.content
            return record.content.target === 'ticket'
                ? { gates: { ok, checks } }
                : { join_gates: { ok, checks } }
        }
        case 'ticket_joined':
            return { joined: record.content }
        case 'run_branch_pushed':
            return { pushed: record.content.sha }
        case 'ticket_stuck':
            return { stuck: record.content }
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
