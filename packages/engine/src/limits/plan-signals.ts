import { z } from 'zod'

import type { AgentSession } from '../agents/agent-launcher'

/**
 * One `rate_limit_event`'s info, as the Claude Agent SDK sends it. Loose:
 * only the fields the engine reads are checked, and a field of the wrong
 * type reads as missing. `resetsAt` is in seconds since the epoch;
 * `utilization` is 0 to 1. Real readings put each window's utilization in
 * `unifiedWindows`, not at the top. `arrived_at` is the launcher's own: when
 * the reading arrived (ISO), missing in older journals.
 */
export const RateLimitReadingSchema = z.looseObject({
    arrived_at: z.string().optional().catch(undefined),
    status: z.string().optional().catch(undefined),
    rateLimitType: z.string().optional().catch(undefined),
    resetsAt: z.number().optional().catch(undefined),
    utilization: z.number().optional().catch(undefined),
    isUsingOverage: z.boolean().optional().catch(undefined),
    overageInUse: z.boolean().optional().catch(undefined),
    unifiedWindows: z
        .record(
            z.string(),
            z.looseObject({
                utilization: z.number().optional().catch(undefined),
                resetsAt: z.number().optional().catch(undefined),
            })
        )
        .optional()
        .catch(undefined),
})

export type RateLimitReading = z.infer<typeof RateLimitReadingSchema>

/**
 * What a reading, or a whole session, says about the plan:
 * - `ok`: go on (`allowed`, `allowed_warning`).
 * - `limit`: a window is used up (`rejected`). Wait until it resets.
 * - `billing`: a sign of per-token billing (overage, a billing error).
 *   Stop the run for good. Billing beats a limit.
 */
export type PlanSignal =
    | { kind: 'ok' }
    | {
          kind: 'limit'
          /** The window, such as `five_hour`, `seven_day`, or `seven_day_opus`. */
          rate_limit_type: string | null
          /** When the window resets, in seconds since the epoch, if known. */
          resets_at: number | null
      }
    | { kind: 'billing'; reason: string }

const OK: PlanSignal = { kind: 'ok' }

/**
 * What one `rate_limit_event`'s info says: overage in any form is billing,
 * a rejected window is a limit, anything else is fine.
 *
 * @example
 * planSignal({ info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 1790179800 } })
 * // { kind: 'limit', rate_limit_type: 'five_hour', resets_at: 1790179800 }
 * planSignal({ info: { status: 'allowed', isUsingOverage: true } })
 * // { kind: 'billing', reason: 'rate_limit_event isUsingOverage=true (unknown)' }
 */
export const planSignal = ({ info }: { info: unknown }): PlanSignal => {
    const parsed = RateLimitReadingSchema.safeParse(info)
    if (!parsed.success) return OK
    const reading = parsed.data
    const kind = reading.rateLimitType ?? 'unknown'
    if (reading.isUsingOverage === true) {
        return {
            kind: 'billing',
            reason: `rate_limit_event isUsingOverage=true (${kind})`,
        }
    }
    if (reading.overageInUse === true) {
        return {
            kind: 'billing',
            reason: `rate_limit_event overageInUse=true (${kind})`,
        }
    }
    if (reading.rateLimitType === 'overage') {
        return {
            kind: 'billing',
            reason: `rate_limit_event rateLimitType=overage (status=${reading.status ?? 'unknown'})`,
        }
    }
    if (reading.status !== 'rejected') return OK
    const type = reading.rateLimitType ?? null
    const window =
        type === null ? undefined : reading.unifiedWindows?.[type]?.resetsAt
    return {
        kind: 'limit',
        rate_limit_type: type,
        resets_at: reading.resetsAt ?? window ?? null,
    }
}

/**
 * What a whole agent session says: a billing error or any billing reading
 * is billing; otherwise the last rejected reading is a limit.
 *
 * @example
 * sessionSignal({ session }) // { kind: 'ok' } for a session with only allowed readings
 */
export const sessionSignal = ({
    session,
}: {
    session: Pick<AgentSession, 'rate_limit_events' | 'billing_error'>
}): PlanSignal => {
    if (session.billing_error) {
        return { kind: 'billing', reason: 'assistant error billing_error' }
    }
    const signals = session.rate_limit_events.map((info) =>
        planSignal({ info })
    )
    return (
        signals.find((signal) => signal.kind === 'billing') ??
        signals.findLast((signal) => signal.kind === 'limit') ??
        OK
    )
}
