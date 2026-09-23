import {
    ROW_KIND,
    type BoardRow,
    type EventRow,
    type LimitRow,
    type RunRow,
    type Tone,
} from '../shared/board-rows'
import {
    LOOP_CAP,
    TicketStageSchema,
    type BoardState,
    type FindingCounts,
    type NeedsYou,
    type Usage,
} from '../shared/board-state'

import type { BoardRecord } from './board-vocabulary'
import { reasonText } from './reduce-board'

/**
 * The row-maker: pure functions that turn a record and the board before and
 * after it into chat rows. Every row id starts with the run id, so two runs
 * in one chat never share a row.
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

const findingsText = ({ findings }: { findings: FindingCounts }): string => {
    const parts = [
        findings.blocker > 0 ? `${findings.blocker} blocker` : null,
        findings.should_fix > 0 ? `${findings.should_fix} should-fix` : null,
        findings.nit > 0 ? `${findings.nit} nit` : null,
    ].filter((part) => part !== null)
    return parts.length > 0 ? parts.join(', ') : 'no findings'
}

/** The final review's state in words, for the header row. */
export const finalReviewText = ({ state }: { state: BoardState }): string => {
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
        limit_wait: state.limit_wait !== null,
        needs_you: state.needs_you.length,
        pr_url: run.pr_url,
        engine_ended: run.engine_ended,
        log_path: run.log_path,
        updated_at,
    }
    return { id: runRowId({ run_id: run.run_id }), kind: ROW_KIND.run, data }
}

const on = ({ ticket }: { ticket: number | null }): string =>
    ticket === null ? '' : `#${ticket}: `

const event = ({ text, tone }: { text: string; tone: Tone }) => ({ text, tone })

/**
 * What a record means in one line, or `null` for records that are noise in
 * a chat (snapshots, usage readings, a clean leftover scan, ...).
 */
export const describeRecord = ({
    after,
    record,
}: {
    after: BoardState
    record: BoardRecord
}): { text: string; tone: Tone } | null => {
    const at = on({ ticket: record.ticket })
    switch (record.kind) {
        case 'run_started':
            return event({
                text: `The run started on spec #${record.content.spec_number}.`,
                tone: 'info',
            })
        case 'intake_refused':
            return event({
                text: `Intake refused the run. ${after.run.refusal.join('; ')}`,
                tone: 'danger',
            })
        case 'nothing_to_do':
            return event({
                text: 'Nothing to do: the spec has no open tickets.',
                tone: 'info',
            })
        case 'spec_snapshot':
            return event({
                text: `Intake passed: spec #${record.content.spec.number}, ${record.content.ticket_order.length} tickets.`,
                tone: 'success',
            })
        case 'run_branch_created':
            return event({
                text: `The run branch ${record.content.branch} is ready.`,
                tone: 'info',
            })
        case 'ticket_worktree_created':
            return event({ text: `${at}started.`, tone: 'info' })
        case 'agent_started':
            return event({
                text: `${at}the ${record.content.role} started.`,
                tone: 'info',
            })
        case 'agent_finished':
            return finishedText({ record })
        case 'agent_failed':
            return event({
                text: `${at}the ${record.content.role} failed: ${record.content.error.split('\n')[0] ?? ''}`,
                tone: 'danger',
            })
        case 'red_check': {
            const failing = after.tickets.find(
                (ticket) => ticket.number === record.ticket
            )?.tests?.failing
            return record.content.ok
                ? event({
                      text: `${at}red check passed${failing ? ` (${failing} new tests fail)` : ''}.`,
                      tone: 'success',
                  })
                : event({
                      text: `${at}red check failed: ${record.content.problems[0] ?? 'no detail'}`,
                      tone: 'danger',
                  })
        }
        case 'leftover_scan':
            return record.content.hits.length === 0
                ? null
                : event({
                      text: `${at}the leftover scan found ${record.content.hits.map((hit) => hit.path).join(', ')}.`,
                      tone: 'warning',
                  })
        case 'commit_made':
            return event({
                text: `${at}${record.content.stage === 'green' ? 'code' : 'tests'} committed.`,
                tone: 'info',
            })
        case 'gates_run': {
            const where =
                record.content.target === 'run_branch' ? ' after joining' : ''
            const failed = record.content.checks
                .filter((check) => !check.ok)
                .map((check) => check.name)
            return record.content.ok
                ? event({ text: `${at}checks passed${where}.`, tone: 'success' })
                : event({
                      text: `${at}checks failed${where}: ${failed.join(', ') || 'no detail'}.`,
                      tone: 'danger',
                  })
        }
        case 'ticket_joined':
            return record.content.ok
                ? event({
                      text: `${at}joined the run branch.`,
                      tone: 'success',
                  })
                : event({
                      text: `${at}couldn't join the run branch: ${record.content.error ?? 'no detail'}`,
                      tone: 'danger',
                  })
        case 'ticket_stuck':
            return event({
                text: `${at}stuck. ${reasonText({ reason: record.content.reason })}`,
                tone: 'danger',
            })
        case 'pull_request_opened':
            return event({
                text: `Pull request #${record.content.number} opened: ${record.content.url}`,
                tone: 'success',
            })
        case 'fix_round':
            return event({
                text: `${at}fix round ${record.content.round}/${LOOP_CAP} after the ${record.content.loop.replaceAll('_', ' ')}.`,
                tone: 'warning',
            })
        case 'review_finished':
            return event({
                text: `${at}review round ${record.content.round}: ${findingsText({ findings: record.content.findings })}.`,
                tone:
                    record.content.findings.blocker > 0 ? 'warning' : 'info',
            })
        case 'reply_received': {
            const ticket = record.content.ticket ?? record.ticket
            return event({
                text: `You replied \`${record.content.word}${ticket === null ? '' : ` #${ticket}`}\`.`,
                tone: 'info',
            })
        }
        case 'ticket_skipped':
            return event({
                text: `${at}skipped. It stays open for a later run.`,
                tone: 'info',
            })
        case 'final_review_started':
            return event({
                text: `The final review started (round ${after.final_review.round}).`,
                tone: 'info',
            })
        case 'lens_finished':
            return event({
                text: `Final review, ${record.content.lens} lens: ${findingsText({ findings: record.content.findings })}.`,
                tone:
                    record.content.findings.blocker +
                        record.content.findings.should_fix >
                    0
                        ? 'warning'
                        : 'success',
            })
        case 'final_review_fixing':
            return event({
                text: `Final review: fix round ${record.content.round}/${LOOP_CAP}.`,
                tone: 'warning',
            })
        case 'final_review_stuck':
            return event({
                text: `The final review is stuck. ${reasonText({ reason: record.content.reason })}`,
                tone: 'danger',
            })
        case 'final_review_passed':
            return event({ text: 'The final review passed.', tone: 'success' })
        case 'intake_read':
        case 'ticket_snapshot':
        case 'baseline_tests':
        case 'run_branch_pushed':
        case 'usage_reading':
        case 'limit_wait_started':
        case 'limit_wait_ended':
        case 'lens_started':
            return null
    }
}

