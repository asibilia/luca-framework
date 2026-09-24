import { z } from 'zod'

/**
 * The board's vocabulary: every journal kind the board reads, and the few
 * fields it reads from each. Schemas are loose on purpose, so the engine can
 * add fields without breaking the board, and the plugin never needs the
 * engine's code. A record whose content doesn't fit is skipped and logged.
 */

const FindingCountsSchema = z.looseObject({
    blocker: z.number().int().min(0).catch(0),
    should_fix: z.number().int().min(0).catch(0),
    nit: z.number().int().min(0).catch(0),
})

const FindingListSchema = z.array(
    z.looseObject({
        id: z.string().catch(''),
        severity: z.enum(['blocker', 'should_fix', 'nit']),
    })
)

/** A re-reviewer's ruling on a fixer's "won't fix" of a review finding. */
const RulingListSchema = z
    .array(
        z.looseObject({
            finding_id: z.string(),
            ruling: z.enum(['accepted', 'rejected']),
            reason: z.string().catch(''),
        })
    )
    .catch([])

/** A review fixer's answer to each finding: `fixed` or `wont_fix`. */
const FindingResponseListSchema = z
    .array(
        z.looseObject({
            finding_id: z.string(),
            response: z.enum(['fixed', 'wont_fix']),
            reason: z.string().catch(''),
        })
    )
    .catch([])

const TestRunSchema = z.looseObject({
    cases: z.array(z.looseObject({ status: z.string() })),
})

const WorktreeSchema = z.looseObject({ branch: z.string() })

const tokenCount = z.number().min(0).catch(0)

/** One plan window's reading: `utilization` 0 to 1, `resetsAt` in seconds. */
const WindowReadingSchema = z.looseObject({
    utilization: z.number().optional().catch(undefined),
    resetsAt: z.number().optional().catch(undefined),
})

/**
 * One `rate_limit_event`'s info, as the Claude Agent SDK sends it:
 * `utilization` is 0 to 1, `resetsAt` is in seconds since the epoch. Real
 * readings carry no top-level `utilization`; each window's is in
 * `unifiedWindows`, keyed by window name (`five_hour`, `seven_day`, ...).
 */
const RateLimitReadingSchema = z.looseObject({
    rateLimitType: z.string().optional().catch(undefined),
    utilization: z.number().optional().catch(undefined),
    resetsAt: z.number().optional().catch(undefined),
    unifiedWindows: z
        .record(z.string(), WindowReadingSchema.catch({}))
        .optional()
        .catch(undefined),
})

/** The launcher's summary of an agent's session: tokens and readings. */
const AgentSessionSchema = z.looseObject({
    usage: z
        .looseObject({
            input_tokens: tokenCount,
            output_tokens: tokenCount,
            cache_read_input_tokens: tokenCount,
            cache_creation_input_tokens: tokenCount,
        })
        .catch({
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        }),
    rate_limit_events: z.array(RateLimitReadingSchema).catch([]),
})

const JevJobSchema = z.looseObject({ job: z.string() })

