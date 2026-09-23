import { z } from 'zod'

/**
 * The board's vocabulary: every journal kind the board reads, and the few
 * fields it reads from each. Schemas are loose on purpose, so the engine can
 * add fields without breaking the board, and the plugin never needs the
 * engine's code. A record whose content doesn't fit is skipped and logged.
 *
 * Kinds marked "later" aren't journaled yet; the tickets that add them
 * (#363 fix loops, #364 reviews, #366 limit waits and replies, #367/#368 the
 * final review) should journal these shapes. See the README.
 */

const FindingCountsSchema = z.looseObject({
    blocker: z.number().int().min(0).catch(0),
    should_fix: z.number().int().min(0).catch(0),
    nit: z.number().int().min(0).catch(0),
})

const FindingListSchema = z.array(
    z.looseObject({ severity: z.enum(['blocker', 'should_fix', 'nit']) })
)

const TestRunSchema = z.looseObject({
    cases: z.array(z.looseObject({ status: z.string() })),
})

const WorktreeSchema = z.looseObject({ branch: z.string() })

/** Token counts are loose: any of these shapes is read. */
const TokenUsageSchema = z.looseObject({
    total_tokens: z.number().optional(),
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
})

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
    agent_started: z.looseObject({ role: z.string() }),
    agent_finished: z.looseObject({
        role: z.string(),
        result: z
            .looseObject({
                outcome: z.string().optional(),
                verdict: z.string().optional(),
                findings: FindingListSchema.optional(),
            })
            .catch({}),
        usage: TokenUsageSchema.optional(),
        total_tokens: z.number().optional(),
    }),
    agent_failed: z.looseObject({ role: z.string(), error: z.string() }),
    red_check: z.looseObject({
        ok: z.boolean(),
        problems: z.array(z.string()).catch([]),
        tests: TestRunSchema.optional(),
    }),
    leftover_scan: z.looseObject({
        stage: z.string(),
        hits: z.array(z.looseObject({ path: z.string() })),
    }),
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
    run_branch_pushed: z.looseObject({ branch: z.string() }),
    ticket_stuck: z.looseObject({
        reason: z.string(),
        detail: z.string().catch(''),
    }),
    pull_request_opened: z.looseObject({
        number: z.number().int(),
        url: z.string(),
    }),

    // Later kinds.
    usage_reading: z.looseObject({
        five_hour_percent: z.number(),
        weekly_percent: z.number(),
        resets_at: z.string().nullable().optional(),
    }),
    limit_wait_started: z.looseObject({
        resets_at: z.string().nullable().optional(),
    }),
    limit_wait_ended: z.looseObject({}),
    fix_round: z.looseObject({
        loop: z.enum(['red_check', 'gates', 'review']),
        round: z.number().int().min(0),
    }),
    review_finished: z.looseObject({
        round: z.number().int().min(0),
        findings: FindingCountsSchema,
    }),
    reply_received: z.looseObject({
        word: z.enum(['retry', 'skip', 'stop', 'ship']),
        ticket: z.number().int().nullable().optional(),
    }),
    ticket_skipped: z.looseObject({}),
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
} as const

export type BoardKind = keyof typeof BOARD_VOCABULARY

/** The kinds the board understands, today's and later ones. */
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
    entry({ kind: 'agent_started' }),
    entry({ kind: 'agent_finished' }),
    entry({ kind: 'agent_failed' }),
    entry({ kind: 'red_check' }),
    entry({ kind: 'leftover_scan' }),
    entry({ kind: 'commit_made' }),
    entry({ kind: 'gates_run' }),
    entry({ kind: 'ticket_joined' }),
    entry({ kind: 'run_branch_pushed' }),
    entry({ kind: 'ticket_stuck' }),
    entry({ kind: 'pull_request_opened' }),
    entry({ kind: 'usage_reading' }),
    entry({ kind: 'limit_wait_started' }),
    entry({ kind: 'limit_wait_ended' }),
    entry({ kind: 'fix_round' }),
    entry({ kind: 'review_finished' }),
    entry({ kind: 'reply_received' }),
    entry({ kind: 'ticket_skipped' }),
    entry({ kind: 'final_review_started' }),
    entry({ kind: 'lens_started' }),
    entry({ kind: 'lens_finished' }),
    entry({ kind: 'final_review_fixing' }),
    entry({ kind: 'final_review_stuck' }),
    entry({ kind: 'final_review_passed' }),
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
