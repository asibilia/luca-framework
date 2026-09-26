import { pendingReplies, waitForReply, type StuckAction } from './decide-stuck'
import { runBudgetDetail, runStuckComment } from './stuck-text'

import type { JournalRecord, RunStuckReason } from '../journal/journal-record'
import type { RunState } from '../journal/replay'
import { runBudgetOf, runTokensIn } from '../limits/run-budget'

/** The run's steps with its budget of tokens (#435). */
export type RunBudgetAction =
    /** The run used up its budget: journal it as stuck. */
    | { type: 'mark_run_stuck'; reason: RunStuckReason; detail: string }
    /** Tell the spec issue that the run is stuck. */
    | { type: 'report_run_stuck'; spec_number: number; body: string }

/**
 * The run budget half of the decision step. Pure. Once the run's tokens
 * (`runTokensIn`) reach its budget (the config's `run_budget_tokens`, else
 * the default, once more for each `retry`), the run is stuck with the
 * reason "run budget": that is its only step, and nothing new starts. The
 * spec issue is told, then the run waits for the owner: a bare `retry`
 * adds one more full budget (replay does that), and `stop` ends the run.
 * The owner's other replies wait until the run carries on. `null` when
 * the budget has nothing to say: the run is under it, stopping, or its PR
 * is open.
 *
 * @example
 * decideRunBudget({ state, records, spec_number: 10 })
 * // [{ type: 'mark_run_stuck', reason: 'run_budget', detail: 'The run used 9,000,120 tokens ...' }]
 */
export const decideRunBudget = ({
    state,
    records,
    spec_number,
}: {
    state: RunState
    records: JournalRecord[]
    spec_number: number
}): (RunBudgetAction | StuckAction)[] | null => {
    if (state.stop !== null || state.pull_request !== null) return null
    const { stuck, report, retries } = state.run_budget
    const budget = runBudgetOf({ config: state.config })
    if (stuck === null) {
        const tokens = runTokensIn({ records })
        const allowed = budget * (1 + retries)
        if (tokens < allowed) return null
        return [
            {
                type: 'mark_run_stuck',
                reason: 'run_budget',
                detail: runBudgetDetail({ tokens, budget: allowed }),
            },
        ]
    }
    if (report === null) {
        return [
            {
                type: 'report_run_stuck',
                spec_number,
                body: runStuckComment({ detail: stuck.detail, budget }),
            },
        ]
    }
    const reply = pendingReplies({ state }).find(
        ({ word, ticket }) =>
            word === 'stop' || (word === 'retry' && ticket === null)
    )
    if (reply === undefined) return [waitForReply({ state, spec_number })]
    return [
        {
            type: 'take_reply',
            comment_id: reply.comment_id,
            word: reply.word === 'stop' ? 'stop' : 'retry',
            ticket: null,
        },
    ]
}
