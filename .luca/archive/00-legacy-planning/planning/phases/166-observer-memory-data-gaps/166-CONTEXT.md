# Phase 166 Context: Fix Observer Memory Page Data Gaps

## Decision 1: Path Resolution Fix [researched]

**Decision:** Apply the `findProjectRoot()` pattern from `/api/context-metrics/route.ts` to both `/api/muninn/checkpoint/route.ts` and `/api/muninn/zone-history/route.ts`. This function walks up from cwd until it finds `.planning/` directory, handling the Next.js dev mode cwd issue.

## Decision 2: Checkpoint Route Data Source [researched]

**Decision:** The checkpoint route should read `.context-metrics.json` (written every ~60s by statusline hook) for live session data. The `.context-checkpoint.json` file only exists after compaction events and is stale during normal operation. Rename the route's file reader to use `.context-metrics.json` and parse it with the existing `ContextMetricsSchema`.

## Decision 3: Observation MuninnDB Writers [researched]

**Decision:** The `context-check-throttled.ts` hook (Phase 162) already writes `session:observation-*` engrams to MuninnDB on zone transitions. However, these only fire when zones CHANGE (peak→good, good→degrading). During steady-state sessions in the "peak" zone, no observations are written.

Fix: Add an initial observation write on first hook invocation (regardless of zone transition) so the observations route has data from session start. This is a small addition to `context-check-throttled.ts`.

For `metric:*` engrams (recall effectiveness), these are only written by the phase-execute verification pipeline. During non-autopilot sessions, no metrics exist — this is expected. The recall effectiveness section should show "No data yet — metrics are collected during phase execution" instead of a generic empty state.

## Files to Modify

1. `packages/luca-observer/app/api/muninn/checkpoint/route.ts` — findProjectRoot() + read .context-metrics.json
2. `packages/luca-observer/app/api/muninn/zone-history/route.ts` — findProjectRoot()
3. `src/hooks/impl/context-check-throttled.ts` — add initial observation write
4. `packages/luca-observer/components/memory/recall-effectiveness.tsx` — improve empty state message (if component exists)
