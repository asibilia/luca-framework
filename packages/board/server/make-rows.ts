import type { BoardRecord } from './board-vocabulary'
import { describeRecord } from './describe-record'
import { SHIPPED_TEXT } from './record-texts'

import {
    ROW_KIND,
    type BoardRow,
    type EventRow,
    type LimitRow,
    type RunRow,
} from '../shared/board-rows'
import {
    LOOP_CAP,
    TicketStageSchema,
    showsFinalReview,
    type BoardState,
    type NeedsYou,
    type Usage,
} from '../shared/board-state'

export { describeRecord } from './describe-record'

/**
 * The row-maker: pure functions that turn a record and the board before and
 * after it into chat rows. Every row id starts with the run id, so two runs
 * in one chat never share a row. What one record means in words is
 * `describeRecord`'s (describe-record.ts).
 */

/** The header row's id: re-appended with new data to update it in place. */
export const runRowId = ({ run_id }: { run_id: string }): string =>
    `${run_id}-run`

const eventRowId = ({ run_id, seq }: { run_id: string; seq: number }) =>
    `${run_id}-e${seq}`

const stuckRowId = ({ run_id, item }: { run_id: string; item: NeedsYou }) =>
    `${run_id}-stuck-${item.ticket ?? 'final'}`

const limitRowId = ({ run_id }: { run_id: string }) => `${run_id}-limit`

const usageLine = ({ usage }: { usage: Usage | null }) =>
    usage
        ? {
              five_hour_percent: usage.five_hour_percent,
              weekly_percent: usage.weekly_percent,
              five_hour_level: usage.five_hour_level,
              weekly_level: usage.weekly_level,
          }
        : null

/** The final review's state in words, for the header row. */
export const finalReviewText = ({ state }: { state: BoardState }): string => {
    if (!showsFinalReview({ state })) return 'none, nothing to review'
    const review = state.final_review
    const clean = review.lenses.filter((lens) => lens.state === 'clean').length
    switch (review.state) {
        case 'waiting':
            return review.active
                ? 'about to start'
                : 'starts when every ticket is done or skipped'
        case 'reviewing':
            return `round ${review.round}: ${clean} of ${review.lenses.length} lenses clean`
        case 'fixing':
            return `fix round ${review.fix_round}/${LOOP_CAP} on the findings`
        case 'stuck':
            return 'stuck, waits for your reply'
        case 'passed':
            return 'passed'
    }
}

/**
 * The run's header row: status, ticket counts, final review, and usage.
 *
 * @example
 * const row = headerRow({ state, updated_at: new Date().toISOString() })
 */
export const headerRow = ({
    state,
    updated_at,
}: {
    state: BoardState
    updated_at: string
}): BoardRow => {
    const { run } = state
    const data: RunRow = {
        run_id: run.run_id,
        spec_number: run.spec_number,
        spec_title: run.spec_title,
        demo: run.demo,
        status: run.status,
        counts: TicketStageSchema.options
            .map((stage) => ({
                stage,
                count: state.tickets.filter((ticket) => ticket.stage === stage)
                    .length,
            }))
            .filter((entry) => entry.count > 0),
        final_review: finalReviewText({ state }),
        usage: usageLine({ usage: state.usage }),
        usage_label: state.usage_label,
        limit_wait: state.limit_wait !== null,
        current_steps: [
            ...state.tickets.flatMap(({ number, current_step }) =>
                current_step ? [{ ticket: number, ...current_step }] : []
            ),
            ...state.run_steps.map(({ text, since }) => ({
                ticket: null,
                text,
                since,
            })),
        ],
        needs_you: state.needs_you.length,
        pr_url: run.pr_url,
        engine_ended: run.engine_ended,
        log_path: run.log_path,
        updated_at,
    }
    return { id: runRowId({ run_id: run.run_id }), kind: ROW_KIND.run, data }
}

const resolutionText = ({ record }: { record: BoardRecord }): string => {
    switch (record.kind) {
        case 'reply_received': {
            const ticket = record.content.ticket ?? record.ticket
            return `You replied \`${record.content.word}${ticket === null ? '' : ` #${ticket}`}\`.`
        }
        case 'ticket_skipped':
            return 'Skipped. It stays open for a later run.'
        case 'final_review_passed':
            return 'The final review passed.'
        case 'final_review_shipped':
            return SHIPPED_TEXT
        default:
            return 'Resolved.'
    }
}

const sameItem = ({ left, right }: { left: NeedsYou; right: NeedsYou }) =>
    JSON.stringify(left) === JSON.stringify(right)

/**
 * The chat rows one record adds or updates: an event row for a meaningful
 * record, stuck rows that appear or resolve, and the limit-wait row.
 *
 * @example
 * const rows = rowsForRecord({ run_id, before, after, record })
 */
export const rowsForRecord = ({
    run_id,
    before,
    after,
    record,
}: {
    run_id: string
    before: BoardState
    after: BoardState
    record: BoardRecord
}): BoardRow[] => {
    const rows: BoardRow[] = []
    const described = describeRecord({ before, after, record })
    if (described) {
        const data: EventRow = {
            time: record.time,
            ticket: record.ticket,
            ...described,
        }
        rows.push({
            id: eventRowId({ run_id, seq: record.seq }),
            kind: ROW_KIND.event,
            data,
        })
    }

    for (const item of after.needs_you) {
        const previous = before.needs_you.find(
            (entry) => entry.key === item.key
        )
        if (previous && sameItem({ left: previous, right: item })) continue
        rows.push({
            id: stuckRowId({ run_id, item }),
            kind: ROW_KIND.stuck,
            data: {
                status: 'waiting',
                run_id,
                key: item.key,
                ticket: item.ticket,
                since: item.since,
                subject: item.subject,
                spec_number: after.run.spec_number,
                reason: item.reason,
                detail: item.detail,
                tried: item.tried,
                replies: item.replies,
                resolution: null,
            },
        })
    }
    for (const item of before.needs_you) {
        if (after.needs_you.some((entry) => entry.key === item.key)) continue
        rows.push({
            id: stuckRowId({ run_id, item }),
            kind: ROW_KIND.stuck,
            data: {
                status: 'resolved',
                run_id,
                key: item.key,
                ticket: item.ticket,
                since: item.since,
                subject: item.subject,
                spec_number: after.run.spec_number,
                reason: item.reason,
                detail: item.detail,
                tried: item.tried,
                replies: item.replies,
                resolution: resolutionText({ record }),
            },
        })
    }

    if (after.limit_wait && !before.limit_wait) {
        const data: LimitRow = {
            status: 'waiting',
            resets_at: after.limit_wait.resets_at,
            window: after.limit_wait.window,
            usage: usageLine({ usage: after.usage }),
        }
        rows.push({ id: limitRowId({ run_id }), kind: ROW_KIND.limit, data })
    }
    if (before.limit_wait && !after.limit_wait) {
        const data: LimitRow = {
            status: 'over',
            resets_at: before.limit_wait.resets_at,
            window: before.limit_wait.window,
            usage: usageLine({ usage: after.usage }),
        }
        rows.push({ id: limitRowId({ run_id }), kind: ROW_KIND.limit, data })
    }
    return rows
}
