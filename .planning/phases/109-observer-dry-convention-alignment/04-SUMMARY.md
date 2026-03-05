# 109-04 SUMMARY: Convention Alignment -- lodash orderBy, Tailwind Headers, Schema-First, safeParse

## Status: COMPLETE

## Changes Made

### Task 109-04-1: Replace Array.sort/reverse with lodash orderBy

Replaced all `Array.sort()` and `[...arr].reverse()` calls with `lodash/orderBy` across 8 files:

| File                        | Before                                                                | After                                                             |
| --------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `agent-scorecard-table.tsx` | `[...agents].sort((a, b) => b.invocation_count - a.invocation_count)` | `orderBy(agents, "invocation_count", "desc")`                     |
| `agent-activity-log.tsx`    | `events.sort((a, b) => new Date(b.timestamp).getTime() - ...)`        | `orderBy(events, (e) => new Date(e.timestamp).getTime(), "desc")` |
| `wsjf-score-table.tsx`      | 8-line custom sort comparator                                         | `orderBy(items, [sortField], [sortDirection])`                    |
| `iteration-timeline.tsx`    | `[...iterations].reverse()`                                           | `orderBy(iterations, "iteration", "desc")`                        |
| `transition-log.tsx`        | `[...entries].reverse()`                                              | `orderBy(entries, "sequence_number", "desc")`                     |
| `recent-transitions.tsx`    | `[...entries].reverse()`                                              | `orderBy(entries, "sequence_number", "desc")`                     |
| `file-watcher.ts`           | `records.sort((a, b) => a.iteration - b.iteration)`                   | `orderBy(records, "iteration", "asc")`                            |
| `db.ts` (queryEvents)       | `[...result].reverse()`                                               | `orderBy(result, "id", "desc")`                                   |
| `db.ts` (getSessions)       | `[...store.sessions.values()].reverse()`                              | `orderBy([...store.sessions.values()], "started_at", "desc")`     |

Added `lodash` to luca-observer dependencies and `@types/lodash` to devDependencies.

### Task 109-04-2: Fix Tailwind table header inconsistencies

Aligned 2 table headers with the established pattern from `transition-log.tsx`:

- **agent-scorecard-table.tsx**: Moved `font-semibold text-muted-foreground` from individual `<th>` to `<tr>`, added `font-mono text-xs uppercase tracking-wider`, changed `font-semibold` to `font-medium`.
- **findings-table.tsx**: Moved `font-mono text-xs font-medium text-muted-foreground` from individual `<th>` to `<tr>`, added `uppercase tracking-wider`.

Established pattern: `font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground` on `<tr>`, with `<th>` containing only padding + alignment.

### Task 109-04-3: Fix budget-gauge.tsx destructuring default

Moved `softStopPercent = 80` destructuring default to a Zod schema:

- Added `BudgetGaugePropsSchema` with `z.number().default(80)` for `softStopPercent`
- Changed function signature from destructured props to `rawProps: BudgetGaugeProps`
- Added `BudgetGaugePropsSchema.parse(rawProps)` for schema-first validation

### Task 109-04-4: Replace type assertions with safeParse

- **use-event-stream.ts**: Replaced `JSON.parse(event.data) as StoredEvent` with `StoredEventSchema.safeParse(JSON.parse(event.data))` -- silently skips invalid events instead of potentially injecting malformed data.
- **use-metrics.ts**: Already fixed by Plan 109-01 (uses `usePollingFetch` with `MetricsResponseSchema`). Verified and skipped.

## Verification

- TypeScript: No new type errors introduced (all errors in `tsc --noEmit` are pre-existing in page components)
- Tests: 20/20 pass in luca-observer test suite
- No modified files appear in type error output

## Files Modified

- `packages/luca-observer/package.json` (added lodash + @types/lodash)
- `packages/luca-observer/components/agents/agent-scorecard-table.tsx`
- `packages/luca-observer/components/agents/agent-activity-log.tsx`
- `packages/luca-observer/components/planning/wsjf-score-table.tsx`
- `packages/luca-observer/components/iteration/iteration-timeline.tsx`
- `packages/luca-observer/components/iteration/budget-gauge.tsx`
- `packages/luca-observer/components/workflow/transition-log.tsx`
- `packages/luca-observer/components/dashboard/recent-transitions.tsx`
- `packages/luca-observer/components/tribunal/findings-table.tsx`
- `packages/luca-observer/hooks/use-event-stream.ts`
- `packages/luca-observer/lib/file-watcher.ts`
- `packages/luca-observer/lib/db.ts`
- `bun.lock`
