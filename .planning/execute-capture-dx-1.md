# Execute Review Capture — DX [Wave 1]

**Subagent**: reviewer
**Perspective**: dx
**Timestamp**: 2026-04-10T00:14:00Z

## Findings

## DX Review — PR #138

### MUST-FIX

None.

### SHOULD-FIX

- **Angle brackets in `buildContinuationMessage` output get HTML-entity-encoded** (`index.ts:274–291`)
  The `escapeSystemReminderBody` function escapes ALL `<` and `>` characters. The `buildContinuationMessage` output contains literal angle brackets — e.g., the triage continuation message at line 391 contains `<luca:2-research|luca:3-architect>`. After escaping, the agent sees `&lt;luca:2-research|luca:3-architect&gt;` in its kick-off message. Depending on whether MastraTUI HTML-decodes the system-reminder body before showing it to the agent, this may corrupt LLM instructions.

  Suggested fix: Verify MastraTUI's rendering contract. If it does NOT decode HTML entities before displaying to the agent, limit the escape to only prevent `</system-reminder>` tag closing (e.g., only escape literal `</system-reminder>` substrings, or at most only escape `<` followed by `/system-reminder>`).

- **JSDoc on `wrapInSystemReminder` does not warn about HTML entity encoding side effect** (`index.ts:283–291`)
  The JSDoc says "The body is escaped to prevent tag-injection attacks" but doesn't warn that ALL angle brackets/quotes in the body will be HTML-encoded, which affects readability of any code samples or paths in continuation messages.

- **No comment explaining the `currentIndex === -1` guard return** (`index.ts:252`)
  A future developer modifying the function won't know why we return `""` silently instead of throwing. Add: `// Non-pipeline modes (build, plan, fast, discuss) have no step index — skip header`.

- **`PIPELINE_STEP_IDS` naming is slightly misleading** (`index.ts:242`)
  The variable name `PIPELINE_STEP_IDS` could be confused with `PIPELINE_STEPS` (the Set). A clearer name like `ORDERED_STEP_IDS` makes the derivation relationship to `PIPELINE_STEPS_ORDERED` more obvious.

### NOTES

- `✓`, `→`, `○` are Unicode characters (U+2713, U+2192, U+25CB), not HTML entities — they pass through `escapeSystemReminderBody` unmodified. No concern there.
- `.gitignore` additions are grouped with the existing `# context monitoring (runtime artifacts)` comment — appropriate placement.
- ROADMAP restoration: 1,069 lines confirmed, full historical content from v8.5.1 through v9.3.0 present.
- No tests for pure helper functions (`buildPipelineProgressHeader`, `escapeSystemReminderBody`, `wrapInSystemReminder`). These are ideal unit test candidates — pure input/output functions with clear expected outputs.

### Verdict
APPROVED (subject to SHOULD-FIX follow-up on angle-bracket encoding concern)