const finishedText = ({
    record,
}: {
    record: Extract<BoardRecord, { kind: 'agent_finished' }>
}): { text: string; tone: Tone } => {
    const at = on({ ticket: record.ticket })
    const { role, result } = record.content
    if (role === 'test-writer') {
        return result.outcome === 'nothing_new_to_test'
            ? event({ text: `${at}nothing new to test.`, tone: 'info' })
            : event({ text: `${at}tests written.`, tone: 'info' })
    }
    if (role === 'implementer') {
        return result.outcome === 'bad_test'
            ? event({ text: `${at}the implementer sent back a bad test.`, tone: 'warning' })
            : event({ text: `${at}code written.`, tone: 'info' })
    }
    if (role === 'ticket-reviewer') {
        return result.verdict === 'approve'
            ? event({ text: `${at}the ticket review approved it.`, tone: 'success' })
            : event({
                  text: `${at}the ticket review asked for changes.`,
                  tone: 'warning',
              })
    }
    return event({ text: `${at}the ${role} finished.`, tone: 'info' })
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
    const described = describeRecord({ after, record })
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
        const previous = before.needs_you.find((entry) => entry.key === item.key)
        if (previous && sameItem({ left: previous, right: item })) continue
        rows.push({
            id: stuckRowId({ run_id, item }),
            kind: ROW_KIND.stuck,
            data: {
                status: 'waiting',
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
            usage: usageLine({ usage: after.usage }),
        }
        rows.push({ id: limitRowId({ run_id }), kind: ROW_KIND.limit, data })
    }
    if (before.limit_wait && !after.limit_wait) {
        const data: LimitRow = {
            status: 'over',
            resets_at: before.limit_wait.resets_at,
            usage: usageLine({ usage: after.usage }),
        }
        rows.push({ id: limitRowId({ run_id }), kind: ROW_KIND.limit, data })
    }
    return rows
}
