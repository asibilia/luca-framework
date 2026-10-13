import { countedTokens, sessionTokens } from './plan-usage'

import type { EngineConfig } from '../config/engine-config'
import type { JournalRecord } from '../journal/journal-record'

/**
 * The run budget a repo gets when its engine config sets no
 * `run_budget_tokens`: 3 times the largest run total in the v1 dogfood
 * journals (`~/.local/state/luca/runs/`), rounded up, counted the same way
 * as a run's tokens (input, output, and cache-creation tokens; cache reads
 * left out).
 *
 * The largest v1 dogfood runs (`luca-20260924-230826-8aoj` and
 * `20260925t013006z-ebe29030`, see `docs/research/sdk-usage-per-run.md` on
 * `research/sdk-usage-per-run`) wrote about 260,000 output tokens each over
 * 13 to 26 agent sessions. That doc gives no input or cache-creation totals,
 * and the journals sit outside the agent's worktree, so the largest run
 * total is an upper-bound estimate (about 3,000,000 tokens), not an exact
 * sum. 3 times that is 9,000,000. To make it exact, sum `input_tokens +
 * output_tokens + cache_creation_input_tokens` over each v1 run's
 * `agent_session` records, take the largest, and set this (and the board's
 * copy in `shared/board-state.ts`) to 3 times it, rounded up. It is not read
 * from the journals at run time.
 */
export const DEFAULT_RUN_BUDGET_TOKENS = 9_000_000

/**
 * One full run budget: the config's `run_budget_tokens`, else the default.
 *
 * @example
 * runBudgetOf({ config: { ...config, run_budget_tokens: 12_000_000 } }) // 12_000_000
 */
export const runBudgetOf = ({
    config,
}: {
    config: EngineConfig | null
}): number => config?.run_budget_tokens ?? DEFAULT_RUN_BUDGET_TOKENS

/**
 * A run's tokens so far: every agent turn's counted tokens (see
 * `countedTokens`), per model and subagents included, over every ticket, the
 * final review, and the learner. Pure.
 *
 * @example
 * runTokensIn({ records: journal.read() }) // 1_234_567
 */
export const runTokensIn = ({
    records,
}: {
    records: JournalRecord[]
}): number =>
    records.reduce(
        (total, record) =>
            record.kind === 'agent_session'
                ? total +
                  countedTokens({
                      tokens: sessionTokens({
                          session: record.content.session,
                      }),
                  })
                : total,
        0
    )
