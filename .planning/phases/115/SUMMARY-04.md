# Plan 115-04 Summary: Extract useFilteredTable Factory Hook

## Status: COMPLETE

## What Was Done

Extracted a `useFilteredTable` factory hook from 5 observer hooks that shared an identical filter-by-session / map-rows / sort-by-timestamp / slice-to-limit pipeline.

## Tasks Completed

| #   | Task                                    | Commit    |
| --- | --------------------------------------- | --------- |
| 1   | Created `useFilteredTable` factory hook | `d30d78d` |
| 2   | Refactored `use-tool-calls.ts`          | `7b80119` |
| 3   | Refactored `use-decision-trail.ts`      | `0663b04` |
| 4   | Refactored `use-token-usage.ts`         | `ff90a30` |
| 5   | Refactored `use-context-health.ts`      | `8898084` |
| 6   | Refactored `use-cost-tracking.ts`       | `35de0a6` |

## Files Changed

- **Created:** `packages/luca-observer/hooks/use-filtered-table.ts` (70 lines)
- **Refactored:** `packages/luca-observer/hooks/use-tool-calls.ts`
- **Refactored:** `packages/luca-observer/hooks/use-decision-trail.ts`
- **Refactored:** `packages/luca-observer/hooks/use-token-usage.ts`
- **Refactored:** `packages/luca-observer/hooks/use-context-health.ts`
- **Refactored:** `packages/luca-observer/hooks/use-cost-tracking.ts`

## Design Decisions

1. **`sortBy: null` for skip-sort semantics**: The factory defaults `sortBy` to `"timestamp"` via destructuring. For `use-cost-tracking` which requires no sorting, `sortBy: null` is passed explicitly. Since `null` is falsy but does not trigger JS destructuring defaults (only `undefined` does), this cleanly bypasses the sort step.

2. **Mapper stability via `useCallback`**: All mapper functions are wrapped in `useCallback(fn, [])` with empty dependencies since they are pure row-to-object transforms with no external dependencies, ensuring referential stability for the `useMemo` inside the factory.

3. **Post-pipeline computation stays in consumers**: The factory handles only the shared pipeline (filter/map/sort/limit). Post-pipeline aggregation (totals in token-usage, latest/health in context-health, totalCost in cost-tracking) remains in separate `useMemo` hooks in each consumer.

4. **Inline row types**: Rather than importing SpacetimeDB generated types (which use complex internal type algebra), each mapper uses an inline structural type matching the actual row shape. This keeps the code self-documenting and avoids coupling to SpacetimeDB's internal type system.

## Verification

- TypeScript compilation passes: `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json`
- All 5 hooks' public APIs (return type, parameter names) remain identical
- No breaking changes to consumers

## Metrics

- **Net diff**: +210 / -108 lines (factory hook adds 70 lines, but replaces duplicated pipeline code)
- **Duplicated pipeline logic eliminated**: ~60 lines of repeated filter/sort/slice across 5 hooks
