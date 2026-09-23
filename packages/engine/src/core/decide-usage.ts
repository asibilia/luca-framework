import type { JournalRecord } from '../journal/journal-record'
import type { RunState } from '../journal/replay'
import {
    usageFor,
    type SessionReading,
    type UsageRecord,
} from '../limits/plan-usage'

/** Journal one ticket's, or the run's, usage. */
export type UsageAction = { type: 'record_usage'; usage: UsageRecord }

const sessionsIn = ({
    records,
}: {
    records: JournalRecord[]
}): SessionReading[] =>
    records.flatMap((record) =>
        record.kind === 'agent_session'
            ? [{ ticket: record.ticket, session: record.content.session }]
            : []
    )

/**
 * The usage half of the decision step. Pure. Each ticket that is done
 * (pushed) or stuck gets its usage recorded once, and the run gets its own
 * once it is `ending` (its next action is `done`). A ticket or run with no
 * agent sessions records nothing. `null` when there is nothing to record.
 */
export const decideUsage = ({
    records,
    state,
    ending,
}: {
    records: JournalRecord[]
    state: RunState
    /** The run's next action is `done`. */
    ending: boolean
}): UsageAction | null => {
    const sessions = sessionsIn({ records })
    if (sessions.length === 0) return null
    const recorded = state.usage_recorded
    for (const number of state.snapshot?.ticket_order ?? []) {
        const progress = state.tickets[number]
        const finished =
            progress !== undefined &&
            (progress.pushed !== null || progress.stuck !== null)
        if (!finished || recorded.tickets.includes(number)) continue
        if (!sessions.some(({ ticket }) => ticket === number)) continue
        return {
            type: 'record_usage',
            usage: usageFor({ sessions, ticket: number }),
        }
    }
    if (!ending || recorded.run) return null
    return { type: 'record_usage', usage: usageFor({ sessions, ticket: null }) }
}
