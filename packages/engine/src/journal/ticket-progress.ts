/**
 * The shape of one ticket's progress as replay rebuilds it, with its parts
 * (worktree, gates, review fix round, rejoin, test update), and the progress
 * of a ticket nothing has happened to yet.
 */
import type {
    AgentFailure,
    CommitStage,
    JournalRecord,
    StuckReason,
} from './journal-record'

import type { RejoinContext } from '../agents/role-prompts'
import type {
    AgentRole,
    BadTest,
    BadTestSource,
    Finding,
    FindingResponse,
    ImplementerResult,
    TestRef,
    TestWriterResult,
    TicketReviewResult,
} from '../agents/role-results'
import type {
    GateCheck,
    LeftoverHit,
    RedCheckResult,
    TestCase,
    TestRun,
} from '../gates/gate-schemas'

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
    /** Where the ticket started from before this rebase. */
    from_sha: string
}

/**
 * The open test update after a rebase (`tests_sent_back`, #489): the bad
 * test, what joined the run branch, and the test-writer's answer once it
 * gave one. It closes when the implementer answers after it.
 */
export type TestUpdate = TestsSentBackContent & {
    /** The test-writer's answer, `null` until it gave one. */
    result: TestWriterResult | null
}

type TestsSentBackContent = Extract<
    JournalRecord,
    { kind: 'tests_sent_back' }
>['content']

/**
 * The open refactor test update (`refactor_test_update`, #686): the test
 * file the refactor ticket's implementer named, its reason, and the test
 * files as they were then. Then the test-writer's answer, and the test
 * files the engine found it changed. It closes when the implementer answers
 * after it.
 */
export type RefactorUpdate = RefactorTestUpdateContent & {
    /** The test-writer's answer, `null` until it gave one. */
    result: TestWriterResult | null
    /** The test files changed since the update, `null` until checked. */
    changed: string[] | null
}

type RefactorTestUpdateContent = Extract<
    JournalRecord,
    { kind: 'refactor_test_update' }
>['content']

/**
 * One gate run, as journaled. A ticket's gates also carry the test cases of
 * its red test files, with their `expect()` counts (#581); none in an older
 * journal, or in a join's or the final review's gates.
 */
export type ReplayedGates = {
    ok: boolean
    checks: GateCheck[]
    cases?: TestCase[]
} & SharedFailureFields

/**
 * What a ticket's red check or gates carry for shared failures (#544):
 * whether the run was a lone rerun, and whether each old test it failed
 * also failed in another ticket shortly before, so a lone rerun is due.
 */
export type SharedFailureFields = {
    /** It was a lone rerun, alone on every test slot. */
    exclusive?: boolean
    /** It failed only on old tests another ticket failed within 10 minutes. */
    shared?: boolean
}

/** The red check's verdict, plus the test run's (clipped) output. */
export type ReplayedRedCheck = RedCheckResult & {
    output: string
} & SharedFailureFields

/** A check that can get a lone rerun (#544). */
export type LoneRerunCheck = 'red_check' | 'gates'

/** The roles that write: they fix review findings. */
export type WriterRole = 'test-writer' | 'implementer'

/**
 * A writer's `environment` answer to a failed check (#613): who gave it,
 * its evidence, and the failed check it blamed on the environment. The
 * check runs again; a rerun that fails the same way makes it stuck. It
 * stays until the next agent answers.
 */
export type EnvironmentRerun = {
    role: 'test-writer' | 'implementer'
    evidence: string
} & (
    | { check: 'red_check'; failed: ReplayedRedCheck }
    | { check: 'gates'; failed: ReplayedGates }
)

/**
 * The open review fix round: the blockers and should-fixes the latest ticket
 * review sent back, and which fixers have answered. Test findings go to a
 * fresh test-writer first, then code findings to the implementer, then any
 * finding a fixer answered `other_role` to the other writer role.
 */
