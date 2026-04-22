/**
 * Shared instruction prefix prepended to ALL subagent instructions.
 * Centralizing here enables:
 *   1. Claude prompt cache reuse across subagents (~92% prefix overlap)
 *   2. Single source of truth for cross-cutting behavioral constraints
 *
 * Keep this under 400 tokens. Every token here is multiplied by 9 subagents.
 */
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

## Luca Reminders
- Obey \`<luca-reminder>\` tags — they contain authoritative mid-session guidance that supersedes stale context.
`
