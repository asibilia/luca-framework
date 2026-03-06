---
plan_id: 127-01
phase: 127
title: "TTL Cleanup Implementation for observer_events and token_usage"
status: complete
verification:
  - status: pass
    detail: CleanupSchedule scheduled table defined in cleanup-schedule.ts
  - status: pass
    detail: run_ttl_cleanup reducer processes both observer_events and token_usage
  - status: pass
    detail: Preserves most recent N records as safety net
  - status: pass
    detail: Next cleanup scheduled after each run (1 hour interval)
  - status: pass
    detail: init reducer seeds first cleanup job
  - status: pass
    detail: TypeScript compiles cleanly (bunx --bun tsc --noEmit)
  - status: pass
    detail: All 3516 tests pass (bun test)
---

# Plan 127-01 Summary

## Implementation Status: COMPLETE

TTL cleanup for high-volume SpacetimeDB tables is fully implemented using the scheduled table pattern.

## Files Created/Modified

| File                                                          | Changes                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/luca-spacetime/spacetimedb/src/cleanup-schedule.ts` | **NEW** - Scheduled table definition with reducer reference container |
| `packages/luca-spacetime/spacetimedb/src/schema.ts`           | Import CleanupSchedule and register in schema                         |
| `packages/luca-spacetime/spacetimedb/src/index.ts`            | Add run_ttl_cleanup reducer, seed initial job in init                 |

## Architecture

The scheduled table and its reducer are separated across files to avoid circular imports:

1. `cleanup-schedule.ts` defines `CleanupSchedule` table with a `reducerRef` container
2. `schema.ts` imports and registers `CleanupSchedule` in the schema (so `ctx.db.cleanupSchedule` is typed)
3. `index.ts` defines `run_ttl_cleanup` reducer and assigns `reducerRef.current = run_ttl_cleanup`

The `scheduled: () => reducerRef.current` callback is lazy -- it resolves at runtime after module initialization, so the reducer reference is always available.

## Implementation Details

### CleanupSchedule Table

- `scheduledId`: auto-increment primary key
- `scheduledAt`: SpacetimeDB schedule trigger
- `eventsMaxAgeHours`: TTL for observer_events (default: 24h)
- `usageMaxAgeHours`: TTL for token_usage (default: 168h / 7 days)
- `preserveCount`: minimum records to keep regardless of age (default: 1000)

### run_ttl_cleanup Reducer

- Receives scheduled row as `arg` (auto-deleted after reducer completes)
- Uses `ctx.timestamp.microsSinceUnixEpoch` for deterministic time (no Date.now())
- Sorts each table newest-first, preserves top N, deletes old records past cutoff
- Logs deletion counts via console.log
- Schedules next cleanup 1 hour from now by inserting a new CleanupSchedule row

### init Reducer

- Seeds the first cleanup job 1 hour after module publish
- Uses default TTL values: 24h for events, 168h for usage, preserve 1000

## Verification Criteria Status

- [x] CleanupSchedule table exists in schema with scheduled: () => reducer
- [x] run_ttl_cleanup reducer processes both tables
- [x] Cleanup preserves most recent N records
- [x] Next cleanup is scheduled after each run
- [x] init reducer seeds the first cleanup job
- [x] TypeScript compiles: `bunx --bun tsc --noEmit`
- [x] Tests pass: `bun test` (3516 pass, 0 fail)