export type ReviewFix = {
    /** 1 after the first review, 2 after the first re-review, ... */
    round: number
    findings: Finding[]
    /** True once the test-writer answered, or when no finding is a test finding. */
    tests_answered: boolean
    /** True once the implementer answered, or when no finding is a code finding. */
    code_answered: boolean
    /**
     * The fixers' answers, oldest first. A handed-off finding's answer from
     * the other role replaces the first one.
     */
    responses: FindingResponse[]
    /**
     * The findings a fixer answered `other_role` (#616), by the writer role
     * they were handed to. After the round's fixers answered, each role here
     * runs once more, fresh, with only these findings; its answer clears it.
     */
    handed_off: Partial<Record<WriterRole, string[]>>
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
    /** The prepare command run before its baseline tests (`baseline_prepared`). */
    prepare: GateCheck | null
    /** Its own baseline test run, or the one it reused (`baseline_reused`). */
    baseline: TestRun | null
    /**
     * The run-branch commit the baseline was taken at. It stays when a rebase
     * moves the worktree, so the baseline is only lent to tickets from there.
     */
    baseline_sha: string | null
    test_writer: TestWriterResult | null
    red_check: ReplayedRedCheck | null
    /**
     * The new tests the latest passing red check proved fail first (#513),
     * from the test-writer's criteria, one per file and name. A failed red
     * check leaves them; a worktree reset clears them.
     */
    red_tests: TestRef[]
    /**
     * The engine's check of the test-writer's latest `already_done`
     * evidence (#495), `null` until it runs. A new test-writer result
     * clears it.
     */
    already_done_check: { ok: boolean; problems: string[] } | null
    /** Follow-ups the test-writer answered after a failed red check. */
    red_fix_rounds: number
    implementer: ImplementerResult | null
    /** Follow-ups the implementer answered after failed gates. */
    gate_fix_rounds: number
    /**
     * `environment` answers to a failed red check or failed gates (#613),
     * each a rerun that used no fix round.
     */
    environment_reruns: number
    /** The latest `environment` answer, until the next agent answers. */
    environment: EnvironmentRerun | null
    /**
     * How many times a test was sent back as bad, by the implementer or by
     * the engine, which found a mapped test that passes with no `expect()`
     * (#581). Both count toward `MAX_BAD_TEST_BOUNCES`.
     */
    bad_test_bounces: number
    /** The latest test sent back as bad, for the fresh test-writer's prompt. */
    bad_test: BadTest | null
    /**
     * Who sent each bounce counted in `bad_test_bounces`, oldest first (the
     * last is who sent `bad_test`). The prompt and the stuck details word each
     * bounce from its source (#581).
     */
    bad_test_sources: BadTestSource[]
    /**
     * Who sent `bad_test`, kept beside it. A retry clears `bad_test_sources`
     * but keeps this, so a fresh test-writer's prompt still words the bounce
     * from its source (#581).
     */
    bad_test_source: BadTestSource | null
    /** The session each role's latest turn ran in, for follow-ups. */
    sessions: Partial<Record<AgentRole, string>>
    /** Every assumption any agent on the ticket made, oldest first. */
    assumptions: string[]
    /**
     * How many turns each role on the ticket ran out of turns (#543), in the
     * order each first did, for the PR.
     */
    out_of_turns: Partial<Record<AgentRole, number>>
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
     * How many times its tests went back to the test-writer after a rebase
     * made them wrong (`tests_sent_back`, #489).
     */
    test_updates: number
    /** The open test update, `null` when none is open. */
    test_update: TestUpdate | null
    /** Refactor test updates the ticket had (#686); it gets one. */
    refactor_updates: number
    /** The open refactor test update, `null` when none is open. */
    refactor_update: RefactorUpdate | null
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
    /**
     * The model each role's latest agent on this ticket launched on
     * (#604); `null` in older journals.
     */
    launched_on: Partial<Record<AgentRole, string | null>>
    /**
     * The roles that used up a try (as `failed_tries` counts one) on a
     * model cheaper than Opus (#604): their later fresh agents on this
     * ticket run Opus. A retry keeps it.
     */
    failed_cheaper: AgentRole[]
    /** Engine failures in a row; any other turn's end resets it. */
    engine_failures: number
    leftovers: Record<CommitStage, LeftoverHit[] | null>
    commits: Record<CommitStage, string | null>
    /** The files each stage's latest commit changed. */
    commit_files: Record<CommitStage, string[]>
    gates: ReplayedGates | null
    /** The checks that had their one lone rerun on this ticket (#544). */
    lone_reruns: LoneRerunCheck[]
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
     * Its work was already on the base branch, done by these commits (#484):
     * the ticket is done without a join, like a pushed one.
     */
    already_done: { shas: string[] } | null
    /** The engine closed it (an already-done ticket in a run with no PR). */
    closed: boolean
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

/** The engine's install in a new worktree: `null` check means nothing to install. */
export type ReplayedInstall = { check: GateCheck | null }

/** A ticket nothing has happened to yet. */
export const EMPTY_TICKET_PROGRESS: TicketProgress = {
    worktree: null,
    install: null,
    prepare: null,
    baseline: null,
    baseline_sha: null,
    test_writer: null,
    red_check: null,
    red_tests: [],
    already_done_check: null,
    red_fix_rounds: 0,
    implementer: null,
    gate_fix_rounds: 0,
    environment_reruns: 0,
    environment: null,
    bad_test_bounces: 0,
    bad_test: null,
    bad_test_sources: [],
    bad_test_source: null,
    sessions: {},
    assumptions: [],
    out_of_turns: {},
    review: null,
    review_rounds: 0,
    reviewed_sha: null,
    review_fix: null,
    nits: [],
    declined: [],
    approved_seq: null,
    rejoins: 0,
    rejoin: null,
    test_updates: 0,
    test_update: null,
    refactor_updates: 0,
    refactor_update: null,
    agent_failure: null,
    failed_tries: {},
    launched_on: {},
    failed_cheaper: [],
    engine_failures: 0,
    leftovers: { red: null, green: null, fix: null },
    commits: { red: null, green: null, fix: null },
    commit_files: { red: [], green: [], fix: [] },
    gates: null,
    lone_reruns: [],
    joined: null,
    join_gates: null,
    pushed: null,
    stuck: null,
    stuck_report: null,
    reply: null,
    skipped: null,
    already_done: null,
    closed: false,
    retried: null,
    setup_change: null,
    crashed_turn: null,
}
