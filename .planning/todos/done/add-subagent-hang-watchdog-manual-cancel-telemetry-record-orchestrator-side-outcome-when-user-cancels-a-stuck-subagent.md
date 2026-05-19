---
title: "add subagent hang-watchdog + manual-cancel telemetry — record orchestrator-side outcome when user cancels a stuck subagent"
area: telemetry
created: 2026-05-19
priority: critical
source: run-analysis
---

## Task

add subagent hang-watchdog + manual-cancel telemetry — record orchestrator-side outcome when user cancels a stuck subagent

## Evidence — run_mpct9yy0_qfn0vsy5
- luca:2-research mode: 30m 47s, **zero subagent.invoke records, manually cancelled by user**
- luca:5-review mode: 55m pre-fanout gap, **first reviewer hang manually cancelled before fanout completed**
- Telemetry shows long mode.start → mode.end deltas with no record of the cancellation event or hang reason

## Root cause
Subagent hangs are invisible to telemetry today. When user manually kills a stuck subagent:
1. No `subagent.invoke` is ever emitted (research hang — agent stuck before first record-subagent call)
2. No `subagent.complete` is ever emitted (review hang — agent stuck mid-fanout)
3. Mode durations look pathological (30m research, 55m review prelude) but the cause is invisible — looks like a pipeline bug instead of a user cancellation

## Design
1. **Pre-invoke heartbeat**: subagent must call `record-subagent invoke` BEFORE any other tool call. If a mode runs >5m without any subagent.invoke, emit a `mode.stall` telemetry record with `stallDurationMs` and `lastActivityKind`.
2. **Manual-cancel record**: add `subagent.cancelled` telemetry kind. CLI/TUI surfaces a manual-cancel hotkey that emits this record before kill, including `cancelReason`, `partialDurationMs`, `lastObservedActivity`.
3. **Outcome enum extension**: add `cancelled_by_user` to `outcome` enum so aggregator can distinguish user-cancel from crash/kill/timeout.
4. **Watchdog**: orchestrator-side timer that emits `mode.stall_warning` if no subagent activity for 5m, `mode.stall_critical` at 15m. Surfaces in TUI so user knows to cancel sooner.

## Touched files
- `src/state/telemetry.ts` — `TelemetryKind` += `'mode.stall' | 'subagent.cancelled' | 'mode.stall_warning' | 'mode.stall_critical'`
- `src/tools/workflow-state.ts` — new `cancel-subagent` action with `cancelReason` field
- `outcome` enum in `recordSubagentAction` + `shared-prefix.ts` += `'cancelled_by_user'`
- `src/index.ts` — heartbeat watchdog (setInterval, cleared on mode.end)
- TUI integration for cancel hotkey (out of scope for this PR — file follow-up)

## Defers / related
- Replaces todos #23 + #24 (which mis-diagnosed user-cancellation as pipeline stalls)
- Related: #40 (record-subagent failure-mode disambiguation) — `cancelled_by_user` is a new failure mode that fits there too. Resolve as part of this work.
