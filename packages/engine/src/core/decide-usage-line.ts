import { LIMIT_WAIT_MARGIN_MS } from './decide-plan'

import {
    UsageLineWindowSchema,
    type JournalRecord,
    type UsageLineWindow,
} from '../journal/journal-record'
import type { RunState } from '../journal/replay'
import {
    LINE_OF,
    newestReadings,
    runReadings,
    sharedReadings,
    type UsageLines,
} from '../limits/usage-line'

/** The run's next step with the usage line, when the line decides it. */
export type UsageLineAction =
    /**
     * The newest reading of `window` is at or over its line: tell the spec
     * issue and journal a usage-line wait until `until`.
     */
    | {
          type: 'start_usage_line_wait'
          spec_number: number
          window: UsageLineWindow
          line: number
          percent: number
          resets_at: string
          until: string
      }
    /**
     * Wait until `until`, or until the line is raised above `percent`, then
     * tell the spec issue and journal the wait's end.
     */
    | {
          type: 'wait_for_usage_line'
          spec_number: number
          window: UsageLineWindow
          line: number
          percent: number
          until: string
      }

/** The actions that start or go on with an agent's turn. */
const AGENT_STEPS: ReadonlySet<string> = new Set([
    'launch_agent',
    'follow_up_agent',
    'launch_lens',
    'launch_final_fixer',
    'follow_up_final_fixer',
    'launch_learner',
])

const isoAt = (ms: number): string => new Date(ms).toISOString()

/**
 * The usage-line half of the decision step. Pure. A usage-line wait under
 * way waits. Otherwise, when the next steps include an agent's turn and the
 * newest reading of a window (the run's own, or one another run shared,
 * whichever arrived last) is at or over its line, the run pauses until the
 * window resets. Steps that aren't an agent's go on, and an agent mid-turn
 * finishes first, since the wait is the run's and runs alone. A reading
 * whose window reset by the end of an earlier wait is out of date. Without
 * `usage_lines` there is no line. `null` when the line has nothing to say.
 */
export const decideUsageLine = ({
    state,
    records,
    spec_number,
    next,
    usage_lines,
    shared_readings,
}: {
    state: RunState
    records: JournalRecord[]
    spec_number: number
    /** The steps the rest of the decision step picked. */
    next: { type: string }[]
    usage_lines: UsageLines | undefined
    /** Raw readings other runs shared, each with its `arrived_at`. */
    shared_readings: unknown[]
}): UsageLineAction | null => {
    const { usage_wait, waited_until } = state.plan
    if (usage_wait !== null) {
        return { type: 'wait_for_usage_line', spec_number, ...usage_wait }
    }
    if (usage_lines === undefined) return null
    if (!next.some(({ type }) => AGENT_STEPS.has(type))) return null
    const past = waited_until === null ? -Infinity : Date.parse(waited_until)
    const newest = newestReadings({
        readings: [
            ...runReadings({ records }),
            ...sharedReadings({ readings: shared_readings }),
        ].filter(({ resets_at }) => resets_at * 1000 > past),
    })
    for (const window of UsageLineWindowSchema.options) {
        const reading = newest[window]
        const line = usage_lines[LINE_OF[window]]
        if (reading === undefined || reading.percent < line) continue
        const resets_ms = reading.resets_at * 1000
        return {
            type: 'start_usage_line_wait',
            spec_number,
            window,
            line,
            percent: reading.percent,
            resets_at: isoAt(resets_ms),
            until: isoAt(resets_ms + LIMIT_WAIT_MARGIN_MS),
        }
    }
    return null
}
