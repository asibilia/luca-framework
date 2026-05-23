/**
 * continuation-messages hook — `PostToolUse` on `Bash` invocations.
 *
 * The hook fires AFTER any `Bash` tool call and the handler narrows to
 * successful `luca state advance <step>` invocations, then surfaces a
 * mode-entry kick-off prompt via the Claude Code `additionalContext`
 * channel (the same channel docs/research/prompt-architecture/
 * 02-context-rot-and-injection.md identifies for invisible
 * `<system-reminder>` injections).
 *
 * Why PostToolUse on Bash rather than UserPromptSubmit or Stop:
 *
 *   The mastracode original called `buildContinuationMessage(newModeId,
 *   state)` AFTER a successful Mastra mode switch. That's a strictly
 *   post-state-change event — the new step is already persisted to
 *   `.luca/state.json` by the time the message is built. In Claude Code
 *   terms, the equivalent event is `PostToolUse` on the Bash invocation
 *   of `luca state advance`:
 *
 *     - PostToolUse fires after the CLI completes, so state.json has
 *       the new pipelineStep.
 *     - Bash matcher catches every transition (skills, agents, manual
 *       invocations all funnel through the CLI).
 *     - The handler can extract the requested `<step>` from the Bash
 *       command, but doesn't need to — it reads the now-current step
 *       from state.json.
 *
 *   UserPromptSubmit was the other candidate but it fires on user
 *   input, not on pipeline transitions; it would mis-fire on every
 *   user message regardless of whether the pipeline moved.
 *
 *   Stop fires at turn end but lacks the deterministic "the pipeline
 *   just moved" signal — most turn-ends are not transitions.
 *
 * Message delivery channel:
 *
 *   The handler emits JSON to stdout in the Claude Code PostToolUse
 *   hook output format:
 *
 *     {
 *       "hookSpecificOutput": {
 *         "hookEventName": "PostToolUse",
 *         "additionalContext": "<the continuation message>"
 *       }
 *     }
 *
 *   Claude Code surfaces `additionalContext` as a message-layer system
 *   reminder (cache-friendly per docs/research/prompt-architecture/02).
 *   The continuation message is already `<system-reminder>`-wrapped by
 *   `computeContinuationMessage()`.
 *
 * Matcher: `Bash` (the harness matches on tool name; the handler
 * narrows to the `luca state advance` shape and exits 0 silently for
 * every other Bash command).
 */
import { defineHook } from '../../define/hook.ts'

export const continuationMessagesHook = defineHook({
    id: 'continuation-messages',
    description:
        'PostToolUse continuation prompt for `luca state advance` — injects a mode-entry kick-off message via additionalContext when the pipeline advances.',
    event: 'PostToolUse',
    matcher: 'Bash',
    runtime: 'bun-script',
    // Relative to $CLAUDE_PROJECT_DIR. The compiler emits only the
    // settings.json slice (handler-copy is a Phase F-2 concern —
    // distribution via `luca init`). The TS source of this handler
    // lives at packages/luca-tools/src/hooks/continuation-messages/
    // handler.ts.
    handler: '.claude/hooks/continuation-messages.ts',
    timeoutMs: 5000,
    background: false,
})