export const BOARD_VOCABULARY = {
    run_started: z.looseObject({ spec_number: z.number().int() }),
    intake_read: z.looseObject({
        spec: z.looseObject({ number: z.number(), title: z.string() }),
    }),
    intake_refused: z.looseObject({
        problems: z.array(
            z.looseObject({
                ticket: z.number().nullable(),
                missing: z.array(z.string()),
            })
        ),
    }),
    nothing_to_do: z.looseObject({}),
    spec_snapshot: z.looseObject({
        spec: z.looseObject({ number: z.number(), title: z.string() }),
        ticket_order: z.array(z.number()).catch([]),
    }),
    ticket_snapshot: z.looseObject({
        number: z.number().int(),
        title: z.string(),
        labels: z.array(z.string()).catch([]),
        blockers: z.array(z.number().int()).catch([]),
    }),
    run_branch_created: WorktreeSchema,
    ticket_worktree_created: WorktreeSchema,
    baseline_tests: TestRunSchema,
    /** Another ticket's baseline, taken from the same run-branch commit (#404). */
    baseline_reused: z.looseObject({ from_ticket: z.number().int() }),
    agent_started: z.looseObject({
        role: z.string(),
        /** The session a fix-loop or failed-try follow-up went to. */
        follow_up_of: z.string().nullable().catch(null),
    }),
    agent_finished: z.looseObject({
        role: z.string(),
        result: z
            .looseObject({
                outcome: z.string().optional(),
                verdict: z.string().optional(),
                findings: FindingListSchema.optional(),
                /** The ticket-reviewer's rulings on declined findings. */
                rulings: RulingListSchema,
                /** A review fixer's answer to each finding it got. */
                finding_responses: FindingResponseListSchema,
                /** The learner's proposed memories (#370). */
                memories: z.array(z.unknown()).catch([]).optional(),
                /** The shown memories the learner said helped. */
                helped: z.array(z.string()).catch([]).optional(),
            })
            .catch({ rulings: [], finding_responses: [] }),
    }),
    agent_failed: z.looseObject({
        role: z.string(),
        error: z.string(),
        /** `agent`, `result`, `guard`, or `engine`. */
        failure: z.string().catch('agent'),
    }),
    agent_session: z.looseObject({
        role: z.string(),
        session: AgentSessionSchema,
    }),
    run_stopped: z.looseObject({
        reason: z.string(),
        role: z.string().nullable().catch(null),
        /** A billing stop: the session would bill per token. */
        billing: z.boolean().catch(false),
        /** A stop after the same step crashed again and again. */
        crashed: z.boolean().catch(false),
    }),
    worktree_reset: z.looseObject({}),
    /** The engine's install in a new worktree; `check` is null with no manifest. */
    dependencies_installed: z.looseObject({
        target: z.string(),
        check: z
            .looseObject({ command: z.string(), ok: z.boolean() })
            .nullable(),
    }),
    red_check: z.looseObject({
        ok: z.boolean(),
        problems: z.array(z.string()).catch([]),
        tests: TestRunSchema.optional(),
    }),
    leftover_scan: z.looseObject({
        /** `red`, `green`, or `fix` (a review fix round). */
        stage: z.string(),
        hits: z.array(z.looseObject({ path: z.string() })),
    }),
    /** `stage` is `red`, `green`, or `fix` (a review fix round). */
    commit_made: z.looseObject({ stage: z.string() }),
    gates_run: z.looseObject({
        target: z.string(),
        ok: z.boolean(),
        checks: z.array(z.looseObject({ name: z.string(), ok: z.boolean() })),
    }),
    ticket_joined: z.looseObject({
        ok: z.boolean(),
        error: z.string().optional(),
    }),
    /** A joined ticket sent back to be fixed on top of the run branch. */
    ticket_rebased: z.looseObject({
        /** `clash` or `join_gates`. */
        cause: z.string(),
        tests: z.array(z.string()).catch([]),
        code: z.array(z.string()).catch([]),
    }),
    run_branch_pushed: z.looseObject({ branch: z.string() }),
    ticket_stuck: z.looseObject({
        reason: z.string(),
        detail: z.string().catch(''),
    }),
    pull_request_opened: z.looseObject({
        number: z.number().int(),
        url: z.string(),
    }),
    /** The run's worktrees, removed at its end. Nothing visible changes. */
    worktrees_removed: z.looseObject({
        paths: z.array(z.string()).catch([]),
    }),
    // Jev in shadow mode: counted, never acted on.
    jev_asked: JevJobSchema,
    jev_answered: JevJobSchema,
    jev_failed: JevJobSchema,
    // Agent messages: sent inside an agent's turn, so they move nothing.
    agent_message: z.looseObject({
        from: z.string(),
        to: z.string(),
        text: z.string(),
        status: z.enum(['queued', 'not_delivered', 'refused']),
        reason: z.string().nullable().catch(null),
    }),
    agent_message_delivered: z.looseObject({
        ids: z.array(z.string()).catch([]),
    }),
    /** Another process changed the shared `.git` during an agent's turn. */
    shared_git_changed: z.looseObject({
        role: z.string().catch(''),
        changes: z.array(z.string()).catch([]),
    }),
    limit_wait_started: z.looseObject({
        /** When the limit resets; `null` when not known. */
        resets_at: z.string().nullable().catch(null),
        /** When the engine wakes; always set by the engine. */
        until: z.string().nullable().catch(null),
        /** The window that was hit: `five_hour`, `seven_day`, ... */
        rate_limit_type: z.string().nullable().catch(null),
    }),
    limit_wait_ended: z.looseObject({}),
    /** How much of the plan a ticket (scope `ticket`) or the run used. */
    usage_recorded: z.looseObject({
        scope: z.enum(['ticket', 'run']),
        ticket: z.number().int().nullable().catch(null),
        /** Percents 0 to 100 per window, before and after, and the difference. */
        windows: z
            .record(z.string(), z.looseObject({ used: z.number() }))
            .catch({}),
    }),

    /** The owner's reply on the spec issue, read by the engine (#366). */
    reply_received: z.looseObject({
        /** `ship` is only for a stuck final review. */
        word: z.enum(['retry', 'skip', 'stop', 'ship']),
        ticket: z.number().int().nullable().optional(),
    }),
    /** A reply the engine couldn't use; it answered why on the spec issue. */
    reply_ignored: z.looseObject({
        /** `no_ticket_named`, `not_stuck`, `nothing_stuck`, `ship_needs_final_review`, ... */
        reason: z.string(),
    }),
    /** How the engine took a `retry` for a stuck ticket. */
    ticket_retried: z.looseObject({
        /** `resume`, `restart` (the ticket was edited), or `refused`. */
        mode: z.enum(['resume', 'restart', 'refused']),
        /** Why the edited ticket isn't ready to build, for `refused`. */
        problems: z.array(z.string()).catch([]),
    }),
    /** `because`: `null` when the owner skipped it, else the skipped ticket it waits on. */
    ticket_skipped: z.looseObject({
        because: z.number().int().nullable().catch(null),
    }),

    // The final review (#367). Its agent, gate, scan, commit, and push
    // records are the usual kinds with `ticket: null`.
    final_review_started: z.looseObject({}),
    lens_started: z.looseObject({ lens: z.string() }),
    lens_finished: z.looseObject({
        lens: z.string(),
        findings: FindingCountsSchema,
    }),
    final_review_fixing: z.looseObject({ round: z.number().int().min(0) }),
    final_review_stuck: z.looseObject({
        reason: z.string(),
        detail: z.string().catch(''),
    }),
    final_review_passed: z.looseObject({}),
    /** A `ship` reply to the stuck final review: the PR opens anyway. */
    final_review_shipped: z.looseObject({}),

    // Memory (#370): counted, and its learner shown. The learner's agent
    // records are the usual kinds with `ticket: null` and role `learner`.
    /** A search at a recall point: each vault's outcome, and what it showed. */
    memory_recalled: z.looseObject({
        /** `run_start`, `ticket`, `review`, or `fix_round`. */
        point: z.string(),
        vaults: z
            .array(
                z.looseObject({
                    vault: z.string(),
                    ok: z.boolean(),
                    error: z.string().nullable().catch(null),
                })
            )
            .catch([]),
        memories: z.array(z.unknown()).catch([]),
    }),
    /** The learner's memories saved, refused, or failed. */
    memories_saved: z.looseObject({
        saves: z
            .array(
                z.looseObject({
                    /** `added`, `updated`, `refused`, or `failed`. */
                    outcome: z.string(),
                })
            )
            .catch([]),
    }),
    /** The engine gave up on the learner; the run ends without it. */
    learning_skipped: z.looseObject({ reason: z.string().catch('') }),
    /** With no PR, the new memories went on the spec issue. */
    memories_reported: z.looseObject({ count: z.number().int().catch(0) }),

    // The scheduler's steps (#403): what the engine is doing right now.
    /**
     * A step began. `key` is the scheduler's key (a ticket's number, `run`,
     * `final`, `lens:<lens>`, ...); `step` its action type, plus `:<role>`
     * for an agent's turn.
     */
    step_started: z.looseObject({ key: z.string(), step: z.string() }),
    /** The step on `key` settled. */
    step_ended: z.looseObject({ key: z.string(), step: z.string() }),
} as const

