---
title: "NaN-safe number handling + null-vs-zero rule pack"
area: rule-packs
created: 2026-05-17
priority: medium
source: pr-feedback-audit
---

## Task

NaN-safe number handling + null-vs-zero rule pack

## Pattern

Two recurring numeric-safety pitfalls in any TS/Zod codebase:

1. **NaN silent acceptance** — `z.number()` accepts NaN as valid. Any computation producing NaN (e.g. `Date.now() - undefined`, `parseInt('')`, malformed date string) writes a NaN to the record. Downstream consumers (Zod re-parse, JSON.stringify, comparisons) silently drop or corrupt the record.
2. **`?? 0` collapses unknown into zero** — common shortcut for nullable numeric fields, but biases aggregate stats (rate calculations, hit ratios). "Unknown" should propagate as null/undefined, not silently become 0.

Both observed in luca-framework telemetry layer (PR #239 dropped `wave.end` records via NaN durationMs; `verifiedCount ?? 0` skewed recall hit-rate). Generic patterns applicable to any TS project.

## Deliverables

1. **Framework utility module** with NaN-safe helpers:
   - `finiteOrNull(n)` — returns null if `!Number.isFinite(n) || n < 0` (configurable)
   - `safeDuration(startMs, endMs)` — convenience wrapper for the common `Date.now() - start` pattern
2. **Zod helper**: `z.number().nanSafe()` refinement (rejects NaN explicitly) and `z.number().nullableSafe()` (rejects NaN, allows null).
3. **Rule pack entry**: flag `?? 0` on fields typed `number | null | undefined` — require explicit `Number.isFinite()` guard or use of `finiteOrNull`.
4. **Rule pack entry**: flag `z.number()` calls in tool input schemas that don't use `.nanSafe()` (with allowlist comment).
5. **Dogfooding**: apply to luca's telemetry layer; remove ad-hoc NaN guards in favor of the helpers.

## Acceptance

- [ ] Utility module with NaN-safe helpers + unit tests (NaN, Infinity, negative, normal)
- [ ] Zod refinements available and documented
- [ ] Rule pack flags `?? 0` on nullable numeric types
- [ ] Rule pack flags raw `z.number()` in tool schemas
- [ ] luca-framework migrated; ad-hoc `Number.isFinite` checks removed

## Memory References

- `01KREQJY7CHMQBYF3YX32GJ5KQ` — NaN-from-malformed-date-string-drops-Zod-record
- `01KRM40JE1H4EGD4C5E06DKAMX` — null-coalesce-collapses-unknown-into-zero

## Source

PR feedback audit 2026-05-17 (Theme 5). Generic TS/Zod pattern.
