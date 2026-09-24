import { z } from 'zod'

import { AgentSessionSchema } from '../agents/agent-launcher'
import {
    AgentRoleSchema,
    LensNameSchema,
    RoleResultSchema,
} from '../agents/role-results'
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
import {
    MemoryFeedbackSchema,
    MemorySaveSchema,
    RecalledMemorySchema,
    RecallPointSchema,
    VaultSearchSchema,
} from '../memory/memory-schemas'

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
        /**
         * Memory for this run (#370): on, with the project's vault (`null`
         * searches only `default`), or `null` for off. Off leaves the run
         * exactly as it was before memory.
         */
        memory: z
            .object({ project_vault: z.string().min(1).nullable() })
            .nullable()
            .default(null),
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

/**
 * An agent finished with a result that fits its role's schema. One option
 * per role: keep it in step with `RoleResultSchema` (a test checks every
 * role parses).
 */
const AgentFinishedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_finished'),
    content: z.discriminatedUnion('role', [
        RoleResultSchema.options[0].extend(SESSION_FIELDS),
        RoleResultSchema.options[1].extend(SESSION_FIELDS),
        RoleResultSchema.options[2].extend(SESSION_FIELDS),
        RoleResultSchema.options[3].extend(SESSION_FIELDS),
        RoleResultSchema.options[4].extend(SESSION_FIELDS),
        RoleResultSchema.options[5].extend(SESSION_FIELDS),
        RoleResultSchema.options[6].extend(SESSION_FIELDS),
        RoleResultSchema.options[7].extend(SESSION_FIELDS),
        RoleResultSchema.options[8].extend(SESSION_FIELDS),
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
        /**
         * The same step was cut off by a crash `MAX_CRASHES` times in a row
         * on a run-level key: like a billing stop, it sticks.
         */
        crashed: z.boolean().default(false),
    }),
})

/**
 * The scheduler is about to carry out one step: an action it started, other
 * than a wait. `key` is the scheduler's key for it (a ticket's number,
 * `final`, `lens:<lens>`, `replies`, or `run`), and `step` its action type,
 * plus `:<role>` for an agent's turn. `first_seq` is the `step_started` seq
 * of this step's first try when a crash cut off an earlier try of it, else
 * `null`. `ticket` is the action's ticket, and `role` the agent's role.
 */
const StepStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('step_started'),
    content: z.object({
        key: z.string().min(1),
        step: z.string().min(1),
        first_seq: z.number().int().min(1).nullable().default(null),
    }),
})

/**
 * The step under `key` settled: its own records are in the journal, so it
 * is a checkpoint. Not written when the step threw.
 */
const StepEndedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('step_ended'),
    content: z.object({
        key: z.string().min(1),
        step: z.string().min(1),
    }),
})

/** One step a crash cut off: its `step_started` had no `step_ended`. */
export const InterruptedStepSchema = z.object({
    key: z.string().min(1),
    step: z.string().min(1),
    ticket: z.number().int().positive().nullable(),
    role: z.string().nullable(),
    /** The seq of the cut-off step's `step_started`. */
    started_seq: z.number().int().min(1),
    /** That record's `first_seq`: the step's first try, if it was a redo. */
    first_seq: z.number().int().min(1).nullable(),
})

export type InterruptedStep = z.infer<typeof InterruptedStepSchema>

/**
 * A restarted engine found steps a crash cut off, journaled once before its
 * first step. Each is taken again, an agent's turn in a fresh session.
 */
const RunResumedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_resumed'),
    content: z.object({ interrupted: z.array(InterruptedStepSchema) }),
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
 * Why a ticket (or the final review) is stuck. A failed red check or gate is only stuck once its
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
    'setup_change_needed',
    'crashed',
])

export type StuckReason = z.infer<typeof StuckReasonSchema>

const TicketStuckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_stuck'),
    content: z.object({ reason: StuckReasonSchema, detail: z.string() }),
})

/**
 * The engine told the spec issue that a ticket (or, with `ticket: null`,
 * the final review) is stuck, in its comment `comment_id`, and now waits
 * for the spec owner's reply.
 */
const StuckReportedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('stuck_reported'),
    content: z.object({
        comment_id: z.number().int(),
        body: z.string(),
    }),
})

/**
 * A comment the engine read on the spec issue while it waited for a reply,
 * word for word, whoever wrote it. Only the spec owner's count as replies.
 */
const CommentReadEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('comment_read'),
    content: z.object({
        comment_id: z.number().int(),
        author: z.string(),
        body: z.string(),
    }),
})

/**
 * The one-word replies the spec owner can give to stuck work: `retry`,
 * `skip`, and `stop` for a ticket; `retry`, `stop`, and `ship` for the
 * final review.
 */
export const ReplyWordSchema = z.enum(['retry', 'skip', 'stop', 'ship'])

export type ReplyWord = z.infer<typeof ReplyWordSchema>

/**
 * The engine took the spec owner's reply: `retry` or `skip` for `ticket`,
 * `stop` for the whole run, or `retry` or `ship` for the stuck final review
 * (`ticket` is `null` for these).
 */
const ReplyReceivedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('reply_received'),
    content: z.object({
        word: ReplyWordSchema,
        ticket: z.number().int().positive().nullable(),
        comment_id: z.number().int(),
        author: z.string(),
    }),
})

/**
 * Why the spec owner's reply could not be used: it named no ticket while
 * more than one is stuck, named a ticket that isn't stuck, or was `ship`
 * (the final review's word) while no final review is stuck, or was `skip`
 * for the final review, which can't be skipped.
 */
export const ReplyProblemSchema = z.enum([
    'no_ticket_named',
    'not_stuck',
    'nothing_stuck',
    'ship_needs_final_review',
    'skip_not_for_final_review',
])

export type ReplyProblem = z.infer<typeof ReplyProblemSchema>

/**
 * The spec owner's reply could not be used; the engine said why on the spec
 * issue, in its comment `answer_id`.
 */
const ReplyIgnoredEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('reply_ignored'),
    content: z.object({
        comment_id: z.number().int(),
        reason: ReplyProblemSchema,
        answer_id: z.number().int().nullable(),
    }),
})

/**
 * How a `retry` went:
 * - `resume`: the ticket's text and labels are unchanged, so it picks up
 *   where it stopped, with a fresh agent and fresh counts, keeping any
 *   code the user changed in its worktree.
 * - `restart`: the ticket's text or labels changed, so its new copy (a
 *   `ticket_snapshot` just before) is built from scratch, in its worktree
 *   reset to the run branch's tip `base_sha`.
 * - `refused`: the changed ticket is not ready to build (`problems`); the
 *   engine said so on the spec issue (`answer_id`), and it stays stuck.
 */
const TicketRetriedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_retried'),
    content: z.object({
        mode: z.enum(['resume', 'restart', 'refused']),
        base_sha: z.string().nullable(),
        problems: z.array(z.string()),
        answer_id: z.number().int().nullable(),
    }),
})

/**
 * A ticket left out of the run: the stuck ticket the owner skipped
 * (`because` is `null`), or one that waits on a skipped ticket. It stays
 * open, with a comment saying why.
 */
const TicketSkippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_skipped'),
    content: z.object({
        because: z.number().int().positive().nullable(),
    }),
})

/**
 * The owner replied `retry` to the stuck final review: its open fix round
 * starts over as round 1 with fresh fixers and fresh counts, keeping any
 * edits the owner made in the run branch's worktree.
 */
const FinalReviewRetriedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_retried'),
    content: z.object({}),
})

/**
 * A stuck ticket's join was undone on the run branch (its commits were
 * never pushed), so no other ticket builds on them.
 */
const JoinUndoneEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('join_undone'),
    content: z.object({ shas: z.array(z.string()) }),
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
 * A final review round started: the run branch is reviewed from `from_sha`
 * (round 1: where the run branch started; later rounds: the previous
 * round's `head_sha`) to `head_sha`, its HEAD now. `lenses` are the lenses
 * due this round (every lens in round 1, then only those that had blocking
 * findings), `files` the files that diff changes, and `rules` the rule files
 * of the engine config, read by the engine word for word (`text` is `null`
 * for a file it could not read), for the rules lens. Written with
 * `ticket: null`.
 */
const FinalReviewStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_started'),
    content: z.object({
        round: z.number().int().min(1),
        from_sha: z.string().min(1),
        head_sha: z.string().min(1),
        lenses: z.array(LensNameSchema),
        files: z.array(z.string()).default([]),
        rules: z.array(
            z.object({ path: z.string(), text: z.string().nullable() })
        ),
    }),
})

