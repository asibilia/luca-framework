---
title: Enhance context monitoring hooks with metrics output and proactive checkpointing
area: hooks
created: 2026-03-13
source: conversation
priority: high
complexity: MODERATE
---

## Context

The existing `context-check-throttled.sh` hook detects context zone transitions but only emits warnings. Two enhancements needed: (1) write structured metrics JSON for the observer bar, and (2) proactively checkpoint to MuninnDB at zone boundaries as insurance alongside the PreCompact hook.

This bridges Decision 1 (proactive checkpointing enhancement) and Decision 4 (metrics pipeline) from `docs/memory-system/decisions.md`.

## Why

The PreCompact hook is the primary safety net, but it only fires at compaction time (~83.5% context). Proactive checkpoints at 50% and 70% provide earlier snapshots when context quality is still high. The metrics JSON enables the observer memory bar to visualize context state in real-time.

## Task

### Metrics Output

Enhance `src/hooks/scripts/context-check-throttled.sh`:

1. On every throttled check (60s interval), write `.planning/.context-metrics.json`:
   ```json
   {
     "timestamp": "ISO-8601",
     "transcript_bytes": 150000,
     "zone": "good",
     "usage_percent": 35,
     "tool_call_count": 42,
     "session_start": "ISO-8601",
     "checkpoints": []
   }
   ```
2. Tool call count: increment counter in the metrics file on each invocation
3. Session start: read from `.planning/STATE.md` or bridge
4. Checkpoints array: append entries when proactive checkpoints fire

### Proactive Checkpointing

Add checkpoint logic to the same hook:

1. At 50% context (good_end boundary): write first proactive checkpoint
   - Same 5-field MVP format as PreCompact checkpoint
   - Write to MuninnDB as `session:checkpoint-proactive` (distinct from PreCompact's `session:checkpoint`)
   - Write to `.planning/.context-checkpoint.json` (same fallback path — latest wins)
   - Throttle: only checkpoint once per zone transition (not every 60s check)
2. At 70% context (degrading_end boundary): write second checkpoint + existing warning
   - Overwrite the 50% checkpoint (latest state is more valuable)
   - Append to checkpoints array in metrics JSON
3. Zone transition detection: compare current zone to last known zone in metrics file

### MuninnDB Write

Use `curl` to POST to MuninnDB REST API:

```bash
curl -s -X POST "http://127.0.0.1:8476/api/v1/remember" \
  -H "Content-Type: application/json" \
  -d "{\"vault\":\"luca-framework\",\"concept\":\"session:checkpoint-proactive\",\"content\":\"...\"}"
```

Fail silently if MuninnDB is unavailable (fire-and-forget, don't break the hook).

## Acceptance Criteria

- `.planning/.context-metrics.json` written every 60s during active sessions
- Metrics include: timestamp, transcript_bytes, zone, usage_percent, tool_call_count, session_start, checkpoints
- Proactive checkpoint fires once when crossing 50% zone boundary
- Second proactive checkpoint fires once when crossing 70% zone boundary
- Checkpoints written to MuninnDB (`session:checkpoint-proactive`) and filesystem
- Zone transition detection prevents duplicate checkpoints
- MuninnDB write failures are silent (don't crash the hook)
- Existing warning behavior unchanged

## Dependencies

- `update-hook-schemas-18-events` — for type safety (optional — hook is a shell script)
- Consumed by `observer-context-window-bar` todo (reads the metrics JSON)

## References

- `docs/memory-system/decisions.md` — Decision 1 (proactive checkpoints) + Decision 4 (metrics pipeline)
- `src/hooks/scripts/context-check-throttled.sh` — file to modify
- `src/hooks/scripts/context-monitor.sh` — reference for zone calculation
- `.planning/config.json` — zone boundaries (planner.zone_boundaries)

## Notes

This hook already runs every 60s via PostToolUse throttle. The metrics write adds negligible overhead (~1ms file write). The proactive checkpoint only fires on zone transitions (rare events), so the MuninnDB write is infrequent.
