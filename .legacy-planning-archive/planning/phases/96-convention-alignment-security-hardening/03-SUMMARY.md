# 03-SUMMARY: Replace native .sort()/.filter() with lodash orderBy/filter

## Plan

96-C — Replace native `.sort()` calls with lodash `orderBy` and native `.filter()` calls with lodash `filter` across v2.6.0 debate/tribunal files.

## Status: COMPLETE

## Changes

### Task 1: tribunal-rebuttals.ts

- Added `import orderBy from "lodash/orderBy"` and `import filter from "lodash/filter"`
- 1x `.sort()` → `orderBy` (severity rank descending, removed `[...findings]` spread since `orderBy` returns new array)
- 5x `.filter()` → `filter` (3 in `resolveRebuttals`, 2 in `buildTribunalResult`)

### Task 2: stall-debate.ts

- Added `import orderBy from "lodash/orderBy"` and `import filter from "lodash/filter"`
- 1x `.sort()` → `orderBy` (source counts descending)
- 2x `.filter()` → `filter` (error classification filtering)

### Task 3: milestone-debate.ts

- Added `import filter from "lodash/filter"`
- 5x `.filter()` → `filter` (rebuttal resolution filtering + recommendation confidence filtering)

### Task 4: pr-verdict-debate.ts

- Added `import filter from "lodash/filter"`
- 2x `.filter()` → `filter` (valid/invalid verdict filtering)

### Task 5: convergence.ts

- Added `import filter from "lodash/filter"`
- 2x `.filter()` → `filter` (classified error filtering by classification)
- Excluded: tokenize `.filter()` (low-level string op) and `.filter(Boolean)` (idiomatic)

### Task 6: metrics-collector.ts

- Already migrated by concurrent Wave 1 (safeParse migration included lodash filter import)
- 1x `.filter()` → `filter` (stall event counting by convergence_status)

## Validation

- **TypeScript**: No new type errors introduced (existing errors are from concurrent Wave 1 safeParse test updates, not from this wave)
- **Tests**: 136/136 pass across all 6 test files, 0 failures, 295 expect() calls
- **Audit**: Zero native `.sort()` or `.filter()` remain in debate/tribunal files (except plan-excluded tokenize and `.filter(Boolean)` in convergence.ts)
- **Imports**: All lodash imports use individual pattern (`import X from "lodash/X"`)

## Out of Scope (Noted)

- `tribunal-consensus.ts` has 1x `.sort()` at line 106 — not listed in plan, left untouched

## Commits

1. `eae7360` — tribunal-rebuttals.ts (1 sort + 5 filter)
2. `6b1dc80` — stall-debate.ts (1 sort + 2 filter)
3. `82cafe3` — milestone-debate.ts (5 filter)
4. `5867c7a` — pr-verdict-debate.ts (2 filter)
5. `e57d334` — convergence.ts (2 filter)
6. metrics-collector.ts — already committed by concurrent wave
