import { table, t } from "spacetimedb/server";

/**
 * Reducer reference container. The actual reducer is assigned in index.ts
 * after creation. The `scheduled` callback is lazy (invoked at runtime,
 * not at module-parse time), so the assignment is guaranteed to complete
 * before SpacetimeDB calls the callback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const reducerRef: { current: any } = { current: undefined };

/** Scheduled table for periodic TTL cleanup of high-volume tables. */
export const CleanupSchedule = table(
  {
    name: "cleanup_schedule",
    scheduled: () => reducerRef.current,
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    eventsMaxAgeHours: t.u64(),
    usageMaxAgeHours: t.u64(),
    preserveCount: t.u64(),
  },
);