/** A lens's reviewer is about to start, right before its `agent_started`. */
const LensStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('lens_started'),
    content: z.object({
        lens: LensNameSchema,
        round: z.number().int().min(1),
    }),
})

/**
 * A lens's reviewer finished, right after its `agent_finished`: its findings
 * counted by severity. Not written for a failed turn.
 */
const LensFinishedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('lens_finished'),
    content: z.object({
        lens: LensNameSchema,
        round: z.number().int().min(1),
        findings: z.object({
            blocker: z.number().int().min(0),
            should_fix: z.number().int().min(0),
            nit: z.number().int().min(0),
        }),
    }),
})

/** A final review fix round starts, before its first fixer. */
const FinalReviewFixingEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_fixing'),
    content: z.object({ round: z.number().int().min(1) }),
})

/** The final review is stuck: the PR waits for a person's reply (#366). */
const FinalReviewStuckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_stuck'),
    content: z.object({ reason: StuckReasonSchema, detail: z.string() }),
})

/** Every lens due in the latest round approved; the PR opens next. */
const FinalReviewPassedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_passed'),
    content: z.object({}),
})

/**
 * The person replied `ship` to the stuck final review: the PR opens with the
 * findings still open listed at the top. Appended by the reply reader (#366)
 * through `shipFinalReview`.
 */
const FinalReviewShippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('final_review_shipped'),
    content: z.object({}),
})

/**
 * The engine searched memory at a **recall point**: the vaults it searched
 * (each with how it went and how many it found), and the memories it will
 * show, merged by score, at most `MAX_MEMORIES_PER_RECALL`, each with its
 * vault and score. `key` names the moment (such as `ticket:11`), so each is
 * searched once. `ticket` is the ticket's, or `null` for the run's start
 * and the final review.
 */
const MemoryRecalledEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('memory_recalled'),
    content: z.object({
        point: RecallPointSchema,
        key: z.string().min(1),
        query: z.string(),
        vaults: z.array(VaultSearchSchema),
        memories: z.array(RecalledMemorySchema),
    }),
})

/**
 * The learner's proposed memories were saved (or refused, or failed), each
 * with its vault, what became of it, and the similar memory the engine
 * found first; then the helped / didn't-help feedback on each memory shown
 * in the run. Written once per run, with `ticket: null`.
 */
const MemoriesSavedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('memories_saved'),
    content: z.object({
        saves: z.array(MemorySaveSchema),
        feedback: z.array(MemoryFeedbackSchema),
    }),
})

/** The learner never gave a usable answer; the run ends without it. */
const LearningSkippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('learning_skipped'),
    content: z.object({ reason: z.string() }),
})

/**
 * With no PR to list them in, the new memories went on the spec issue in
 * the engine's comment `comment_id`.
 */
const MemoriesReportedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('memories_reported'),
    content: z.object({
        comment_id: z.number().int(),
        count: z.number().int().min(0),
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
 * What an agent message did when it was sent:
 * - `queued`: it waits for its recipients' next tool calls.
 * - `not_delivered`: nobody can get it (the receiver's ticket is over, or
 *   `all` found no one); it stays in the journal.
 * - `refused`: it broke a rule (a reviewer, a bad address, the cap).
 */
export const AgentMessageStatusSchema = z.enum([
    'queued',
    'not_delivered',
    'refused',
])

export type AgentMessageStatus = z.infer<typeof AgentMessageStatusSchema>

/**
 * One agent message, word for word, as it was sent. Addresses look like
 * `implementer#11`: a role and a ticket.
 */
export const AgentMessageSchema = z.object({
    /** `msg-<n>`: n is 1 + the earlier `agent_message` records in the journal. */
    id: z.string().min(1),
    /** The sender's address. */
    from: z.string(),
    /** What the sender asked for: an address, or `all`. */
    to: z.string(),
    text: z.string(),
    status: AgentMessageStatusSchema,
    /** The addresses it waits for; empty unless queued. */
    recipients: z.array(z.string()),
    /** Why it was refused or not delivered; `null` when queued. */
    reason: z.string().nullable(),
})

export type AgentMessage = z.infer<typeof AgentMessageSchema>

/** An agent sent a message. `ticket` and `role` are the sender's. */
const AgentMessageEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_message'),
    content: AgentMessageSchema,
})

