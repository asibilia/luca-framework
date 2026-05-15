---
title: "record-subagent failure-mode disambiguation — distinguish crashed / killed / empty-output / partial-parse instead of conflating all as success:false"
area: telemetry
created: 2026-05-14
updated: 2026-05-15
priority: high
source: run-mp5jq8br-analysis, run-mp706uzq-analysis
---

## Task

record-subagent failure-mode disambiguation — distinguish crashed / killed / empty-output / partial-parse instead of conflating all as success:false

---
confidence: high
externalResearch: false
priority: 2
---

## Problem

The `record-subagent` action currently collapses three distinct failure modes into a single `success: false` signal:

1. **Subagent crashed mid-execution** (harness rejected, threw, OOM)
2. **Subagent killed externally** (user Ctrl-C, parent timeout, MCP permission lockout)
3. **Subagent returned empty / malformed output** (no `<!-- usage: ... -->` comment, ran to completion but produced no parseable token data)
4. **Partial parse** (currently `record-subagent` with role:"fix" has emitted `success: true, model: null` — usage comment parsed inputTokens/outputTokens but model field was missing)

In run `run_mp5jq8br_o2oafvs8` (2026-05-14), 3 researchers were killed externally because they got stuck on an MCP server with bad permissions. Telemetry recorded all 3 as `success: false, tokens: null` — identical to a real crash. The orchestrator could not distinguish "user killed" from "subagent errored" from cross-run analysis.

## Why this matters

- **Cost attribution**: a killed subagent that ran 30min before the kill should be billed differently than one that crashed in 5s
- **Reliability metrics**: aggregator skill can't compute true crash rate if user kills are mixed in
- **Bug surfacing**: real crashes hide in the kill noise
- **Partial-parse silent corruption**: `success: true` with `model: null` is currently emitted by `fix` role — this is a parse bug masquerading as healthy

## Proposed Design

Extend `recordSubagentAction` schema with optional `outcome` field:

```ts
outcome: z.enum([
  'completed',      // ran to end, usage comment parsed clean
  'completed_no_usage',  // ran to end, no <!-- usage --> comment found
  'completed_partial_parse',  // ran to end, usage comment found but missing fields
  'crashed',        // harness/subagent error (existing success:false case)
  'killed',         // externally terminated (new — orchestrator detects via signal/timeout)
  'timeout',        // exceeded budget
]).optional()
```

Map current behavior:
- `success: true` + all token fields populated → `outcome: 'completed'`
- `success: true` + null model (fix role) → `outcome: 'completed_partial_parse'`
- `success: false` + non-zero durationMs → `outcome: 'crashed'`
- `success: false` + null durationMs + no error indication → `outcome: 'completed_no_usage'`

Keep `success: boolean` for backward compatibility; add `outcome` as the richer signal.

## Acceptance Criteria

1. `outcome` field added to `recordSubagentAction` Zod schema (optional, enum, max-length safe)
2. Prose in all 6 mode instruction files updated to pass `outcome` where determinable
3. `record-subagent.test.ts` covers each outcome variant
4. Aggregator skill (`luca-telemetry-report`) reads `outcome` when present, falls back to `success` heuristic
5. Existing `fix` role `success:true, model:null` case maps to `outcome: 'completed_partial_parse'` — no longer silently emits as healthy
6. Documentation in `shared-prefix.ts` mentions the new outcomes briefly

## Notes

- This SUPERSEDES the prior medium-priority todo `fix-record-subagent-fix-role-success-true-with-null-model-field-partial-usage-parse` — that fix becomes a special case of this richer signal.
- Detection of `killed` requires orchestrator-side instrumentation (signal handlers / process tree monitoring) — out of scope for self-reported telemetry. May need a separate `killed` event emitted by the parent process when SIGTERM is propagated.
- `timeout` is also orchestrator-detected — currently no timeout enforcement exists at subagent level.
- See run `run_mp5jq8br_o2oafvs8` for the worked example that motivated this.

