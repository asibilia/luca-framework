---
phase: 166
plan: 1
status: complete
---

# Phase 166 SUMMARY: Fix Observer Memory Page Data Gaps

## Result

All 4 tasks completed. No TypeScript errors introduced. No drift detected.

## Tasks Completed

### Task 1: Fix checkpoint route (path resolution + correct data source)

**File:** `packages/luca-observer/app/api/muninn/checkpoint/route.ts`

- Added `findProjectRoot()` async function (verbatim pattern from `/api/context-metrics/route.ts`) using `access` from `node:fs/promises` and `resolve`/`join` from `node:path`
- Added env-var override: `LUCA_PROJECT_DIR > WORKSPACE_ROOT > findProjectRoot(cwd)`
- Switched file read from `.context-checkpoint.json` to `.context-metrics.json` (the always-present live session file written every ~60s by the statusline hook)
- Added inline `ContextMetricsSchema` (Zod) to parse the live metrics file
- Preserved the `checkpoint_age_seconds` computation from `checked_at`
- Still validates the outgoing response through `CheckpointResponseSchema` before returning

### Task 2: Fix zone-history route (path resolution)

**File:** `packages/luca-observer/app/api/muninn/zone-history/route.ts`

- Added `findProjectRoot()` verbatim from the reference route
- Added env-var override: `LUCA_PROJECT_DIR > WORKSPACE_ROOT > findProjectRoot(cwd)`
- `filePath` now uses the resolved workspace root instead of bare `process.cwd()`
- All other logic (single-snapshot wrapping, `ZoneHistoryResponseSchema` validation) unchanged

### Task 3: Add initial observation write to context-check-throttled hook

**File:** `src/hooks/impl/context-check-throttled.ts`

- Added `isFirstInvocation` boolean set to `!existsSync(throttleFile)` before the throttle read/exit logic
- Restructured the existing throttle guard: only reads + checks the throttle file when `!isFirstInvocation` (avoids the non-existent file read on first run)
- Added a new `if (isFirstInvocation)` block after the zone-transition observation block that writes a `session:observation-{timestamp}` engram with `source: "session_start"` and tags `["session", "observation", "session-start"]`
- The new block reuses the same git branch / diff / STATE.md phase context reading pattern used by the zone-transition block
- Entire block is wrapped in try/catch — hook still exits 0 unconditionally

**Deviation (Rule 3 — Blocking):** `SessionObservation["source"]` type was a closed enum that did not include `"session_start"`. Added `"session_start"` to `OBSERVATION_SOURCES` in `src/hooks/__schemas/hook.schemas.ts` so the TypeScript type accepts the new source value.

### Task 4: Improve recall-effectiveness empty state message

**File:** `packages/luca-observer/components/memory/recall-effectiveness.tsx`

- Updated `EmptyState` message from `"Metrics are captured during memory operations."` to `"No data yet — metrics are collected during phase execution, not manual memory operations. Run a Luca phase to populate this section."`
- Only the `message` prop changed; component logic and `title` are untouched

## Deviations

- **[Rule 3 - Blocking]** `"session_start"` was not a valid `ObservationSource` — added it to `OBSERVATION_SOURCES` in `hook.schemas.ts` to unblock Task 3 compilation.

## Verification

- `bunx --bun tsc --noEmit` — clean (no errors)
- `bun run ./scripts/check-drift.ts` — "No drift detected. All outputs match source."
- 5 files modified, 213 insertions(+), 30 deletions(-)

## Files Modified

- `/packages/luca-observer/app/api/muninn/checkpoint/route.ts`
- `/packages/luca-observer/app/api/muninn/zone-history/route.ts`
- `/src/hooks/impl/context-check-throttled.ts`
- `/src/hooks/__schemas/hook.schemas.ts`
- `/packages/luca-observer/components/memory/recall-effectiveness.tsx`
