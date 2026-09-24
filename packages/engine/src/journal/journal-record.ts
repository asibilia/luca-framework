import { z } from 'zod'

import { AgentSessionSchema } from '../agents/agent-launcher'
import { AgentRoleSchema, RoleResultSchema } from '../agents/role-results'
import { EngineConfigSchema } from '../config/engine-config'
import {
    GateCheckSchema,
    LeftoverHitSchema,
    RedCheckResultSchema,
    TestRunSchema,
} from '../gates/gate-schemas'
import {
    IntakeProblemSchema,
    IntakeReadSchema,
    SpecSnapshotSchema,
    TicketSnapshotSchema,
} from '../intake/intake-schemas'
import {
    JevAnswerSchema,
    JevFailureReasonSchema,
    JevFixedSchema,
    JevJobSchema,
    JevRequestSchema,
} from '../jev/jev-schemas'
import { UsageRecordSchema } from '../limits/plan-usage'

const ENTRY_FIELDS = {
    /** The ticket (or spec) a record is about, `null` for the whole run. */
    ticket: z.number().int().positive().nullable(),
    /** The role that produced the record, `null` for the engine itself. */
    role: z.string().nullable(),
}

const STAMP_FIELDS = {
    /** 1, 2, 3, ... in the order records were appended. */
    seq: z.number().int().min(1),
    time: z.iso.datetime(),
}

const RunStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_started'),
    content: z.object({
        spec_number: z.number().int().positive(),
        config: EngineConfigSchema,
        /** The branch the run branch starts from and its PR merges into. */
        base_branch: z.string().min(1).default('main'),
    }),
})

const IntakeReadEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('intake_read'),
    content: IntakeReadSchema,
})

const IntakeRefusedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('intake_refused'),
    content: z.object({ problems: z.array(IntakeProblemSchema) }),
})

const NothingToDoEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('nothing_to_do'),
    content: z.object({ closed_tickets: z.array(z.number().int()) }),
})

const SpecSnapshotEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('spec_snapshot'),
    content: z.object({
        spec: SpecSnapshotSchema,
        /** The open tickets in blocker order; one `ticket_snapshot` each. */
        ticket_order: z.array(z.number().int().positive()),
        closed_tickets: z.array(z.number().int().positive()),
    }),
})

const TicketSnapshotEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_snapshot'),
    content: TicketSnapshotSchema,
})

/** A git worktree the engine made: where, on which branch, from which commit. */
const WorktreeSchema = z.object({
    branch: z.string().min(1),
    path: z.string().min(1),
    base_sha: z.string().min(1),
})

const RunBranchCreatedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_branch_created'),
    content: WorktreeSchema,
})

const TicketWorktreeCreatedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_worktree_created'),
    content: WorktreeSchema,
})

/** The tests as they stood before any agent worked on a ticket. */
const BaselineTestsEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('baseline_tests'),
    content: TestRunSchema,
})

/**
 * An agent turn was started, with its prompt word for word. A follow-up in a
 * fix loop names the session it went to in `follow_up_of`, and `prompt` holds
 * the follow-up message.
 */
const AgentStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_started'),
    content: z.object({
        role: AgentRoleSchema,
        prompt: z.string(),
        follow_up_of: z.string().nullable().default(null),
    }),
})

/** The session an agent turn ran in; `null` in journals from before #363. */
const SESSION_FIELDS = { session_id: z.string().nullable().default(null) }

/** An agent finished with a result that fits its role's schema. */
const AgentFinishedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_finished'),
    content: z.discriminatedUnion('role', [
        RoleResultSchema.options[0].extend(SESSION_FIELDS),
        RoleResultSchema.options[1].extend(SESSION_FIELDS),
        RoleResultSchema.options[2].extend(SESSION_FIELDS),
    ]),
})

/**
 * How an agent's turn failed:
 * - `agent`: the turn itself failed (an error result, a timeout).
 * - `result`: no structured output, or output that misfits the role's schema.
 * - `guard`: the after-turn check found a change the role may not make.
 * - `engine`: the engine's side failed (the SDK crashed, or a follow-up's
 *   session is gone).
 *
 * The decision step counts the first three as failed tries; an engine
 * failure starts a fresh agent without using one.
 */
export const AgentFailureSchema = z.enum(['agent', 'result', 'guard', 'engine'])

export type AgentFailure = z.infer<typeof AgentFailureSchema>

