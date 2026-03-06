---
plan_id: 127-01
phase: 127
title: "TTL Cleanup Implementation for observer_events and token_usage"
status: partial_implementation
verification:
  - status: pass
    detail: cleanup_ttl reducer created with configurable TTL thresholds
  - status: partial
    detail: Scheduled job syntax needs SpacetimeDB SDK version verification
  - status: pass
    detail: Preserves most recent N records as safety net
---

# Plan 127-01 Summary

## Implementation Status: PARTIAL

The TTL cleanup reducer logic has been implemented, but the scheduled job syntax requires verification against the installed SpacetimeDB SDK version.

## Files Updated

| File | Changes |
|------|---------|
| `packages/luca-spacetime/spacetimedb/src/index.ts` | Added `cleanup_ttl` reducer |

## Implementation Details

### cleanup_ttl Reducer

```typescript
export const cleanup_ttl = spacetimedb.reducer(
  {
    ttlHours: t.u64().opt(),
    preserveCount: t.u64().opt(),
  },
  (ctx, args) => {
    const now = BigInt(Date.now());
    const ttlMs = (args.ttlHours ?? 24n) * 3600000n;
    const cutoffTimestamp = now - ttlMs;
    const preserveCount = args.preserveCount ?? 1000n;

    // Cleanup observer_events older than TTL (default 24h)
    const oldEvents = [...ctx.db.observerEvents.iter()]
      .filter((e) => e.timestamp < cutoffTimestamp)
      .sort((a, b) => Number(b.timestamp - a.timestamp));
    
    const eventsToDelete = oldEvents.slice(Number(preserveCount));
    for (const event of eventsToDelete) {
      ctx.db.observerEvents.id.delete(event.id);
    }

    // Cleanup token_usage older than TTL (default 7 days = 168 hours)
    const usageTtlMs = (args.ttlHours ?? 168n) * 3600000n;
    const usageCutoffTimestamp = now - usageTtlMs;
    const oldUsage = [...ctx.db.tokenUsage.iter()]
      .filter((u) => u.timestamp < usageCutoffTimestamp)
      .sort((a, b) => Number(b.timestamp - a.timestamp));
    
    const usageToDelete = oldUsage.slice(Number(preserveCount));
    for (const usage of usageToDelete) {
      ctx.db.tokenUsage.id.delete(usage.id);
    }

    console.log(
      `TTL cleanup: deleted ${eventsToDelete.length} events and ${usageToDelete.length} usage records`,
    );
  },
);
```

### Features Implemented

✅ Configurable TTL threshold (default: 24h for events, 168h/7d for usage)  
✅ Configurable preserve count (default: 1000 most recent records)  
✅ Logging of deleted record counts  
✅ Safety net preserves recent records  

### Scheduled Job (NEEDS VERIFICATION)

The scheduled job syntax attempted:

```typescript
export const scheduled_cleanup = spacetimedb.schedule(
  { intervalSeconds: 3600 }, // 1 hour
  cleanup_ttl,
  { ttlHours: 24n, preserveCount: 1000n },
);
```

**Note:** SpacetimeDB SDK syntax for scheduled reducers varies by version. The following alternatives may be needed:

1. **Attribute syntax** (older SDK):
   ```rust
   #[schedule(interval = 3600)]
   pub fn scheduled_cleanup(ctx: &ReducerContext) {
       cleanup_ttl(ctx, CleanupTtlArgs {
           ttl_hours: Some(24),
           preserve_count: Some(1000),
       });
   }
   ```

2. **Module-level config** (newer SDK):
   ```typescript
   export const schedules = {
     scheduled_cleanup: { intervalSeconds: 3600, reducer: cleanup_ttl },
   };
   ```

## Next Steps

1. Check SpacetimeDB SDK version: `bun list | grep spacetimedb`
2. Consult SpacetimeDB docs for scheduled reducer syntax
3. Test TTL cleanup manually by calling `cleanup_ttl` reducer
4. Configure scheduled job with correct syntax

## Verification Criteria Status

- [x] Cleanup reducer exists with configurable TTL
- [ ] Scheduled job syntax verified and working
- [ ] Tests verify old records deleted, recent preserved
- [x] Logging implemented

## Success Criteria (Partial)

✅ TTL cleanup reducer logic implemented  
✅ Configurable thresholds implemented  
⚠️ Scheduled job needs SDK version verification  

## Recommendations

1. **Manual cleanup alternative**: Call `cleanup_ttl` reducer manually via CLI until scheduled job is configured
2. **External cron alternative**: Use system cron job to call reducer hourly
3. **SDK upgrade**: Consider upgrading to latest SpacetimeDB SDK for better scheduled reducer support
