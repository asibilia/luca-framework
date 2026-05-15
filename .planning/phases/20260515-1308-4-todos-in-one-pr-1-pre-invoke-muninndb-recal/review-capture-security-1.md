# Review Capture — Security [Wave 1]

**Subagent**: reviewer
**Perspective**: security
**Timestamp**: 2026-05-15T17:23:00Z

## Findings

**VERDICT: REQUEST_CHANGES**

**MUST-FIX:**

- **[security] Flat workflowStateInputSchema `query` missing regex guard**
  - File: packages/luca-mastracode/src/tools/workflow-state.ts:686-692
  - Per-action recordRecallAction at line 377 has `.regex(/^[^\r\n\t]+$/)` but flat schema doesn't. JSON Schema description claims "CR/LF/tab rejected" but flat doesn't enforce it. Drift between public API surface and contract.
  - Fix: add `.regex(/^[^\r\n\t]+$/, 'query must not contain CR/LF/tab')` to flat schema query field.

- **[security] Flat schema `vault` + `mode` missing pattern guards**
  - File: packages/luca-mastracode/src/tools/workflow-state.ts:711-726
  - Strict recordRecallAction.vault enforces `/^[a-z0-9_-]+$/` (line 390); flat schema vault has no guard. Same drift for `mode` (flat:719, strict:401 `^[a-z0-9:_-]+$`).
  - Fix: add matching `.regex()` calls to flat schema vault + mode fields.

**SHOULD-FIX:**
- Regex pattern `/^[^\r\n\t]+$/` doesn't block `\x00`, `\v`, `\f`, `\x1b` (CWE-117 secondary vectors). Expand to `/^[^\r\n\t\x00\x0b\x0c\x1b]+$/` across all 5 sites (role, correlationId, model in record-subagent; query in record-recall + new flat schema additions).
- Add 4 new test.each entries for null-byte/vertical-tab/form-feed/ansi-escape rejection.
- Pre-Invoke Recall directive in shared-prefix.ts:27 doesn't tell agent to sanitize vault name from .planning/config.json — could pass through path-traversal/control chars to `muninn_recall`. Add prose: "Validate vault name matches `[a-z0-9_-]+`; fallback to `'default'` if mismatch."

**NOTE:**
- Hang-timeout is detection-only post-`Promise.all`, not pre-emptive abort. Documented limitation.
- `sanitizeTelemetryValue` + `sanitizeLogMessage` use `/[\r\n\t]/g`; if schema regex widens, helpers must update in lock-step.

**CONSOLIDATED:**
- MUST-FIX: 2
- SHOULD-FIX: 3
- NOTE: 2

<!-- usage: {"inputTokens":28941,"outputTokens":4123,"model":"claude-opus-4-5","outcome":"completed"} -->