/** An agent's turn failed, journaled once per turn with how it failed. */
const AgentFailedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_failed'),
    content: z.object({
        role: AgentRoleSchema,
        error: z.string(),
        failure: AgentFailureSchema.default('agent'),
        ...SESSION_FIELDS,
    }),
})

/** The launcher's summary of one agent turn's model session. */
const AgentSessionEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_session'),
    content: z.object({ role: AgentRoleSchema, session: AgentSessionSchema }),
})

/**
 * The run stopped because going on was unsafe: the wrong credentials or
 * plan, the wrong model, or a foreign MCP server. A later `runEngine` on the
 * same journal picks the step up again.
 *
 * A `billing` stop (overage, or a billing error) sticks: the run never goes
 * on, however often the engine is started again on its journal.
 */
const RunStoppedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_stopped'),
    content: z.object({
        reason: z.string(),
        role: AgentRoleSchema.nullable().default(null),
        billing: z.boolean().default(false),
    }),
})

/**
 * A plan window was used up (a rejected rate limit), so the whole run waits
 * until `until`: the window's reset plus a margin, or a default wait when the
 * reading named no reset. Written with `ticket: null`; the agent whose turn
 * hit the limit is `hit_ticket` and `hit_role`.
 */
const LimitWaitStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('limit_wait_started'),
    content: z.object({
        /** When the window resets, if the reading said. */
        resets_at: z.iso.datetime().nullable(),
        /** When the engine wakes and carries on. */
        until: z.iso.datetime(),
        /** The window, such as `five_hour`, `seven_day`, or `seven_day_opus`. */
        rate_limit_type: z.string().nullable(),
        hit_ticket: z.number().int().positive().nullable(),
        hit_role: AgentRoleSchema.nullable(),
    }),
})

/** The limit wait is over; the run carries on where it was cut off. */
const LimitWaitEndedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('limit_wait_ended'),
    content: z.object({ until: z.iso.datetime() }),
})

/**
 * The plan usage of one ticket (when it was pushed, or got stuck) or of the
 * whole run (when it ended): tokens from its agent sessions, and how far
 * each plan window moved.
 */
const UsageRecordedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('usage_recorded'),
    content: UsageRecordSchema,
})

const RedCheckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('red_check'),
    content: RedCheckResultSchema.extend({ tests: TestRunSchema }),
})

/**
 * The commits the engine makes on a ticket: tests first (`red`), then code
 * (`green`), then one per review fix round (`fix`).
 */
export const CommitStageSchema = z.enum(['red', 'green', 'fix'])

export type CommitStage = z.infer<typeof CommitStageSchema>

/** The leftover scan before an engine commit. Any hit blocks the commit. */
const LeftoverScanEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('leftover_scan'),
    content: z.object({
        stage: CommitStageSchema,
        hits: z.array(LeftoverHitSchema),
    }),
})

const CommitMadeEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('commit_made'),
    content: z.object({
        stage: CommitStageSchema,
        sha: z.string().min(1),
        message: z.string(),
        files: z.array(z.string()),
    }),
})

/** Where the gates or the install ran: a ticket's worktree, or the run branch. */
export const GateTargetSchema = z.enum(['ticket', 'run_branch'])

export type GateTarget = z.infer<typeof GateTargetSchema>

/**
 * The engine threw away every uncommitted change in a ticket's worktree, back
 * to `sha`, so a fresh test-writer starts clean after a bad test.
 */
const WorktreeResetEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('worktree_reset'),
    content: z.object({ sha: z.string().min(1) }),
})

/**
 * The engine installed the dependencies from the lockfile, without changing
 * it, in a new ticket worktree or the run branch's checkout, before any agent
 * or gate ran there. `check` is `null` when there is no `package.json`, so
 * nothing to install. The run branch's record has no ticket.
 */
const DependenciesInstalledEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('dependencies_installed'),
    content: z.object({
        target: GateTargetSchema,
        check: GateCheckSchema.nullable(),
    }),
})

const GatesRunEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('gates_run'),
    content: z.object({
        target: GateTargetSchema,
        ok: z.boolean(),
        checks: z.array(GateCheckSchema),
    }),
})

/** An approved ticket's commits, replayed onto the run branch (or not). */
const TicketJoinedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_joined'),
    content: z.discriminatedUnion('ok', [
        z.object({
            ok: z.literal(true),
            /** The new commits on the run branch, oldest first. */
            shas: z.array(z.string().min(1)),
        }),
        z.object({ ok: z.literal(false), error: z.string() }),
    ]),
})

