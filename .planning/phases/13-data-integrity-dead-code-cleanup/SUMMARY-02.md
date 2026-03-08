# Phase 13 Plan 02 Summary: Add sanitizeJsonParse to Bridge and Persistence SpacetimeDB Paths

## Status: COMPLETE

## Objective

Replace all raw `JSON.parse` calls on external/SpacetimeDB data in bridge.ts and persistence.ts with `sanitizeJsonParse` to prevent prototype pollution attacks.

## Tasks Completed

### Task 1: Replace raw JSON.parse calls in bridge.ts

**Commit:** `7256c243`

Replaced 8 raw `JSON.parse` calls with `sanitizeJsonParse`:

1. **Line ~309**: `JSON.parse(row.contextJson)` in `readPhase()` SpacetimeDB path
2. **Line ~374**: `JSON.parse(row.contextJson)` in `readStatus()` SpacetimeDB path
3. **Line ~445**: `JSON.parse(row.contextJson)` in `readField()` SpacetimeDB path
4. **Line ~520**: `JSON.parse(rawValue)` in `setField()` CLI argument parsing
5. **Line ~537**: `JSON.parse(row.contextJson)` in `setField()` SpacetimeDB path
6. **Line ~678**: `JSON.parse(dataRaw)` in `transition()` `--data` argument parsing
7. **Line ~1039**: `JSON.parse(row.checkpointJson)` in `resumePhase()` SpacetimeDB path
8. **Line ~1219**: `JSON.parse(dataArg)` in `emit-event` `--data` argument parsing

Additional changes:

- Added `import type { SuspendCheckpoint }` for type safety on checkpoint parsing
- Added `as Record<string, unknown>` casts where `sanitizeJsonParse` returns `unknown` and properties are accessed
- Added `as SuspendCheckpoint` cast for the checkpoint object to preserve type-safe property access

### Task 2: Replace raw JSON.parse in persistence.ts

**Commit:** `76de1f78`

Replaced 1 raw `JSON.parse` call:

1. **Line ~224**: `JSON.parse(row.configJson)` in `createFreshActor()` SpacetimeDB config path

The file already imported `sanitizeJsonParse` -- only the usage needed to be added with a `Record<string, unknown>` cast.

## Verification Results

- `grep -c "JSON.parse" bridge.ts` = **0** (was 8)
- `grep -c "JSON.parse" persistence.ts` = **0** (was 1)
- `bunx --bun tsc --noEmit` = **passes** (exit code 0)
- `sanitizeJsonParse` usage count in bridge.ts = **11** (1 import + 10 call sites)
- `sanitizeJsonParse` usage count in persistence.ts = **4** (1 import + 3 call sites)

## Findings Closed

- **H2**: All 8 raw `JSON.parse` calls in bridge.ts replaced with `sanitizeJsonParse`
- **H3**: The 1 raw `JSON.parse` call in persistence.ts replaced with `sanitizeJsonParse`

## Deviations

None. All work was within plan scope.

## Files Modified

- `packages/luca-framework/src/state/bridge.ts`
- `packages/luca-framework/src/state/persistence.ts`
