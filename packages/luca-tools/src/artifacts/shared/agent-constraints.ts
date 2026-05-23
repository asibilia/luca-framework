/**
 * Mode-agent instruction shells.
 *
 * Every Luca mode-agent's prompt is sandwiched between a primacy-zone
 * "Core Operating Rules" block and a recency-zone "Reminders" block,
 * with universal hard constraints + memory-tier discipline in between.
 * This module owns those constants and the assembly helper.
 *
 * Authoring contract: each mode-agent's `instructions` field is composed
 * as `${CORE_OPERATING_RULES}\n${stage body}\n${getAgentConstraints()}`.
 * The D-2 compiler then appends the D1 guidance/telemetry/pipeline-
 * invocation preludes BELOW the rendered body.
 *
 * Ported from luca-mastracode/src/agent-constraints.ts. The mastracode
 * version also concatenated `alwaysApply` rules loaded from disk; that
 * dynamic-rule injection is intentionally NOT ported — rules are now
 * a first-class artifact kind (`defineRule`) and are loaded by luca-
 * core's rule-engine at runtime, not stitched into agent prompts.
 */
import { MEMORY_TIER_DISCIPLINE } from './memory-tier-discipline.ts'

/**
 * Core operating rules — compact summary prepended to EVERY mode-agent's
 * instructions (primacy zone) for attention-curve exploitation.
 */
export const CORE_OPERATING_RULES = `## Core Operating Rules
- No temp files or shell commands for edits — use edit tools only.
- No prose between consecutive tool calls — invoke tools directly.
- Respect mode boundaries — read-only means read-only.
`

/**
 * Universal hard constraints — appended to EVERY mode-agent's instructions.
 */
export const HARD_CONSTRAINTS = `
## Hard Constraints (all modes)

- **Never use temp files as an edit workaround** because it bypasses the harness's change tracking and makes modifications invisible to the review and verification pipeline. Do not write content to a temporary file and then copy, move, or \`cat\` it into the target file. Do not use \`sed\`, \`awk\`, \`cp\`, \`mv\`, \`tee\`, heredocs, or any shell command to bypass the edit tools. If you don't have permission to edit a file, that restriction is intentional — do not circumvent it.
- **Never shell out for file edits** because execute_command output is not tracked by edit tools, so changes cannot be verified, reviewed, or rolled back by the harness. All file modifications must go through the provided edit tools, not through shell. The only exception is running build/test/lint commands.
- **Respect mode boundaries** because mode restrictions separate concerns — a read-only mode that secretly writes files corrupts the verification guarantee of subsequent phases. If your mode is read-only, do not attempt any workaround to modify files. Report what needs to change and let the appropriate mode handle it.
- **Do NOT generate explanatory prose between consecutive tool calls** because text between tool calls wastes tokens and slows execution. If your next action is a tool call, invoke it directly.
`

export const RECENCY_REMINDERS = `## Reminders (re-read before every tool call)
- Check your mode. If read-only, do NOT write.
- No prose between tool calls.
- When done: transition the pipeline via the \`luca\` CLI or stop (stock modes).
`

/**
 * Build the trailing instruction block appended to every mode-agent's
 * prompt. Composed of: hard constraints + memory-tier discipline +
 * recency reminders.
 *
 * The mastracode version also injected `alwaysApply` rule prose loaded
 * from disk via `loadAlwaysApplyRules()`. That dynamic loader is NOT
 * ported — rules are now a first-class artifact (`defineRule`), loaded
 * by luca-core's rule-engine. Mode-agents that want to surface rules
 * to the model can do so via the `pipelineInvocations: ['rule-run']`
 * declaration on `defineAgent`, which the D-2 compiler expands into a
 * `## Pipeline Invocations` block describing the `luca rules run` call.
 */
export function getAgentConstraints(): string {
    return [
        '\n\n---\n',
        HARD_CONSTRAINTS,
        MEMORY_TIER_DISCIPLINE,
        RECENCY_REMINDERS,
    ]
        .filter(Boolean)
        .join('\n\n')
}
