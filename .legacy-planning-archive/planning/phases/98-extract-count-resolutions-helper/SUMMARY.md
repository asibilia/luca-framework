# PLAN-98-A Summary: Extract Resolution-Counting Helper

## Objective

Extract a shared `countResolutions()` helper to replace the duplicated pattern of filtering rebuttals by resolution status (upheld/withdrawn/modified). The pattern appeared in 3 locations, each using `lodash/filter` with identical logic.

## Changes Made

### New File

- **`src/shared/__helpers/resolution-counts.ts`** -- New helper module exporting `countResolutions()` and `ResolutionCounts` interface. Centralizes the filter-by-resolution pattern into a single function.

### Modified Files

- **`src/shared/index.ts`** -- Added barrel exports for `countResolutions` and `ResolutionCounts` type.
- **`src/shared/__helpers/tribunal-rebuttals.ts`** -- Replaced 5 `lodash/filter` resolution calls (3 in `resolveRebuttals`, 2 in `buildTribunalResult`) with `countResolutions()`. Removed unused `lodash/filter` import.
- **`src/skills/__helpers/milestone-debate.ts`** -- Replaced 3 `lodash/filter` resolution calls in `generateConsensusSummary` with `countResolutions()`. Kept `lodash/filter` import (still used for confidence-based recommendation filtering).

### Commits

1. `540bec0` -- feat(shared): add countResolutions helper
2. `2b60eeb` -- feat(shared): export countResolutions from shared barrel
3. `d4aaf5f` -- refactor(shared): use countResolutions in resolveRebuttals
4. `13b5caa` -- refactor(shared): use countResolutions in buildTribunalResult
5. `6a254ed` -- refactor(skills): use countResolutions in generateConsensusSummary
6. `ae80cd6` -- chore(shared): remove unused lodash/filter import

## Verification

- **TypeScript**: `bunx --bun tsc --noEmit` passes with zero errors
- **Tests**: `bun test` passes all 3150 tests, 0 failures, 9974 expect() calls
- **Pattern elimination**: Zero `r.resolution === "upheld"` / `"withdrawn"` / `"modified"` filter patterns remain in consumer code. The only instances are inside the new `countResolutions()` helper (single source of truth).

## Net Impact

- **Lines added**: ~41 (new helper file)
- **Lines removed**: ~33 (duplicate filter patterns across 2 consumer files)
- **Duplication eliminated**: 3 locations with identical 3-filter pattern consolidated into 1 shared helper
