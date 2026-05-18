---
severity: must-fix
applies-to: review
description: >
  Use `finiteOrNull` for `durationMs` guards and `clampTokens` for
  `inputTokens`/`outputTokens`. Never `?? 0` on optional/nullable numerics —
  it collapses "unknown" with "zero" and biases aggregations.
---

# Rule: NaN-Safe Number Handling

## Pattern
- `src/util/numeric.ts` exports `finiteOrNull(n)` (returns null on non-finite/negative)
  and `clampTokens(n, max?)` (returns null on non-finite/negative/excess, floors).

## Anti-pattern (DON'T)
- `priorDurationMs ?? 0` — collapses unknown into zero. Zod silently drops records
  containing NaN derived from malformed timestamps.
- `verifiedCount ?? 0` when `resultCount` is null — emits `0/null` instead of `null/null`,
  poisoning hit-rate aggregations.

## Do
- `durationMs: finiteOrNull(Date.now() - startedAt)` — null-propagate on missing start.
- `inputTokens: clampTokens(reported)` — null on garbage, floor floats, reject >10M.
- For paired fields (verifiedCount vs resultCount): if outer is null, inner MUST be null.

## Symptom history
- PR #239 (commit dfe10a729): NaN derived from malformed `waveStartedAt` → Zod silent drop.
- PR #248: `verifiedCount ?? 0` collapsed unknown with zero.
