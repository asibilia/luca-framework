# Code Review — Wave 1

**Date**: 2026-05-15
**Complexity**: COMPLEX
**Review Iteration**: 1 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Pre-invoke recall directive in shared-prefix | MET | src/subagents/shared-prefix.ts:25-30 — 4-bullet section between MEMORY_TIER_DISCIPLINE and Luca Reminders, hedged for non-MCP subagents |
| Hang-timeout prose in research.md | MET | src/instructions/research.md:35 — Date.now() elapsed-check + outcome:"timeout" + 3/5 partial-results rule |
| Outcome enum flag-list expanded in SKILL.md | MET | skills/luca-telemetry-report/SKILL.md:122 — `{crashed, killed, timeout, completed_no_usage, completed_partial_parse}` |
| model field CR/LF guard | MET (PARTIAL — see MUST-FIX) | workflow-state.ts:339-344 + :656-664 — regex applied to record-subagent model in both schemas |
| Stale model ID fixed | MET | src/instructions/execute.md:161 — `anthropic/claude-opus-4-7` |
| Regression tests added | MET | workflow-state-actions.test.ts (parametric + model CR/LF), memory-tier-prefix.test.ts (recall + size), subagent-telemetry-prose.test.ts (timeout) |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.1s |
| bun-test | pass (420/420) | 0.5s |
| eslint | skipped | - |

## Code Review Findings

### MUST-FIX (2)

- **[security] Flat schema `query` field missing CR/LF/tab regex guard**
  - File: packages/luca-mastracode/src/tools/workflow-state.ts:686-692
  - Strict `recordRecallAction.query` at line 377 has `.regex(/^[^\r\n\t]+$/)` but flat schema doesn't. JSON Schema description ("Capped at 512 chars; CR/LF/tab rejected") promises enforcement the flat schema doesn't deliver. Anthropic API uses flat schema for tool-call validation — defense-in-depth gap.
  - Fix: add `.regex(/^[^\r\n\t]+$/, 'query must not contain CR/LF/tab')` to flat schema query field.

- **[security] Flat schema `vault` + `mode` fields missing pattern guards**
  - File: packages/luca-mastracode/src/tools/workflow-state.ts:711-726
  - Strict `recordRecallAction.vault` enforces `/^[a-z0-9_-]+$/` (line 390); flat schema vault has no guard. Same drift for `mode` (flat:719, strict:401 `^[a-z0-9:_-]+$`). Same kind of API-surface drift as the model field originally had.
  - Fix: add `.regex(/^[a-z0-9_-]+$/, 'vault must be lowercase alnum + _ -')` to flat schema vault; add `.regex(/^[a-z0-9:_-]+$/, 'mode must be lowercase alnum + :_-')` to flat schema mode.

### SHOULD-FIX (3)

- **[security] Expand regex character class to block additional CWE-117 vectors** (NOTE — escalate only if user requests stricter guarantees)
  - Files: workflow-state.ts:326, 332, 342, 377, 664
  - Current `/^[^\r\n\t]+$/` doesn't block `\x00`, `\v`, `\f`, `\x1b`. Out of scope for this PR — pre-existing pattern across all guarded fields.

- **[security] Pre-Invoke Recall directive should instruct vault sanitization**
  - File: src/subagents/shared-prefix.ts:27
  - Add prose: "Validate vault name matches `[a-z0-9_-]+`; fallback to `'default'` if it doesn't."

- **[testing] Add CR/LF guard test coverage for additional control characters**
  - File: src/__tests__/workflow-state-actions.test.ts:1484-1499
  - Add test.each entries for null byte / vertical tab / form feed / ANSI escape if regex is widened.

### NOTE (2)

- **[arch] Hang-timeout is detection-only post-Promise.all**, not pre-emptive abort. Mastra harness has no abort API. Documented limitation; orchestrator-side timeout is best-effort.
- **[arch] If schema regex widens later**, `sanitizeTelemetryValue` + `sanitizeLogMessage` helpers must update in lock-step (currently use `/[\r\n\t]/g`).

## Verdict

ISSUES_FOUND — 2 MUST-FIX (flat-schema regex drift on query + vault/mode).

Iteration plan: apply both MUST-FIX patches in single execute wave, re-test, transition back to review.