export type BoardKind = keyof typeof BOARD_VOCABULARY

/** The kinds the board understands. */
export const BOARD_KINDS = Object.keys(BOARD_VOCABULARY)

const entry = <Kind extends BoardKind>({ kind }: { kind: Kind }) =>
    z.object({ kind: z.literal(kind), content: BOARD_VOCABULARY[kind] })

const BoardEntrySchema = z.discriminatedUnion('kind', [
    entry({ kind: 'run_started' }),
    entry({ kind: 'intake_read' }),
    entry({ kind: 'intake_refused' }),
    entry({ kind: 'nothing_to_do' }),
    entry({ kind: 'spec_snapshot' }),
    entry({ kind: 'ticket_snapshot' }),
    entry({ kind: 'run_branch_created' }),
    entry({ kind: 'ticket_worktree_created' }),
    entry({ kind: 'baseline_tests' }),
    entry({ kind: 'baseline_reused' }),
    entry({ kind: 'agent_started' }),
    entry({ kind: 'agent_finished' }),
    entry({ kind: 'agent_failed' }),
    entry({ kind: 'agent_session' }),
    entry({ kind: 'run_stopped' }),
    entry({ kind: 'worktree_reset' }),
    entry({ kind: 'dependencies_installed' }),
    entry({ kind: 'red_check' }),
    entry({ kind: 'leftover_scan' }),
    entry({ kind: 'commit_made' }),
    entry({ kind: 'gates_run' }),
    entry({ kind: 'ticket_joined' }),
    entry({ kind: 'ticket_rebased' }),
    entry({ kind: 'run_branch_pushed' }),
    entry({ kind: 'ticket_stuck' }),
    entry({ kind: 'pull_request_opened' }),
    entry({ kind: 'worktrees_removed' }),
    entry({ kind: 'jev_asked' }),
    entry({ kind: 'jev_answered' }),
    entry({ kind: 'jev_failed' }),
    entry({ kind: 'agent_message' }),
    entry({ kind: 'agent_message_delivered' }),
    entry({ kind: 'shared_git_changed' }),
    entry({ kind: 'limit_wait_started' }),
    entry({ kind: 'limit_wait_ended' }),
    entry({ kind: 'usage_recorded' }),
    entry({ kind: 'reply_received' }),
    entry({ kind: 'reply_ignored' }),
    entry({ kind: 'ticket_retried' }),
    entry({ kind: 'ticket_skipped' }),
    entry({ kind: 'final_review_started' }),
    entry({ kind: 'lens_started' }),
    entry({ kind: 'lens_finished' }),
    entry({ kind: 'final_review_fixing' }),
    entry({ kind: 'final_review_stuck' }),
    entry({ kind: 'final_review_passed' }),
    entry({ kind: 'final_review_shipped' }),
    entry({ kind: 'memory_recalled' }),
    entry({ kind: 'memories_saved' }),
    entry({ kind: 'learning_skipped' }),
    entry({ kind: 'memories_reported' }),
    entry({ kind: 'step_started' }),
    entry({ kind: 'step_ended' }),
])

