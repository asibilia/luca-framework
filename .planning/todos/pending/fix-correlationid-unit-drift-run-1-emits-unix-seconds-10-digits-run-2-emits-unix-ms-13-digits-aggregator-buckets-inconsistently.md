---
title: "fix correlationId unit drift — Run 1 emits unix-seconds (10 digits), Run 2 emits unix-ms (13 digits) — aggregator buckets inconsistently"
area: telemetry
created: 2026-05-16
priority: medium
source: telemetry-analysis
---

## Task

fix correlationId unit drift — Run 1 emits unix-seconds (10 digits), Run 2 emits unix-ms (13 digits) — aggregator buckets inconsistently

## Problem

Two recent runs use different correlationId time units:
- Run 1 `run_mp77zzvl_6z0n3mb3`: 10-digit unix-seconds (`-1747332500`, `-1747333000`)
- Run 2 `run_mp7dcrpm_ue0yzcb0`: 13-digit unix-ms (`-1747344600000`, `-1747345700000`)

Both pass the regex `/^[a-z0-9._-]+$/` so neither is rejected, but the aggregator skill (`luca-telemetry-report`) won't bucket them consistently when computing per-correlation pairs.

## Root cause hypothesis

`Date.now()` returns ms by convention, but some mode prose examples show `${Math.floor(Date.now()/1000)}` or hardcoded seconds-form examples. Some mode files were fixed in PR #247 (review.md) but research.md / architect.md / finalize.md may still have stale seconds-form examples.

This is adjacent to existing todo #12 (`correlationId format audit`) but more specific: the existing todo focused on compact-ISO vs Date.now(); this is about seconds vs ms within `Date.now()`-form examples.

## Acceptance criteria

1. Canonicalize on `Date.now()` (ms, 13 digits) across all mode files.
2. Grep every mode/skill file for `correlationId` examples; flag any 10-digit or `Math.floor` form.
3. Add regression test: `correlationid-format-prose.test.ts` extended to assert no `Math.floor(Date.now()/1000)` or 10-digit literals in correlationId examples.
4. Document in `shared-prefix.ts`: "correlationId timestamps use ms (Date.now()), not seconds."

## Notes

Could be folded into todo #12 if scope expands. Filing separately to avoid scope creep on a focused fix.
