# Execute Review Capture — Security [Wave 1]

**Subagent**: reviewer
**Perspective**: security
**Timestamp**: 2026-04-10T00:14:00Z

## Findings

## Security Review — PR #138

### MUST-FIX

None.

### SHOULD-FIX

- **Over-broad XML escaping corrupts LLM instruction content** (`index.ts:274–281`)
  `escapeSystemReminderBody` escapes ALL `<` and `>` (not just `</system-reminder>`). The `buildContinuationMessage` output contains angle brackets used as option notation (e.g., `<luca:2-research|luca:3-architect>` in the triage continuation at line 391). After escaping these become `&lt;luca:2-research|luca:3-architect&gt;`. If MastraTUI does NOT HTML-decode the system-reminder body before sending it to the LLM agent, the agent reads corrupted instructions.

  This is a correctness/security boundary concern: the escape was added to prevent tag injection (good) but has the side effect of corrupting content the LLM agent relies on.

  Suggested fix: Use a narrower escape — only escape sequences that would break the `<system-reminder>` XML tag structure. The minimal safe escape is: replace `</system-reminder` with `<\/system-reminder` (backslash-escaped) or `&lt;/system-reminder`. All other `<` and `>` in prose are harmless to the regex parser since it uses a lazy `[\s\S]*?` body match and only terminates on `</system-reminder>`.

- **Trust boundary documentation missing** (`index.ts:283–291`)
  `state.intent` and `state.affectedAreas` come from `.planning/luca-state.json` on disk. The JSDoc doesn't document this trust boundary — a future developer may not realize the body includes user/agent-controlled content. Add a comment: "body includes user-controlled fields from luca-state.json (intent, affectedAreas) — escaping is applied as a defense-in-depth measure."

### NOTES

- **Escape ordering is correct**: `&` is escaped first (`/&/g, "&amp;"`), preventing double-encoding. Subsequent replacements operate on the already-escaped string without re-processing ampersands.
- **Unicode bypass not possible**: MastraTUI's regex uses literal `</system-reminder>` — no Unicode normalization or lookalike bypass possible since the tag name contains only ASCII characters.
- **Trust boundary is adequately constrained**: `event.modeId` comes from harness internals (not user input). `state.intent` comes from triage agent output stored to disk — this is machine-controlled content, but it's still prudent to escape it.
- **No credential or secret handling**: New code deals exclusively with mode IDs, static label strings, and workflow state fields. No auth/authz/secret-storage paths touched.

### Verdict
APPROVED (with SHOULD-FIX advisory on escaping scope)