/**
 * Why a joined ticket went back to be fixed on top of the run branch: its
 * commits clashed with it, or the gates failed after it joined.
 */
export const RejoinCauseSchema = z.enum(['clash', 'join_gates'])

export type RejoinCause = z.infer<typeof RejoinCauseSchema>

/**
 * The engine put a ticket's whole change back on top of the run branch, as
 * uncommitted changes in its worktree, after a clash or failed gates after
 * joining. `base_sha` is the run branch commit it now starts from. `tests`
 * and `code` are the files that clashed (conflict markers left in them),
 * split by the config's test file patterns. `undone` are the run branch
 * commits the engine undid first (a join whose gates failed), and
 * `reinstall` says whether the worktree needs its install again.
 */
const TicketRebasedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_rebased'),
    content: z.object({
        cause: RejoinCauseSchema,
        base_sha: z.string().min(1),
        tests: z.array(z.string()),
        code: z.array(z.string()),
        undone: z.array(z.string()),
        /**
         * The dependency files (manifests, lockfiles) differ between the
         * worktree's old base and the new one, and the ticket's own change
         * touches no manifest: the worktree gets its frozen install again.
         * (A ticket that changes a manifest gets the install in its gates.)
         */
        reinstall: z.boolean().default(false),
    }),
})

/**
 * The engine removed these git worktrees at the end of a run. Their branches
 * and the journal are kept.
 */
const WorktreesRemovedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('worktrees_removed'),
    content: z.object({ paths: z.array(z.string().min(1)) }),
})

const RunBranchPushedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_branch_pushed'),
    content: z.object({ branch: z.string(), sha: z.string() }),
})

/**
 * Why a ticket is stuck. A failed red check or gate is only stuck once its
 * fix loop reaches its cap, and a bad test only on its second bounce.
 */
export const StuckReasonSchema = z.enum([
    'agent_failed',
    'red_check_failed',
    'nothing_new_to_test',
    'leftovers_found',
    'gates_failed',
    'bad_test',
    'changes_requested',
    'join_failed',
    'join_gates_failed',
    'install_failed',
])

export type StuckReason = z.infer<typeof StuckReasonSchema>

const TicketStuckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_stuck'),
    content: z.object({ reason: StuckReasonSchema, detail: z.string() }),
})

const PullRequestOpenedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('pull_request_opened'),
    content: z.object({
        number: z.number().int().positive(),
        url: z.string(),
        head: z.string(),
        base: z.string(),
        title: z.string(),
        body: z.string(),
    }),
})

/** The engine asked Jev, in shadow mode, with its own fixed choice beside. */
const JevAskedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('jev_asked'),
    content: z.object({
        job: JevJobSchema,
        request: JevRequestSchema,
        fixed: JevFixedSchema,
    }),
})

/** Jev's answers to the `jev_asked` record at `asked_seq`. The engine ignores them. */
const JevAnsweredEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('jev_answered'),
    content: z.object({
        job: JevJobSchema,
        asked_seq: z.number().int().min(1),
        answers: z.record(z.string(), JevAnswerSchema),
        /** How long the call took. */
        ms: z.number().min(0),
    }),
})

/** The Jev call at `asked_seq` gave no answers. The run goes on regardless. */
const JevFailedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('jev_failed'),
    content: z.object({
        job: JevJobSchema,
        asked_seq: z.number().int().min(1),
        reason: JevFailureReasonSchema,
        error: z.string(),
        ms: z.number().min(0),
    }),
})

/**
 * What a caller hands the journal to append: a kind, its content, and who it
 * is about. The journal adds `seq` and `time`.
 *
 * Later tickets add kinds here (findings, replies, ...).
 */
export const JournalEntrySchema = z.discriminatedUnion('kind', [
    RunStartedEntrySchema,
    IntakeReadEntrySchema,
    IntakeRefusedEntrySchema,
    NothingToDoEntrySchema,
    SpecSnapshotEntrySchema,
    TicketSnapshotEntrySchema,
    RunBranchCreatedEntrySchema,
    TicketWorktreeCreatedEntrySchema,
    BaselineTestsEntrySchema,
    AgentStartedEntrySchema,
    AgentFinishedEntrySchema,
    AgentFailedEntrySchema,
    RedCheckEntrySchema,
    LeftoverScanEntrySchema,
    CommitMadeEntrySchema,
    WorktreeResetEntrySchema,
    DependenciesInstalledEntrySchema,
    GatesRunEntrySchema,
    TicketJoinedEntrySchema,
    TicketRebasedEntrySchema,
    RunBranchPushedEntrySchema,
    TicketStuckEntrySchema,
    PullRequestOpenedEntrySchema,
    JevAskedEntrySchema,
    JevAnsweredEntrySchema,
    JevFailedEntrySchema,
    AgentSessionEntrySchema,
    RunStoppedEntrySchema,
    LimitWaitStartedEntrySchema,
    LimitWaitEndedEntrySchema,
    UsageRecordedEntrySchema,
    WorktreesRemovedEntrySchema,
])

