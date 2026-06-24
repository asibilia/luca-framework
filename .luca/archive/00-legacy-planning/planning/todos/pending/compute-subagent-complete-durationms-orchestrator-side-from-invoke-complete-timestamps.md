---
title: "Compute subagent.complete durationMs orchestrator-side from invoke/complete timestamps"
area: telemetry
created: 2026-05-13
priority: medium
source: run-analysis
---

## Task

Compute subagent.complete durationMs orchestrator-side from invoke/complete timestamps

## Symptom

Observed in run `run_mp4auyvh_13axajuq`: every `subagent.complete` record has `durationMs: null`.

The harness does not expose per-subagent wall time to the orchestrator, so the executor agent has no value to pass when calling `workflowState({action: "record-subagent", event: "complete", ...})`.

But the data IS computable orchestrator-side: pair the `subagent.invoke` event with its matching `subagent.complete` event via `correlationId` and subtract `ts` timestamps.

## Approach options

**Option A — Compute at write time (workflow-state.ts)**: When `record-subagent` with `event: "complete"` is called, read the most recent `.planning/telemetry/<runId>.jsonl` entries, find the matching `subagent.invoke` by `correlationId`, compute `Date.now() - new Date(invokeTs).getTime()`, write into `overrides.durationMs`. Pro: data is in JSONL immediately. Con: O(n) tail scan on every complete; race condition if invoke not flushed yet.

**Option B — Compute at read time (aggregator skill, #39)**: Aggregator pairs invoke/complete by correlationId during analysis. `durationMs` stays null on the wire but is derived in reports. Pro: no write-path complexity. Con: each consumer reimplements pairing logic.

**Option C — Compute in shared helper**: Add `appendSubagentComplete(correlationId, role, ...)` that does the tail scan + pairing internally. Workflow-state action delegates to it. Pro: encapsulated. Con: still O(n) per complete.

## Recommendation

Option A. The tail scan is bounded (one run's events, max ~50–100 subagents), and `appendTelemetry` is already fail-safe so a missing match falls back to `null` gracefully. Encode in `recordSubagent` action in `workflow-state.ts`.

## Acceptance criteria

- [ ] When `record-subagent` is called with `event: "complete"` and a valid `correlationId`, look up the matching `subagent.invoke` entry in the current run's JSONL
- [ ] If found: `durationMs = Date.now() - new Date(invokeRecord.ts).getTime()` (clamped to finite + non-negative via `finiteOrNull`)
- [ ] If not found (e.g. log gap, race): `durationMs: null` (current behavior)
- [ ] Add 3 tests: (a) pairing happy path, (b) missing invoke → null, (c) malformed invoke ts → null
- [ ] Verify on next run that `subagent.complete` events have non-null `durationMs`

## Related

- PR #243 (#350) — defined the `subagent.invoke`/`subagent.complete` schema with `durationMs` field
- Todo #39 — cross-run aggregator skill (could be punted there if Option A is too risky)