/** A record the board understands, with its content parsed. */
export type BoardRecord = z.infer<typeof BoardEntrySchema> & {
    seq: number
    time: string
    ticket: number | null
    role: string | null
}

/**
 * Reads one journal record with the board's vocabulary. Never throws.
 *
 * @returns `known` with the parsed record, `unknown_kind` for kinds the board
 *   doesn't read, or `bad_content` with the reason when the content doesn't fit.
 *
 * @example
 * const read = readRecord({ record })
 * if (read.status === 'known') apply(read.record)
 */
export const readRecord = ({
    record,
}: {
    record: {
        kind: string
        seq: number
        time: string
        ticket: number | null
        role: string | null
        content: unknown
    }
}):
    | { status: 'known'; record: BoardRecord }
    | { status: 'unknown_kind' }
    | { status: 'bad_content'; error: string } => {
    if (!BOARD_KINDS.includes(record.kind)) return { status: 'unknown_kind' }
    const parsed = BoardEntrySchema.safeParse({
        kind: record.kind,
        content: record.content,
    })
    if (!parsed.success) {
        return { status: 'bad_content', error: z.prettifyError(parsed.error) }
    }
    const { seq, time, ticket, role } = record
    return {
        status: 'known',
        record: { ...parsed.data, seq, time, ticket, role },
    }
}
