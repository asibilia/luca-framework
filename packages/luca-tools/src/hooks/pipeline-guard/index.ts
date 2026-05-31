/**
 * pipeline-guard hook — `PreToolUse` on `Bash` invocations.
 *
 * The hook fires before any `Bash` tool call and the handler narrows
 * to `luca state advance <step>` invocations, vetting the requested
 * pipelineStep transition against the legal-transition table in
 * `@alecsibilia/luca-core/orchestration`.
 *
 * Why PreToolUse on Bash rather than UserPromptSubmit on `/lu`:
 *
 *   The mastracode original watched Mastra `agent_end` events and
 *   nudged the agent to call `workflowState(action: "switch-mode")`.
 *   That subscription model doesn't exist in Claude Code — there is
 *   no continuous "agent turn" with a deterministic end event. The
 *   PIPELINE TRANSITION itself, however, IS deterministic: every
 *   transition flows through `luca state advance`, the single
 *   structured write surface for pipelineStep in the v13 write-surface
 *   design. Guarding that one command:
 *
 *     - Catches every transition (skills, agents, the user typing the
 *       command manually all funnel through the CLI).
 *     - Blocks BEFORE the state mutation, so a rejection is fully
 *       reversible (no rollback needed).
 *     - Composes with the existing stage-gate hook (which also fires
 *       on `Bash`).
 *
 *   UserPromptSubmit on `/lu` was the other candidate but `/lu`
 *   doesn't transition the pipeline directly — it invokes a skill,
 *   which calls `luca state advance` via Bash. Guarding `/lu` would
 *   miss transitions that originate in subagent loops or in direct
 *   CLI invocations from skill scripts.
 *
 * Matcher: `Bash` (the harness matches on tool name; the handler
 * narrows to the `luca state advance` shape and exits 0 for every
 * other Bash command).
 */
import { defineHook } from '../../define/hook.ts'

export const pipelineGuardHook = defineHook({
    id: 'pipeline-guard',
    description:
        'PreToolUse guard for `luca state advance` — blocks illegal pipelineStep transitions via the canonical legal-transitions table.',
    event: 'PreToolUse',
    matcher: 'Bash',
    runtime: 'bun-script',
    // Relative to $CLAUDE_PROJECT_DIR. The compiler currently emits
    // only the settings.json slice (the handler-copy step is a Phase F
    // concern — distribution). The TS source of this handler lives at
    // `packages/luca-tools/src/hooks/pipeline-guard/handler.ts` and
    // `luca init` (Phase F) will copy it to the path below.
    handler: '.claude/hooks/pipeline-guard.ts',
    timeoutMs: 5000,
    background: false,
})