/** A journal entry as callers write it; schema defaults fill the rest. */
export type JournalEntry = z.input<typeof JournalEntrySchema>

/** One line of a run's journal. */
export const JournalRecordSchema = z.discriminatedUnion('kind', [
    RunStartedEntrySchema.extend(STAMP_FIELDS),
    IntakeReadEntrySchema.extend(STAMP_FIELDS),
    IntakeRefusedEntrySchema.extend(STAMP_FIELDS),
    NothingToDoEntrySchema.extend(STAMP_FIELDS),
    SpecSnapshotEntrySchema.extend(STAMP_FIELDS),
    TicketSnapshotEntrySchema.extend(STAMP_FIELDS),
    RunBranchCreatedEntrySchema.extend(STAMP_FIELDS),
    TicketWorktreeCreatedEntrySchema.extend(STAMP_FIELDS),
    BaselineTestsEntrySchema.extend(STAMP_FIELDS),
    AgentStartedEntrySchema.extend(STAMP_FIELDS),
    AgentFinishedEntrySchema.extend(STAMP_FIELDS),
    AgentFailedEntrySchema.extend(STAMP_FIELDS),
    RedCheckEntrySchema.extend(STAMP_FIELDS),
    LeftoverScanEntrySchema.extend(STAMP_FIELDS),
    CommitMadeEntrySchema.extend(STAMP_FIELDS),
    WorktreeResetEntrySchema.extend(STAMP_FIELDS),
    DependenciesInstalledEntrySchema.extend(STAMP_FIELDS),
    GatesRunEntrySchema.extend(STAMP_FIELDS),
    TicketJoinedEntrySchema.extend(STAMP_FIELDS),
    TicketRebasedEntrySchema.extend(STAMP_FIELDS),
    RunBranchPushedEntrySchema.extend(STAMP_FIELDS),
    TicketStuckEntrySchema.extend(STAMP_FIELDS),
    PullRequestOpenedEntrySchema.extend(STAMP_FIELDS),
    JevAskedEntrySchema.extend(STAMP_FIELDS),
    JevAnsweredEntrySchema.extend(STAMP_FIELDS),
    JevFailedEntrySchema.extend(STAMP_FIELDS),
    AgentSessionEntrySchema.extend(STAMP_FIELDS),
    RunStoppedEntrySchema.extend(STAMP_FIELDS),
    LimitWaitStartedEntrySchema.extend(STAMP_FIELDS),
    LimitWaitEndedEntrySchema.extend(STAMP_FIELDS),
    UsageRecordedEntrySchema.extend(STAMP_FIELDS),
    WorktreesRemovedEntrySchema.extend(STAMP_FIELDS),
])

export type JournalRecord = z.infer<typeof JournalRecordSchema>

/** Every record kind the journal knows so far. */
export const JournalKindSchema = z.enum([
    'run_started',
    'intake_read',
    'intake_refused',
    'nothing_to_do',
    'spec_snapshot',
    'ticket_snapshot',
    'run_branch_created',
    'ticket_worktree_created',
    'baseline_tests',
    'agent_started',
    'agent_finished',
    'agent_failed',
    'red_check',
    'leftover_scan',
    'commit_made',
    'worktree_reset',
    'dependencies_installed',
    'gates_run',
    'ticket_joined',
    'ticket_rebased',
    'run_branch_pushed',
    'ticket_stuck',
    'pull_request_opened',
    'jev_asked',
    'jev_answered',
    'jev_failed',
    'agent_session',
    'run_stopped',
    'limit_wait_started',
    'limit_wait_ended',
    'usage_recorded',
    'worktrees_removed',
])

export type JournalKind = z.infer<typeof JournalKindSchema>

export const JOURNAL_KINDS = JournalKindSchema.options
