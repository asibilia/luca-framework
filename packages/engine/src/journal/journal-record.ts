import { z } from 'zod'

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

/** An agent's turn failed, or its result did not fit its role's schema. */
const AgentFailedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_failed'),
    content: z.object({
        role: AgentRoleSchema,
        error: z.string(),
        ...SESSION_FIELDS,
    }),
})

const RedCheckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('red_check'),
    content: RedCheckResultSchema.extend({ tests: TestRunSchema }),
})

/** The two commits the engine makes on a ticket: tests first, then code. */
export const CommitStageSchema = z.enum(['red', 'green'])

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

/** Where the gates ran: a ticket's worktree, or the run branch after a join. */
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

/**
 * What a caller hands the journal to append: a kind, its content, and who it
 * is about. The journal adds `seq` and `time`.
 *
 * Later tickets add kinds here (fix rounds, findings, replies, ...).
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
    GatesRunEntrySchema,
    TicketJoinedEntrySchema,
    RunBranchPushedEntrySchema,
    TicketStuckEntrySchema,
    PullRequestOpenedEntrySchema,
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
    GatesRunEntrySchema.extend(STAMP_FIELDS),
    TicketJoinedEntrySchema.extend(STAMP_FIELDS),
    RunBranchPushedEntrySchema.extend(STAMP_FIELDS),
    TicketStuckEntrySchema.extend(STAMP_FIELDS),
    PullRequestOpenedEntrySchema.extend(STAMP_FIELDS),
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
    'gates_run',
    'ticket_joined',
    'run_branch_pushed',
    'ticket_stuck',
    'pull_request_opened',
])

export type JournalKind = z.infer<typeof JournalKindSchema>

export const JOURNAL_KINDS = JournalKindSchema.options
