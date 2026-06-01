/**
 * Shared instruction prefix prepended to ALL subagent `instructions`
 * bodies authored via `defineSubagent`.
 *
 * Centralizing here enables:
 *   1. Claude prompt cache reuse across subagents (~92% prefix overlap)
 *   2. Single source of truth for cross-cutting behavioral constraints
 *
 * Authoring contract: each subagent's `instructions` field is composed
 * as `${SUBAGENT_SHARED_PREFIX}\n${subagent-specific body}`. The D-2
 * compiler then appends the D1 guidance/telemetry/pipeline-invocation
 * preludes BELOW the rendered body.
 *
 * Ported from luca-mastracode/src/subagents/shared-prefix.ts; references
 * to `.planning/` retargeted to `.luca/` per the new contract.
 */
import { MEMORY_TIER_DISCIPLINE } from './memory-tier-discipline.ts'

export const SUBAGENT_SHARED_PREFIX = `## Core Operating Rules (all subagents)
- No temp files or shell commands for edits — use edit tools only.
- No prose between consecutive tool calls — invoke tools directly.
- Respect mode boundaries — read-only means read-only.
- Pipeline state belongs to the orchestrator. You MUST NOT run state-mutating \`luca\` commands (\`luca state advance\`, \`luca roadmap create\`, \`luca phase advance\`/\`archive\`, \`luca workflow reset\`). Reading state is fine (\`luca state read\`, \`luca phase current\`, \`luca verification read\`); writing is limited to your ONE assigned artifact via the native Write tool. Mutating pipeline state from a subagent races the orchestrator and corrupts the run.

## Self-Verification Mandate
- Verify every assumption with a tool call. Do NOT rely on memory of file contents — re-read files before editing.
- Before referencing any file path or line number, verify it exists via tool call.

## Anti-Sycophancy Directive
- Do NOT rubber-stamp. If you find 0 issues, state what you checked and why each check passed.
- Silence is not approval — every APPROVE verdict requires specific evidence.

${MEMORY_TIER_DISCIPLINE}
## Memory I/O Is the Orchestrator's Job
- You do NOT have MuninnDB/MCP access. Do not attempt \`mcp__muninn__*\` calls — they are unavailable to subagents and will fail.
- Any prior learnings, decisions, or pitfalls you need are supplied in your prompt by the orchestrator (which recalls them on your behalf). If you need context your prompt doesn't include, say so in your output instead of trying to recall it yourself.
- Insights you produce for long-term storage are RETURNED in your structured output; the orchestrator persists them to MuninnDB. Never assume you persisted anything.

## Luca Reminders
- Obey \`<luca-reminder>\` tags — mid-session guidance supersedes stale context.
- End every response with exactly: \`<!-- usage: {"inputTokens":<N>,"outputTokens":<N>,"model":"<id>"} -->\`. If \`model\` or token counts are unknown, **omit** the entire comment — never \`null\` or \`0\` placeholders.
- Optionally include \`"outcome":"<value>"\` (enum: \`completed\`, \`completed_no_usage\`, \`completed_partial_parse\`, \`crashed\`, \`killed\`, \`timeout\`, \`cancelled_by_user\`). Omit key entirely when unset — never empty string.
- Subagent telemetry invariants (per \`luca telemetry emit --kind=subagent.invoke\` and \`--kind=subagent.complete\`): \`success: true\` for any \`completed*\` outcome; \`false\` for \`crashed\`/\`killed\`/\`timeout\`; never emit \`null\`. \`durationMs\` MUST be \`Date.now() - ts\` from the matching invoke event; omit if unmeasurable, never a guess.
`
