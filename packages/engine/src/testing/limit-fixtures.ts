/**
 * Journal entry builders for plan limits: a `rate_limit_event`'s reading as
 * the SDK sends it, a limit wait started and ended, and a billing stop.
 */
import type { JournalEntry } from '../journal/journal-record'

/** Seconds since the epoch for an ISO time, as `resetsAt` gives it. */
export const epochSeconds = (iso: string): number =>
    Math.floor(Date.parse(iso) / 1000)

/**
 * One `rate_limit_event`'s info as the SDK sends it, with the windows'
 * utilization under `unifiedWindows` as real readings have it.
 */
export const rateLimitReading = ({
    status,
    rate_limit_type,
    resets_at,
    is_using_overage,
    windows,
}: {
    status: 'allowed' | 'allowed_warning' | 'rejected'
    /** Defaults to `five_hour`. */
    rate_limit_type?: string
    /** An ISO time; leave it out for a reading with no `resetsAt`. */
    resets_at?: string
    is_using_overage?: boolean
    /** Utilization (0 to 1) per window, such as `{ five_hour: 0.2 }`. */
    windows?: Record<string, number>
}): Record<string, unknown> => ({
    status,
    rateLimitType: rate_limit_type ?? 'five_hour',
    ...(resets_at === undefined ? {} : { resetsAt: epochSeconds(resets_at) }),
    overageStatus: 'rejected',
    overageDisabledReason: 'org_level_disabled',
    isUsingOverage: is_using_overage ?? false,
    unifiedWindows: Object.fromEntries(
        Object.entries(windows ?? {}).map(([name, utilization]) => [
            name,
            { utilization },
        ])
    ),
})

/** A limit wait started, hit by #11's test-writer unless told otherwise. */
export const limitWaitStarted = ({
    until,
    resets_at,
    rate_limit_type,
}: {
    until: string
    resets_at: string | null
    /** Defaults to `five_hour`. */
    rate_limit_type?: string
}): JournalEntry => ({
    kind: 'limit_wait_started',
    ticket: null,
    role: null,
    content: {
        until,
        resets_at,
        rate_limit_type: rate_limit_type ?? 'five_hour',
        hit_ticket: 11,
        hit_role: 'test-writer',
    },
})

export const limitWaitEnded = ({ until }: { until: string }): JournalEntry => ({
    kind: 'limit_wait_ended',
    ticket: null,
    role: null,
    content: { until },
})

/** The run stopped for good on a sign of per-token billing. */
export const billingStopped = ({
    reason,
}: {
    reason: string
}): JournalEntry => ({
    kind: 'run_stopped',
    ticket: null,
    role: null,
    content: { reason, role: null, billing: true },
})
