---
title: "fix telemetry contradiction — success:false with outcome:&quot;completed&quot; on reviewer-tq; schema should enforce mutual exclusion"
area: telemetry
created: 2026-05-19
priority: high
source: run-analysis
---

## Task

fix telemetry contradiction — success:false with outcome:&quot;completed&quot; on reviewer-tq; schema should enforce mutual exclusion

## Evidence
- `run_mpct9yy0_qfn0vsy5` reviewer-tq: `success:false, outcome:"completed", inputTokens:null, outputTokens:null, model:null`
- `completed` means no crash/kill/timeout — must imply `success:true`. If self-report failed, outcome must be `completed_no_usage` or `completed_partial_parse`.

## Fix
Add cross-field refinement in `recordSubagentAction` schema:
```ts
.refine(d => !(d.success === false && d.outcome === 'completed'),
  { message: 'success:false requires outcome in {crashed,killed,timeout,completed_no_usage,completed_partial_parse}' })
```

Also add reviewer.ts prose: when emitting `success:false`, outcome MUST reflect the failure mode.
