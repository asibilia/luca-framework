# SUMMARY: PLAN-98-C — Extract safeParse-or-Throw Utility

## Completed Tasks

### Task 1: Create `safeParseOrThrow` utility

- **File:** `src/shared/__helpers/safe-parse-or-throw.ts` (NEW)
- Generic function that wraps Zod `safeParse` + error-throw in a single call
- Accepts schema, value, and human-readable label for error messages
- Returns parsed data of type `T` or throws with labeled error

### Task 2: Export from shared barrel

- **File:** `src/shared/index.ts`
- Added `safeParseOrThrow` export under new "Parsing Utilities" section

### Task 3: Refactor `appendMetrics` switch

- **File:** `src/iteration/__helpers/metrics-collector.ts`
- Replaced 4 switch cases (each 7 lines of safeParse -> check -> throw -> push) with single-line `safeParseOrThrow` calls
- All 4 categories refactored: `iteration_metrics`, `plan_quality_metrics`, `review_metrics`, `convergence_metrics`
- Error messages preserved exactly

## Verification

- `bunx --bun tsc --noEmit` — passes clean (zero errors)
- `bun test` — 3147 pass, 3 fail (pre-existing MEMORY.md environment-dependent failures, unrelated)

## Files Changed

| File                                           | Action                                     |
| ---------------------------------------------- | ------------------------------------------ |
| `src/shared/__helpers/safe-parse-or-throw.ts`  | Created                                    |
| `src/shared/index.ts`                          | Modified (added export)                    |
| `src/iteration/__helpers/metrics-collector.ts` | Modified (added import, refactored switch) |

## Net Line Impact

- **Before:** 4 switch cases x 7 lines each = 28 lines of repetitive safeParse+throw+push
- **After:** 4 switch cases x 4 lines each = 16 lines + 35-line reusable utility
- Repetitive pattern eliminated; utility is reusable across the codebase
