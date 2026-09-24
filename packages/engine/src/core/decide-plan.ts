import type { AgentRole } from '../agents/role-results'
import type { RunState } from '../journal/replay'

/**
 * A limit wait ends this long after the window's reset, so the first agent
 * after it isn't turned away by a clock a little behind the plan's.
 */
export const LIMIT_WAIT_MARGIN_MS = 60_000

/** How long a limit wait lasts when the reading named no reset: 15 minutes. */
export const DEFAULT_LIMIT_WAIT_MS = 15 * 60_000

/** The run's next step with the plan, when the plan decides it. */
export type PlanAction =
    /**
     * A plan window was used up: journal a limit wait until `until` and,
     * if `announce`, tell the spec issue when the run goes on.
     */
    | {
          type: 'start_limit_wait'
          spec_number: number
          rate_limit_type: string | null
          resets_at: string | null
          until: string
          ticket: number | null
          role: AgentRole | null
          /** False when the spec already heard of a wait for this same reset. */
          announce: boolean
      }
    /** Wait until `until`, then journal the limit wait's end. */
    | { type: 'wait_for_limit'; until: string }
    /** A sign of per-token billing: stop the run for good. */
    | { type: 'stop_for_billing'; reason: string }
    /** The run stopped for billing. It never goes on. */
    | { type: 'done'; outcome: 'stopped'; reason: string }

const isoAt = (ms: number): string => new Date(ms).toISOString()

/**
 * The plan half of the decision step. Pure. A billing sign stops the run
 * (and the stop sticks); a rejected rate limit starts a limit wait for the
 * whole run, however many tickets are in flight; a limit wait under way
 * waits. `null` when the plan has nothing to say, so the build goes on.
 *
 * The model never changes: after a limit wait (the weekly Opus cap
 * included), the step it cut off is taken again as it was.
 */
export const decidePlan = ({
    state,
    spec_number,
}: {
    state: RunState
    spec_number: number
}): PlanAction | null => {
    const { hit, wait, billing, billing_stopped, resets_announced } = state.plan
    if (billing_stopped !== null) {
        return {
            type: 'done',
            outcome: 'stopped',
            reason: billing_stopped.reason,
        }
    }
    if (billing !== null) {
        return { type: 'stop_for_billing', reason: billing.reason }
    }
    if (hit !== null) {
        const resets_at =
            hit.resets_at === null ? null : isoAt(hit.resets_at * 1000)
        const until =
            resets_at === null
                ? isoAt(Date.parse(hit.time) + DEFAULT_LIMIT_WAIT_MS)
                : isoAt(Date.parse(resets_at) + LIMIT_WAIT_MARGIN_MS)
        return {
            type: 'start_limit_wait',
            spec_number,
            rate_limit_type: hit.rate_limit_type,
            resets_at,
            until,
            ticket: hit.ticket,
            role: hit.role,
            announce:
                resets_at === null || !resets_announced.includes(resets_at),
        }
    }
    if (wait !== null) return { type: 'wait_for_limit', until: wait.until }
    return null
}