/** Messages handed to their receiver at one tool call, word for word. */
export const AgentMessageDeliveredSchema = z.object({
    /** The receiver's address. */
    to: z.string(),
    /** The ids of the messages handed over together. */
    ids: z.array(z.string()),
    /** The tool call they rode on. */
    tool_name: z.string().nullable(),
    /** The additional context the agent got, word for word. */
    text: z.string(),
})

export type AgentMessageDelivered = z.infer<typeof AgentMessageDeliveredSchema>

/**
 * Agent messages reached their receiver. `ticket` and `role` are the
 * receiver's; the record's time is when it saw them.
 */
const AgentMessageDeliveredEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('agent_message_delivered'),
    content: AgentMessageDeliveredSchema,
})

/**
 * What a caller hands the journal to append: a kind, its content, and who it
 * is about. The journal adds `seq` and `time`.
 *
 * Later tickets add kinds here.
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
    AgentMessageEntrySchema,
    AgentMessageDeliveredEntrySchema,
    FinalReviewStartedEntrySchema,
    LensStartedEntrySchema,
    LensFinishedEntrySchema,
    FinalReviewFixingEntrySchema,
    FinalReviewStuckEntrySchema,
    FinalReviewPassedEntrySchema,
    FinalReviewShippedEntrySchema,
    StuckReportedEntrySchema,
    CommentReadEntrySchema,
    ReplyReceivedEntrySchema,
    ReplyIgnoredEntrySchema,
    TicketRetriedEntrySchema,
    TicketSkippedEntrySchema,
    JoinUndoneEntrySchema,
    FinalReviewRetriedEntrySchema,
    MemoryRecalledEntrySchema,
    MemoriesSavedEntrySchema,
    LearningSkippedEntrySchema,
    MemoriesReportedEntrySchema,
    StepStartedEntrySchema,
    StepEndedEntrySchema,
    RunResumedEntrySchema,
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
    AgentMessageEntrySchema.extend(STAMP_FIELDS),
    AgentMessageDeliveredEntrySchema.extend(STAMP_FIELDS),
    FinalReviewStartedEntrySchema.extend(STAMP_FIELDS),
    LensStartedEntrySchema.extend(STAMP_FIELDS),
    LensFinishedEntrySchema.extend(STAMP_FIELDS),
    FinalReviewFixingEntrySchema.extend(STAMP_FIELDS),
    FinalReviewStuckEntrySchema.extend(STAMP_FIELDS),
    FinalReviewPassedEntrySchema.extend(STAMP_FIELDS),
    FinalReviewShippedEntrySchema.extend(STAMP_FIELDS),
    StuckReportedEntrySchema.extend(STAMP_FIELDS),
    CommentReadEntrySchema.extend(STAMP_FIELDS),
    ReplyReceivedEntrySchema.extend(STAMP_FIELDS),
    ReplyIgnoredEntrySchema.extend(STAMP_FIELDS),
    TicketRetriedEntrySchema.extend(STAMP_FIELDS),
    TicketSkippedEntrySchema.extend(STAMP_FIELDS),
    JoinUndoneEntrySchema.extend(STAMP_FIELDS),
    FinalReviewRetriedEntrySchema.extend(STAMP_FIELDS),
    MemoryRecalledEntrySchema.extend(STAMP_FIELDS),
    MemoriesSavedEntrySchema.extend(STAMP_FIELDS),
    LearningSkippedEntrySchema.extend(STAMP_FIELDS),
    MemoriesReportedEntrySchema.extend(STAMP_FIELDS),
    StepStartedEntrySchema.extend(STAMP_FIELDS),
    StepEndedEntrySchema.extend(STAMP_FIELDS),
    RunResumedEntrySchema.extend(STAMP_FIELDS),
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
    'agent_message',
    'agent_message_delivered',
    'final_review_started',
    'lens_started',
    'lens_finished',
    'final_review_fixing',
    'final_review_stuck',
    'final_review_passed',
    'final_review_shipped',
    'stuck_reported',
    'comment_read',
    'reply_received',
    'reply_ignored',
    'ticket_retried',
    'ticket_skipped',
    'join_undone',
    'final_review_retried',
    'memory_recalled',
    'memories_saved',
    'learning_skipped',
    'memories_reported',
    'step_started',
    'step_ended',
    'run_resumed',
])

export type JournalKind = z.infer<typeof JournalKindSchema>

export const JOURNAL_KINDS = JournalKindSchema.options
