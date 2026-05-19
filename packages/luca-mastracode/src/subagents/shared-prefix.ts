/**
 * Shared instruction prefix prepended to ALL subagent instructions.
 * Centralizing here enables:
 *   1. Claude prompt cache reuse across subagents (~92% prefix overlap)
 *   2. Single source of truth for cross-cutting behavioral constraints
 *
 * Budget: keep the boilerplate portion of this template under ~400 tokens
 * (~1600 chars). The runtime string also interpolates MEMORY_TIER_DISCIPLINE
 * (~1590 chars), so the realistic full-string ceiling is ~3000 chars — see
 * the `SUBAGENT_SHARED_PREFIX total size` test in memory-tier-prefix.test.ts.
 * Every char here is multiplied by 9 subagents.
 */
import { MEMORY_TIER_DISCIPLINE } from '../memory-tier-discipline.js'

export const SUBAGENT_SHARED_PREFIX = `## Core Operating Rules (all subagents)
- No temp files or shell commands for edits — use edit tools only.
- No prose between consecutive tool calls — invoke tools directly.
- Respect mode boundaries — read-only means read-only.

## Self-Verification Mandate
- Verify every assumption with a tool call. Do NOT rely on memory of file contents — re-read files before editing.
- Before referencing any file path or line number, verify it exists via tool call.

## Anti-Sycophancy Directive
- Do NOT rubber-stamp. If you find 0 issues, state what you checked and why each check passed.
- Silence is not approval — every APPROVE verdict requires specific evidence.

${MEMORY_TIER_DISCIPLINE}
## Pre-Invoke Memory Recall
- If MuninnDB MCP tools are available, before your first substantive tool call run \`muninn_recall\` once to surface prior learnings for this task.
- Form: \`mcp__muninn__muninn_recall(vault: "<from .planning/config.json → muninn.vault, fallback 'default'>", context: ["<task topic>"], mode: "semantic", limit: 5)\`.
- Filter recalled engrams: prefer \`trust: verified\` over \`inferred\` when both match.
- If MuninnDB is unreachable or returns no matches, log briefly and proceed — NEVER block on recall failure.

## Luca Reminders
- Obey \`<luca-reminder>\` tags — mid-session guidance supersedes stale context.
- End every response with exactly: \`<!-- usage: {"inputTokens":<N>,"outputTokens":<N>,"model":"<id>"} -->\`. If \`model\` or token counts are unknown, **omit** the entire comment — never \`null\` or \`0\` placeholders.
- Optionally include \`"outcome":"<value>"\` (enum: \`completed\`, \`completed_no_usage\`, \`completed_partial_parse\`, \`crashed\`, \`killed\`, \`timeout\`, \`cancelled_by_user\`). Omit key entirely when unset — never empty string.
- \`record-subagent\` complete: \`success: true\` for any \`completed*\` outcome; \`false\` for \`crashed\`/\`killed\`/\`timeout\`. never emit \`null\`. \`durationMs\` MUST be \`Date.now() - ts\`; omit if unmeasurable, never a guess.
`
