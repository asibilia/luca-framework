/**
 * context-refresher hook — `PostToolUse` on every tool call.
 *
 * The hook fires after every tool invocation (matcher `*`) and the
 * handler ticks a tool-call counter persisted in the sidecar at
 * `.claude/cache/context-refresher-state.json`. When the counter
 * crosses the per-step threshold (default 30 ticks), the handler
 * surfaces a mid-conversation `<luca-reminder>` re-anchoring the agent
 * on the current pipelineStep's mode constraints, then resets the
 * counter. On a step change since the last fire, the reminder fires
 * immediately on the next tick (re-anchor on the new mode).
 *
 * Why PostToolUse rather than UserPromptSubmit or Stop:
 *
 *   The mastracode original subscribed to a TokenBudgetMonitor that
 *   ticked on EVERY token-emitting event (assistant turn, tool call,
 *   user message) and fired the refresher at the INJECT_REMINDERS
 *   threshold (30% utilization). Claude Code does not expose a token-
 *   budget API to hooks, so we substitute a deterministic proxy:
 *   PostToolUse with matcher `*` ticks once per tool call. Tool calls
 *   correlate strongly with context growth (each one folds in the
 *   tool's output) and the matcher catches every tool — Read, Bash,
 *   Edit, MCP, subagent dispatch, all of them.
 *
 *   UserPromptSubmit was the other candidate but it ticks once per
 *   user message; in a long autonomous run there may be only one user
 *   prompt across hundreds of tool calls, so the refresher would
 *   never fire.
 *
 *   Stop fires at turn end and would tick once per turn — same
 *   under-counting problem as UserPromptSubmit for long autonomous
 *   runs.
 *
 *   PreToolUse would also work but would fire BEFORE the tool output
 *   is folded in (so the counter is one tick "behind" the actual
 *   context state). PostToolUse fires AFTER, so the counter tracks
 *   what the agent has actually seen.
 *
 * Why matcher `*` rather than a specific tool list:
 *
 *   The point of the refresher is to count context-growing events.
 *   Every tool call grows context (even a fast read folds some output
 *   into the next turn), so the matcher should be broad. Narrowing to
 *   e.g. `Bash` would miss read-heavy planning sessions that bloat
 *   context via Read + Grep + Glob without ever shelling out.
 *
 * Matcher: `*` (every tool). The handler itself is fast (single sidecar
 * file read/write + a pure function call) and exits 0 silently on the
 * common no-refresh path, so the per-tool overhead is bounded.
 *
 * Failure-open everywhere — informational hook. A refresher that
 * doesn't fire is acceptable; a hook that crashes the session is not.
 */
import { defineHook } from '../../define/hook.ts'

export const contextRefresherHook = defineHook({
    id: 'context-refresher',
    description:
        'PostToolUse context-refresher — surfaces a per-step <luca-reminder> via additionalContext after every Nth tool call (default 30) or on a step change since the last fire.',
    event: 'PostToolUse',
    // Match every tool. Tool calls correlate with context growth more
    // tightly than user-prompt or turn-end events, and a long auto-pilot
    // run may have many tool calls per user prompt.
    matcher: '*',
    runtime: 'bun-script',
    // Relative to $CLAUDE_PROJECT_DIR. The compiler emits only the
    // settings.json slice; handler distribution to consumer repos is a
    // Phase F-2 (`luca init`) concern. The TS source of this handler
    // lives at packages/luca-tools/src/hooks/context-refresher/handler.ts.
    handler: '.claude/hooks/context-refresher.ts',
    timeoutMs: 5000,
    background: false,
})
