/**
 * The plan as replay rebuilds it: rate limits hit, limit and usage-line
 * waits, and billing stops, from agents' sessions and the wait records.
 */
import type { JournalRecord, UsageLineWindow } from './journal-record'

import type { AgentRole } from '../agents/role-results'
import { sessionSignal } from '../limits/plan-signals'

/**
 * Where the run stands with the plan, from agents' rate-limit readings and
 * the limit-wait and stop records.
 */
export type PlanState = {
    /**
     * The latest rejected rate limit no limit wait has started for yet: the
     * window, its reset (seconds since the epoch), the agent that hit it, and
     * when the session was journaled.
     */
    hit: {
        rate_limit_type: string | null
        resets_at: number | null
        ticket: number | null
        role: AgentRole | null
        time: string
    } | null
    /** The limit wait under way: when it ends, and what it is for. */
    wait: {
        until: string
        resets_at: string | null
        rate_limit_type: string | null
    } | null
    /** Every limit wait's reset so far, oldest first; the spec hears of each new one once. */
    resets_announced: (string | null)[]
    /** The first sign of per-token billing in any session, if any. */
    billing: { reason: string } | null
    /** Set once a billing stop is journaled. It sticks. */
    billing_stopped: { reason: string } | null
    /** The usage-line wait under way: its window, line, reading, and end. */
    usage_wait: {
        window: UsageLineWindow
        line: number
        percent: number
        until: string
    } | null
    /**
     * The latest time the run is known to have waited until: the `until` of
     * a limit wait that ended, or of a usage-line wait that ended at its
     * reset. A reading whose window resets by then is out of date.
     */
    waited_until: string | null
}

type PlanRecord = Extract<
    JournalRecord,
    {
        kind:
            | 'agent_session'
            | 'run_stopped'
            | 'limit_wait_started'
            | 'limit_wait_ended'
            | 'usage_line_wait_started'
            | 'usage_line_wait_ended'
    }
>

/** The later of two ISO times; the first may be missing. */
const laterOf = (a: string | null, b: string): string =>
    a !== null && Date.parse(a) >= Date.parse(b) ? a : b

/** The plan state after one record. */
export const planAfter = ({
    plan,
    record,
}: {
    plan: PlanState
    record: PlanRecord
}): PlanState => {
    switch (record.kind) {
        case 'agent_session': {
            const signal = sessionSignal({ session: record.content.session })
            if (signal.kind === 'billing') {
                return {
                    ...plan,
                    billing: plan.billing ?? { reason: signal.reason },
                }
            }
            if (signal.kind === 'ok') return plan
            return {
                ...plan,
                hit: {
                    rate_limit_type: signal.rate_limit_type,
                    resets_at: signal.resets_at,
                    ticket: record.ticket,
                    role: record.content.role,
                    time: record.time,
                },
            }
        }
        case 'run_stopped':
            return record.content.billing
                ? {
                      ...plan,
                      billing: plan.billing ?? {
                          reason: record.content.reason,
                      },
                      billing_stopped: { reason: record.content.reason },
                  }
                : plan
        case 'limit_wait_started': {
            const { until, resets_at, rate_limit_type } = record.content
            return {
                ...plan,
                hit: null,
                wait: { until, resets_at, rate_limit_type },
                resets_announced: [...plan.resets_announced, resets_at],
            }
        }
        case 'limit_wait_ended':
            return {
                ...plan,
                wait: null,
                waited_until: laterOf(plan.waited_until, record.content.until),
            }
        case 'usage_line_wait_started': {
            const { window, line, percent, until } = record.content
            return { ...plan, usage_wait: { window, line, percent, until } }
        }
        case 'usage_line_wait_ended':
            return {
                ...plan,
                usage_wait: null,
                waited_until:
                    record.content.reason === 'reset'
                        ? laterOf(plan.waited_until, record.content.until)
                        : plan.waited_until,
            }
    }
}
