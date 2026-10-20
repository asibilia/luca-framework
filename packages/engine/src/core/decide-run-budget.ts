import {
    amountTokens,
    pendingReplies,
    waitForReply,
    type StuckAction,
} from './decide-stuck'
import { repoBusyStuckComment } from './repo-wait-text'
import {
    pullRequestStuckComment,
    replyAnswer,
    runBudgetDetail,
    runStuckComment,
} from './stuck-text'

import type {
    JournalRecord,
    ReplyProblem,
    RunStuckReason,
} from '../journal/journal-record'
import type { RunState } from '../journal/replay'
import { runBudgetOf, runTokensIn } from '../limits/run-budget'

/** The spec issue's comment for the stuck run, by why it is stuck. */
const stuckBody = ({
    stuck,
    budget,
}: {
    stuck: { reason: RunStuckReason; detail: string }
    budget: number
}): string => {
    switch (stuck.reason) {
        case 'pull_request_failed':
            return pullRequestStuckComment({ detail: stuck.detail })
        case 'repo_busy':
            return repoBusyStuckComment({ detail: stuck.detail })
        case 'run_budget':
            return runStuckComment({ detail: stuck.detail, budget })
    }
}

/** The run's steps with its budget of tokens (#435). */
export type RunBudgetAction =
    /** The run used up its budget: journal it as stuck. */
    | { type: 'mark_run_stuck'; reason: RunStuckReason; detail: string }
    /** Tell the spec issue that the run is stuck. */
    | { type: 'report_run_stuck'; spec_number: number; body: string }

/**
 * The run budget half of the decision step. Pure. Once the run's tokens
 * (`runTokensIn`) reach its budget (the config's `run_budget_tokens`, else
 * the default, plus every top-up a `retry` granted), the run is stuck with
 * the reason "run budget": that is its only step, and nothing new starts.
 * The spec issue is told, then the run waits for the owner: a bare `retry`
 * tops the budget up by half a budget, rounded down, and `retry +3M` by the
 * amount named (#543; replay adds the top-up); `stop` ends the run. A zero
 * or unreadable amount is sent back (`bad_amount`). The owner's other
 * replies wait until the run carries on. A run whose PR didn't open (#508)
 * or whose repo wait ran out is stuck the same way, told why, and a bare
 * `retry` tries again, adding no budget; an amount there is sent back
 * (`amount_only_for_run_budget`). `null` when
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
    const { stuck, report, top_ups } = state.run_budget
    const budget = runBudgetOf({ config: state.config })
    if (stuck === null) {
        const tokens = runTokensIn({ records })
        const allowed = budget + top_ups
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
                body: stuckBody({ stuck, budget }),
            },
        ]
    }
    const reply = pendingReplies({ state }).find(
        ({ word, ticket }) =>
            word === 'stop' || (word === 'retry' && ticket === null)
    )
    if (reply === undefined) return [waitForReply({ state, spec_number })]
    const ignore = (reason: ReplyProblem): StuckAction[] => [
        {
            type: 'ignore_reply',
            comment_id: reply.comment_id,
            spec_number,
            reason,
            answer: replyAnswer({ problem: reason, named: null, stuck: [] }),
        },
    ]
    if (reply.word === 'stop') {
        return [
            {
                type: 'take_reply',
                comment_id: reply.comment_id,
                word: 'stop',
                ticket: null,
            },
        ]
    }
    if (stuck.reason !== 'run_budget') {
        if (reply.amount !== null) return ignore('amount_only_for_run_budget')
        return [
            {
                type: 'take_reply',
                comment_id: reply.comment_id,
                word: 'retry',
                ticket: null,
            },
        ]
    }
    const top_up =
        reply.amount === null
            ? Math.floor(budget / 2)
            : amountTokens({ amount: reply.amount })
    if (top_up === null) return ignore('bad_amount')
    return [
        {
            type: 'take_reply',
            comment_id: reply.comment_id,
            word: 'retry',
            ticket: null,
            top_up,
        },
    ]
}
