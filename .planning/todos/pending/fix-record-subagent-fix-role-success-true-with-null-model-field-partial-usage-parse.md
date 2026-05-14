---
title: "fix-record-subagent-fix-role-success-true-with-null-model-field-partial-usage-parse"
area: telemetry
created: 2026-05-13
priority: low
source: telemetry
---

## Task

fix-record-subagent-fix-role-success-true-with-null-model-field-partial-usage-parse

## Problem

The `fix` role subagent (in-wave review→fix loop) reports `success: true` with token values populated but `model: null`. Suggests the usage comment is being partially parsed — tokens extracted, model field dropped or missing from the source comment.

## Evidence

Run `run_mp4kxfei_qo4q0o4g`, wave 3:

```json
{
  "role": "fix",
  "correlationId": "fix-review-1747185700",
  "inputTokens": 8000,
  "outputTokens": 1500,
  "success": true,
  "model": null
}
```

Suspicious signals:
- `model: null` while `success: true` — partial parse, not crash
- Token values are suspiciously round (`8000` / `1500`) — could be a hardcoded fallback/estimate, not real self-report

## Possible root causes

1. `fix` role's usage comment template is missing `"model"` field entirely (older format like `<!-- usage: {"in": N, "out": M} -->`)
2. Fix subagent prompt template was never updated to match the canonical `<!-- usage: {"inputTokens":N,"outputTokens":N,"model":"<id>"} -->` format
3. Token values being defaulted to placeholder constants when comment is malformed

## Fix

- Locate the `fix` role's instruction (likely in `execute.md` or a dedicated fix-subagent prose block)
- Update usage self-report instruction to canonical format with all 3 fields
- Verify the values aren't being defaulted/estimated — should be `null` if parse fails, not round numbers

## Acceptance

- `fix` role emits `model: "claude-sonnet-4-5"` (or actual model) on success
- If usage comment is malformed: all 3 fields null (no partial fallback)
- Test: telemetry parser returns null on missing `model` field, doesn't default tokens

## Related

- `fix-verifier-subagent-missing-usage-self-report-comment-in-output` — same family of self-report gaps
- `fix-subagent-usage-self-report-drift-reviewer-dx-and-reviewer-simpl-emit-success-without-usage-comment` (done, PR #245) — pattern for fixing
