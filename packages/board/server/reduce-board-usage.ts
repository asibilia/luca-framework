/**
 * Tokens and plan usage: what each agent session used, the plan's windows
 * the sessions and usage records report, and the waits for a limit to reset.
 */
import type { BoardRecord } from './board-vocabulary'
import { updateTicket } from './reduce-board-update'

import {
    usageLevel,
    windowRank,
    windowWords,
    type BoardState,
    type PlanUsed,
    type Usage,
} from '../shared/board-state'

type SessionContent = Extract<BoardRecord, { kind: 'agent_session' }>['content']

/** Every token a session read or wrote, cache reads included. */
const sessionTokens = ({ session }: SessionContent): number =>
    session.usage.input_tokens +
    session.usage.output_tokens +
    session.usage.cache_read_input_tokens +
    session.usage.cache_creation_input_tokens

/**
 * A session's exact tokens: input, output, and cache-creation tokens over
 * its tokens per model, subagents included. An older journal's session,
 * with none, counts its main loop's `usage`. Cache reads are left out.
 */
const countedTokens = ({ session }: SessionContent): number => {
    const models = Object.values(session.model_usage)
    return (models.length === 0 ? [session.usage] : models).reduce(
        (total, each) =>
            total +
            each.input_tokens +
            each.output_tokens +
            each.cache_creation_input_tokens,
        0
    )
}

/** A 0-to-1 utilization as a whole percent from 0 to 100. */
const percentOf = ({ utilization }: { utilization: number }): number =>
    Math.min(100, Math.max(0, Math.round(utilization * 100)))

/** Epoch seconds as an ISO time. */
const isoOf = ({ seconds }: { seconds: number }): string =>
    new Date(seconds * 1000).toISOString()

type Reading = SessionContent['session']['rate_limit_events'][number]

/**
 * One reading's windows as `{ type, utilization, resetsAt }`: its top-level
 * `rateLimitType` form, then each of its `unifiedWindows`.
 */
const windowsOf = ({
    reading,
}: {
    reading: Reading
}): { type: string; utilization: number; resetsAt: number | undefined }[] => {
    const { rateLimitType, utilization, resetsAt, unifiedWindows } = reading
    const top =
        rateLimitType !== undefined && utilization !== undefined
            ? [{ type: rateLimitType, utilization, resetsAt }]
            : []
    const unified = Object.entries(unifiedWindows ?? {}).flatMap(
        ([type, window]) =>
            window.utilization === undefined
                ? []
                : [
                      {
                          type,
                          utilization: window.utilization,
                          resetsAt: window.resetsAt,
                      },
                  ]
    )
    return [...top, ...unified]
}

/**
 * The plan usage after a session's rate-limit readings. The latest
 * `five_hour` reading sets the five-hour window (and when it resets); the
 * latest reading of any `seven_day*` type sets the weekly one, and inside
 * one reading the highest `seven_day*` window wins, since the tightest
 * weekly cap is the one that binds. A window with no reading keeps what it
 * had. `null` while no window has a reading.
 */
const usageAfter = ({
    usage,
    session,
    time,
}: {
    usage: Usage | null
    session: SessionContent['session']
    time: string
}): Usage | null => {
    let five_hour = usage?.five_hour_percent ?? null
    let weekly = usage?.weekly_percent ?? null
    let resets_at = usage?.resets_at ?? null
    let read = false
    for (const reading of session.rate_limit_events) {
        const windows = windowsOf({ reading })
        const fiveHour = windows.filter(({ type }) => type === 'five_hour')
        const latest = fiveHour.at(-1)
        if (latest) {
            five_hour = percentOf({ utilization: latest.utilization })
            resets_at =
                latest.resetsAt === undefined
                    ? resets_at
                    : isoOf({ seconds: latest.resetsAt })
            read = true
        }
        const weeklies = windows
            .filter(({ type }) => type.startsWith('seven_day'))
            .map(({ utilization }) => percentOf({ utilization }))
        if (weeklies.length > 0) {
            weekly = Math.max(...weeklies)
            read = true
        }
    }
    if (!read) return usage
    return {
        five_hour_percent: five_hour,
        weekly_percent: weekly,
        five_hour_level:
            five_hour === null ? null : usageLevel({ percent: five_hour }),
        weekly_level: weekly === null ? null : usageLevel({ percent: weekly }),
        resets_at,
        read_at: time,
    }
}

/**
 * A usage record's windows as whole percents in words: five-hour first,
 * then the weekly ones, then the rest, each group in the record's order.
 */
const planUsedOf = ({
    windows,
}: {
    windows: Record<string, { used: number }>
}): PlanUsed[] =>
    Object.entries(windows)
        .map(([window, { used }], index) => ({ window, used, index }))
        .toSorted(
            (left, right) =>
                windowRank({ window: left.window }) -
                    windowRank({ window: right.window }) ||
                left.index - right.index
        )
        .map(({ window, used }) => ({
            window: windowWords({ window }),
            percent: Math.round(used),
        }))

/** The record kinds of tokens and plan usage. */
export const USAGE_KINDS = [
    'agent_session',
    'limit_wait_started',
    'limit_wait_ended',
    'usage_line_wait_started',
    'usage_line_wait_ended',
    'usage_recorded',
] as const

type UsageRecord = Extract<BoardRecord, { kind: (typeof USAGE_KINDS)[number] }>

/** Applies one record of USAGE_KINDS to the board. */
export const applyUsageKind = ({
    state,
    record,
}: {
    state: BoardState
    record: UsageRecord
}): BoardState => {
    const { ticket } = record
    switch (record.kind) {
        case 'agent_session': {
            const tokens = sessionTokens(record.content)
            const { role } = record.content
            const withTokens = updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    tokens: card.tokens + tokens,
                    agent_tokens: {
                        ...card.agent_tokens,
                        [role]: (card.agent_tokens[role] ?? 0) + tokens,
                    },
                }),
            })
            return {
                ...withTokens,
                run_tokens: state.run_tokens + countedTokens(record.content),
                usage: usageAfter({
                    usage: state.usage,
                    session: record.content.session,
                    time: record.time,
                }),
            }
        }
        case 'limit_wait_started': {
            const { resets_at, until, rate_limit_type } = record.content
            return {
                ...state,
                limit_wait: {
                    resets_at: resets_at ?? until,
                    window:
                        rate_limit_type === null
                            ? null
                            : windowWords({ window: rate_limit_type }),
                    since: record.time,
                },
            }
        }
        case 'limit_wait_ended':
            return { ...state, limit_wait: null }
        case 'usage_line_wait_started': {
            const { window, line, percent, resets_at } = record.content
            return {
                ...state,
                usage_line_wait: {
                    window: windowWords({ window }),
                    line,
                    percent,
                    resets_at,
                    since: record.time,
                },
            }
        }
        case 'usage_line_wait_ended':
            return { ...state, usage_line_wait: null }
        case 'usage_recorded': {
            const plan_used = planUsedOf({ windows: record.content.windows })
            if (record.content.scope === 'run') {
                return { ...state, run_plan_used: plan_used }
            }
            return updateTicket({
                state,
                number: record.content.ticket ?? ticket,
                update: (card) => ({ ...card, plan_used }),
            })
        }
    }
}
