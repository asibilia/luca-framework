/**
 * Journal records about the plan: the rate limit readings an agent's session
 * carries, waits for a limit to reset, and how much of the plan a ticket or
 * the run used.
 */
import { entry, type Entry } from './journal-fixture-base'

/**
 * One `rate_limit_event`'s info as the Claude Agent SDK sends it:
 * utilization from 0 to 1, resetsAt in seconds.
 */
export const rateLimit = ({
    type,
    utilization,
    resets_at,
}: {
    type: string
    utilization: number
    resets_at?: string
}) => ({
    status: 'allowed',
    rateLimitType: type,
    utilization,
    ...(resets_at ? { resetsAt: Date.parse(resets_at) / 1000 } : {}),
    isUsingOverage: false,
})

/**
 * A reading as a real run journals it: no top-level utilization, one entry
 * per window in `unifiedWindows` (utilization 0 to 1, resetsAt in seconds).
 */
export const unifiedRateLimit = ({
    windows,
}: {
    windows: Record<string, { utilization: number; resets_at?: string }>
}) => ({
    status: 'allowed',
    resetsAt: 1790179800,
    rateLimitType: 'five_hour',
    overageStatus: 'rejected',
    overageDisabledReason: 'org_level_disabled',
    isUsingOverage: false,
    unifiedWindows: Object.fromEntries(
        Object.entries(windows).map(([name, { utilization, resets_at }]) => [
            name,
            {
                utilization,
                ...(resets_at
                    ? { resetsAt: Date.parse(resets_at) / 1000 }
                    : {}),
            },
        ])
    ),
})

export const limitWaitStarted = ({
    resets_at,
    until = resets_at ?? '2026-09-23T17:05:00.000Z',
    rate_limit_type = 'five_hour',
    hit_ticket = 11,
    hit_role = 'implementer',
}: {
    resets_at: string | null
    until?: string
    rate_limit_type?: string | null
    hit_ticket?: number | null
    hit_role?: string | null
}): Entry =>
    entry({
        kind: 'limit_wait_started',
        content: { resets_at, until, rate_limit_type, hit_ticket, hit_role },
    })

export const limitWaitEnded = ({
    until = '2026-09-23T17:05:00.000Z',
}: { until?: string } = {}): Entry =>
    entry({ kind: 'limit_wait_ended', content: { until } })

/**
 * How much of the plan a ticket (scope `ticket`) or the whole run (scope
 * `run`) used: each window's percent before and after, and the difference.
 */
export const usageRecorded = ({
    ticket,
    windows,
}: {
    ticket: number | null
    windows: Record<string, { from: number; to: number; used: number }>
}): Entry =>
    entry({
        kind: 'usage_recorded',
        ticket,
        content: {
            scope: ticket === null ? 'run' : 'ticket',
            ticket,
            agent_turns: 3,
            tokens: {
                input_tokens: 100,
                output_tokens: 200,
                cache_read_input_tokens: 300,
                cache_creation_input_tokens: 400,
            },
            windows,
        },
    })
