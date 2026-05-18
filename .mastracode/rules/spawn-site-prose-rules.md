---
severity: must-fix
applies-to: review
description: >
  Every subagent spawn site MUST use inline `// → record-subagent invoke/complete`
  directive comments AT each spawn site (NOT a fenced code-block at the top of the
  mode file). The `<!-- usage: -->` comment in subagent output MUST enumerate
  inputTokens, outputTokens, model, success, outcome (or `omit` if all unknown).
---

# Rule: Spawn-Site Prose Directives

## Pattern
- Mode files at `src/instructions/*.md` instrument subagent spawns by emitting
  `record-subagent` telemetry. Each spawn site needs an inline directive that the
  orchestrator agent reads at the moment of spawning.

## Anti-pattern (DON'T)
- Single fenced code-block at the top of the mode file describing the protocol —
  agents treat fenced blocks as documentation, not directives. Result: 0 telemetry.
- Round-number `durationMs` placeholders (`45000`, `60000`, `90000`, `120000`) in
  examples — agents copy them verbatim into real records.
- Hardcoded model strings like `"claude-opus-4-5"` — drift on model upgrade.
- Omitting fields from the usage comment when one is unknown — emit `outcome:
  completed_no_usage` and `omit` rather than `null` placeholders.

## Do
- Inline `// → record-subagent invoke` BEFORE each `subagent()` call. Inline
  `// → record-subagent complete` AFTER, with usage comment parsing.
- Use `Date.now() - ts` to compute `durationMs`. Capture `ts = Date.now()` BEFORE spawn.
- Use `${ts}` in correlationId, never hardcoded numbers.
- Required usage fields: inputTokens, outputTokens, model, outcome (success implicit
  from outcome). Omit the whole `<!-- usage: -->` comment if all are unknown.

## Symptom history
- PR #247 (commit 2e8047fad): fenced block bug — all 4 reviewers `success:false`.
- PR #253 (commit dfe10a729): fabricated round numbers in agent output.
