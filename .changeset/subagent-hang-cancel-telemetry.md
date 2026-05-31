---
"@alecsibilia/luca": patch
---

Add `cancel-subagent` workflowState action + `subagent.cancelled` telemetry kind + `cancelled_by_user` outcome enum value.

Closes the diagnostic gap surfaced by `run_mpct9yy0_qfn0vsy5`: when the user manually kills a hung subagent (luca:2-research stuck 30m, luca:5-review prelude stuck 55m, both observed in that run), there was no way to record the cancellation in telemetry. Long `mode.start` → `mode.end` deltas with no matching `subagent.complete` were indistinguishable from pipeline stalls, sending diagnostic effort in the wrong direction.

**New action:**

```
workflowState({
  action: 'cancel-subagent',
  role: '<role>',
  correlationId: '<id paired to original invoke>',
  cancelReason: '<short reason, max 512 chars>',
  partialDurationMs: <elapsed ms from invoke to kill | null>,
})
```

Emits a `subagent.cancelled` telemetry record with `meta.outcome` fixed at `cancelled_by_user` and `meta.success` fixed at `false`. Aggregators correlate by `role + correlationId` — `subagent.invoke` + `subagent.cancelled` forms a complete pair without a matching `.complete` event.

**Other changes:**

- `TelemetryKind` union extended with `'subagent.cancelled'`.
- `outcome` enum extended with `'cancelled_by_user'` in both per-action `recordSubagentAction` schema and the flat `workflowStateInputSchema` mirror (also reflected in `SUBAGENT_SHARED_PREFIX` enum list).
- `cancel-subagent` registered in `WORKFLOW_ACTION_SCHEMAS` (drift detector auto-coverage), `WORKFLOW_STATE_ACTIONS`, and the tool-manifest allowlist for research / architect / execute / review / finalize.
- `execute.md` now documents the `cancel-subagent` call shape with an explicit "do NOT emit `subagent.complete`" rule on killed calls.
- `review.md` Step 4 spawn directive includes a one-line cancel reminder.
- 15 new tests (12 cancel-subagent action behavior + 3 prose presence).

**Not in this PR (deferred):**

- Orchestrator-side hang watchdog (`setInterval` polling) — requires harness integration not yet available.
- TUI cancel hotkey — separate UX work.
- Aggregator `luca-telemetry-report` failure-mode breakdown for `cancelled_by_user` — small follow-up.
