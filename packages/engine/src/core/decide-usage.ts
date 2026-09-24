import type { JournalRecord } from '../journal/journal-record'
import type { RunState } from '../journal/replay'
import {
    usageFor,
    type SessionReading,
    type UsageRecord,
} from '../limits/plan-usage'

/** Journal one ticket's, or the run's, usage. */
export type UsageAction = { type: 'record_usage'; usage: UsageRecord }

/** An agent session as `usageFor` reads it, and its seq. */
type SeqSession = SessionReading & { seq: number }

const sessionsIn = ({ records }: { records: JournalRecord[] }): SeqSession[] =>
    records.flatMap((record) =>
        record.kind === 'agent_session'
            ? [
                  {
                      ticket: record.ticket,
                      session: record.content.session,
                      seq: record.seq,
                  },
              ]
            : []
    )

/**
 * The usage half of the decision step. Pure. Each ticket that is done
 * (pushed) or stuck gets its usage recorded once per finish: a retried
 * ticket that finishes again with agent sessions newer than its last record
 * gets a new one, over all of its sessions, so its latest record is its whole
 * usage. The run gets its own once it is `ending` (its next action is
 * `done`). A ticket or run with no agent sessions records nothing. `null`
 * when there is nothing to record.
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
        if (!finished) continue
        const since = recorded.tickets[number] ?? 0
        const fresh = sessions.some(
            ({ ticket, seq }) => ticket === number && seq > since
        )
        if (!fresh) continue
        return {
            type: 'record_usage',
            usage: usageFor({ sessions, ticket: number }),
        }
    }
    if (!ending || recorded.run) return null
    return { type: 'record_usage', usage: usageFor({ sessions, ticket: null }) }
}
