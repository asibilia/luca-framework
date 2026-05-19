---
title: "fix correlationId unix-ms fabrication — all timestamps in run_mpct9yy0 end in 00000 (round seconds masquerading as ms)"
area: telemetry
created: 2026-05-19
priority: medium
source: run-analysis
---

## Task

fix correlationId unix-ms fabrication — all timestamps in run_mpct9yy0 end in 00000 (round seconds masquerading as ms)

## Evidence
All correlationIds in run_mpct9yy0_qfn0vsy5 end in `00000`:
- `discussion-1747672200000`
- `plan-reviewer-1747672500000`
- `executor-1747672800000`
- `verifier-1747673600000`
- `reviewer-arch-1747673800000`

Real `Date.now()` returns ms with full precision (e.g. `1747673847123`). Round `00000` suffix means either:
1. Agent is generating fake unix-ms by appending `000` to a unix-seconds value, OR
2. Date.now() is being floor-rounded to nearest second somewhere.

## Fix
Add a stronger correlationId-format-prose test:
```ts
// correlationId must NOT end in exactly "000" (3+ trailing zeros is statistically improbable for real Date.now())
expect(correlationId).not.toMatch(/(0{3,})$/)
```
Real `Date.now()` ends in `000` with probability 1/1000 — single occurrence in a run is fine, but **all** correlationIds ending in `00000` is fabrication.

Audit which mode prose files leak `<ts>` with rounded examples. Replace with realistic ms timestamps like `1747673847123`.
