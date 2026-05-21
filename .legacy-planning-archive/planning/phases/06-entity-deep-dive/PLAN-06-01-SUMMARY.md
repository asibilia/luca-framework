# PLAN-06-01 Summary: Entity Deep Dive Foundation (Hook + Nav)

## Status: COMPLETE

## Execution

| Task | Description                                         | Commit     | Status |
| ---- | --------------------------------------------------- | ---------- | ------ |
| 1    | Create use-entity-deep-dive hook                    | `257e48ae` | Done   |
| 2    | Register Entities in NAV_ITEMS and sidebar ICON_MAP | `4c17a6b3` | Done   |

## What Was Done

### Task 1: use-entity-deep-dive hook

Created `packages/luca-observer/hooks/use-entity-deep-dive.ts` following the canonical hook pattern from `use-decision-trail.ts`:

- **Hook signature:** `useEntityDeepDive(entityName: string): EntityDeepDiveData`
- **3 parallel fetches** via `Promise.allSettled`:
  - `GET /api/muninn/entity/${name}` -- entity aggregate (MuninnEntity)
  - `GET /api/muninn/entity/${name}/timeline` -- chronological timeline (MuninnTimelineEntry[])
  - `GET /api/muninn/entity-clusters` -- all clusters, filtered client-side to co-occurrences
- **NotConfiguredError** handling: 503 responses degrade gracefully to empty results, not error state
- **fetchingRef guard** to prevent double-fetch in React strict mode
- **Co-occurrence filtering**: keeps only clusters where entity_a or entity_b matches entityName, maps to `{ entity_name, count }` with the OTHER entity name
- **lodash orderBy** for sorting co-occurrences by count descending
- **Re-fetches** when entityName changes (resets all state, triggers new fetchAll)
- **Exported types**: `CoOccurrence`, `EntityDeepDiveData`

### Task 2: Nav Registration

- Added `{ href: "/entities", label: "Entities", icon: "Fingerprint" }` to `NAV_ITEMS` in `constants.ts` after the Contradictions entry
- Added `Fingerprint` to lucide-react imports and `ICON_MAP` in `sidebar.tsx`

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors after both tasks
- No test files created (per no-tests rule)

## Deviations

None. Plan executed as specified.

## Files Created/Modified

- **Created:** `packages/luca-observer/hooks/use-entity-deep-dive.ts`
- **Modified:** `packages/luca-observer/lib/constants.ts`
- **Modified:** `packages/luca-observer/components/layout/sidebar.tsx`

## Duration

~3 minutes

## Notes for Plan 2

The hook and nav entry are ready. Plan 2 can build the entity deep-dive page components and route, importing `useEntityDeepDive` from `~/hooks/use-entity-deep-dive` and linking from the sidebar's Entities nav item.
