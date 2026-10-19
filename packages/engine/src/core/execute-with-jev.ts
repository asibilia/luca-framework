/**
 * Carries out one action with the decision model asked around it in shadow
 * mode.
 */
import type { EngineAction } from './decide'
import { isFinalReviewAction } from './decide-final-review'
import { executeAction, type StepTry } from './execute-action'
import type { BuildDeps } from './execute-build'
import type { GoingRunsReader } from './execute-repo-wait'
import { ticketOf } from './schedule-rules'

import { jevAsksAfter, jevAsksBefore } from '../jev/jev-jobs'
import type { ShadowAsker } from '../jev/jev-shadow'
import { asksModel } from '../jev/model-pick'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import type { EngineClock } from '../limits/limit-wait'
import type { UsageLines } from '../limits/usage-line'
import type { MemoryDeps } from '../memory/memory-client'
import type { Tracker } from '../tracker/tracker'

/**
 * Carries out one action with the decision model in shadow mode: asks it
 * before the action (ticket order, model, skills), then after it about the
 * records it appended (failure kinds, finding severities). Only the action's
 * own ticket's new records count, since other tickets append at the same
 * time. The answers change nothing, but for the model pick of a role whose
 * floor is below Opus, which the launch step reads (#603). A launch whose
 * model is set without the decision model (after a failed try on a cheaper
 * model, or a redo) gets no model ask (#604).
 */
export const executeWithJev = async ({
    ask,
    action,
    journal,
    tracker,
    build,
    clock,
    reply_poll_ms,
    memory,
    step,
    read_usage_lines,
    going_runs,
}: {
    ask: ShadowAsker
    action: EngineAction
    journal: Journal
    tracker: Tracker
    build?: BuildDeps
    clock?: EngineClock
    reply_poll_ms?: number
    memory?: MemoryDeps
    step?: StepTry
    read_usage_lines?: () => Promise<UsageLines>
    going_runs?: GoingRunsReader
}): Promise<void> => {
    const before = journal.read()
    const state = replayRun({ records: before })
    await ask(
        jevAsksBefore({ action, state }).filter(
            // No model ask once the launch's model is set without one (#604).
            ({ job, ticket, role }) =>
                job !== 'agent_model' ||
                role === null ||
                asksModel({ records: before, state, ticket, role, step })
        )
    )
    const lastSeq = journal.read().at(-1)?.seq ?? 0
    await executeAction({
        action,
        journal,
        tracker,
        build,
        clock,
        reply_poll_ms,
        memory,
        step,
        read_usage_lines,
        going_runs,
    })
    const records = journal.read()
    await ask(
        jevAsksAfter({
            records: records.filter(
                (record) =>
                    record.seq > lastSeq && ownsRecord({ action, record })
            ),
            state: replayRun({ records }),
        })
    )
}

/**
 * Whether a record appended while `action` ran is that action's own, since
 * other tickets (or other lenses) append at the same time: a ticket's
 * records for a ticket's step, a lens's for its lens, and the final
 * review's other ticket-less records for its other steps.
 */
const ownsRecord = ({
    action,
    record,
}: {
    action: EngineAction
    record: JournalRecord
}): boolean => {
    if (action.type === 'launch_lens') {
        return (
            record.ticket === null &&
            (record.role === null || record.role === action.role)
        )
    }
    if (isFinalReviewAction(action)) {
        return record.ticket === null && !record.role?.endsWith('-lens')
    }
    const ticket = ticketOf(action)
    return ticket === null || record.ticket === ticket
}
