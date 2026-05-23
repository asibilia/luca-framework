/**
 * Context refresher thresholds — single source of truth.
 *
 * The mastracode original (`luca-mastracode/src/util/token-budget.ts`)
 * used token-utilization thresholds (`INJECT_REMINDERS: 0.3`, etc.)
 * because the Mastra harness exposed a context-window-size signal.
 * Claude Code hooks do not get a comparable utilization API, so we
 * substitute a deterministic proxy: tool-call ticks. After
 * `toolCallsPerRefresh` PostToolUse events accumulate within the
 * current pipeline step, the algorithm fires a refresher.
 *
 * The default (`30`) is a rough analogue for the mastracode 30%
 * threshold on Claude Code's standard 200K context window. With each
 * tool call averaging ~3-5K tokens of input + output, 30 tool calls is
 * around the point a long-running session starts losing the active
 * mode's constraints from the front of the context — a reasonable
 * place to re-anchor. Tuning is per-vault (override via the
 * `thresholds` field on `ContextRefresherInput`); no per-step bias
 * today because adding one would multiply the config surface without
 * clear evidence the bias matters.
 */

export interface ContextRefresherThresholds {
    /**
     * Number of tool-call ticks between refreshes within a single
     * pipeline step. Must be a positive integer. The algorithm fires
     * when the carried `toolCallCount` reaches or exceeds this value,
     * resets the counter, and starts a new cooldown window.
     */
    toolCallsPerRefresh: number
}

/**
 * Default thresholds. Override via `ContextRefresherInput.thresholds`
 * if a consumer wants finer-grained control without recompiling.
 */
export const CONTEXT_REFRESHER_DEFAULTS: ContextRefresherThresholds = {
    toolCallsPerRefresh: 30,
}
