import { z } from 'zod'

import { ENGINE_VOCABULARY } from './board-vocabulary-engine'
import { REVIEW_VOCABULARY } from './board-vocabulary-review'
import { RUN_VOCABULARY } from './board-vocabulary-run'

export type { LeftOutList } from './board-vocabulary-shapes'

/**
 * The board's vocabulary: every journal kind the board reads, and the few
 * fields it reads from each. Schemas are loose on purpose, so the engine can
 * add fields without breaking the board, and the plugin never needs the
 * engine's code. A record whose content doesn't fit is skipped and logged.
 *
 * The kinds are in three modules (`board-vocabulary-run.ts`,
 * `board-vocabulary-engine.ts`, `board-vocabulary-review.ts`) and the pieces
 * they share in `board-vocabulary-shapes.ts`.
 */
export const BOARD_VOCABULARY = {
    ...RUN_VOCABULARY,
    ...ENGINE_VOCABULARY,
    ...REVIEW_VOCABULARY,
} as const

export type BoardKind = keyof typeof BOARD_VOCABULARY

/** The kinds the board understands. */
export const BOARD_KINDS = Object.keys(BOARD_VOCABULARY)

const entry = <Kind extends BoardKind>({ kind }: { kind: Kind }) =>
    z.object({ kind: z.literal(kind), content: BOARD_VOCABULARY[kind] })

const BoardEntrySchema = z.discriminatedUnion('kind', [
    entry({ kind: 'run_started' }),
    entry({ kind: 'engine_resumed' }),
    entry({ kind: 'config_reloaded' }),
    entry({ kind: 'config_reload_refused' }),
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
    entry({ kind: 'tests_sent_back' }),
    entry({ kind: 'run_branch_pushed' }),
    entry({ kind: 'ticket_stuck' }),
    entry({ kind: 'run_stuck' }),
    entry({ kind: 'pull_request_opened' }),
    entry({ kind: 'worktrees_removed' }),
    entry({ kind: 'jev_asked' }),
    entry({ kind: 'jev_answered' }),
    entry({ kind: 'jev_failed' }),
    entry({ kind: 'decision_model_off' }),
    entry({ kind: 'agent_message' }),
    entry({ kind: 'agent_message_delivered' }),
    entry({ kind: 'shared_git_changed' }),
    entry({ kind: 'limit_wait_started' }),
    entry({ kind: 'limit_wait_ended' }),
    entry({ kind: 'usage_line_wait_started' }),
    entry({ kind: 'usage_line_wait_ended' }),
    entry({ kind: 'usage_recorded' }),
    entry({ kind: 'reply_received' }),
    entry({ kind: 'reply_ignored' }),
    entry({ kind: 'ticket_retried' }),
    entry({ kind: 'ticket_skipped' }),
    entry({ kind: 'ticket_already_done' }),
    entry({ kind: 'ticket_closed' }),
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
    entry({ kind: 'ticket_waiting' }),
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
