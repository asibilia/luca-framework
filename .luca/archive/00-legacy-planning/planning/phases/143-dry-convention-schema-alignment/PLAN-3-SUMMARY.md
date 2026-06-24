# PLAN-3 Summary: Convention Sweep -- safeParse, Bun Migration, orderBy, Stale EXCEPTIONS

**Phase:** 143
**Plan:** 3
**Wave:** 1
**Status:** Complete

## Objective

Apply convention compliance fixes across 6 files: convert `.parse()` to `.safeParse()` at public API boundaries, replace `node:fs` with Bun APIs, replace `.sort()` with lodash `orderBy`, remove stale EXCEPTIONS, and add a migration-path comment for dual representation.

## Tasks Completed

### Task 1: safeParse in memory-feedback.ts

- Converted `determineFeedback()` from `.parse()` to `.safeParse()` with graceful `return []` on invalid config
- Converted `computeMemoryPhaseMetrics()` from `.parse()` to `.safeParse()` with graceful default metrics on invalid config
- Both functions now log warnings on invalid input instead of throwing
- **Commit:** `4b76eba5`

### Task 2: safeParse in consensus-resolver.ts

- Converted `resolveConsensus()` from `.parse()` to `.safeParse()` with fallback to default config
- Only modified the `resolveConsensus()` function as instructed (PLAN-2 was simultaneously modifying other parts)
- **Note:** PLAN-2's concurrent commit (`aeff05d7`) inadvertently included this change when it staged the whole file. The change is live and correct -- no separate commit was needed.

### Task 3: lodash orderBy in memory-context-builder.ts

- Added `import orderBy from "lodash/orderBy"` at top
- Replaced `.sort((a, b) => b.priority - a.priority)` with `orderBy(..., (s) => s.priority, "desc")` in `truncateToFit()`
- **Commit:** `02840479`

### Task 4: Remove stale EXCEPTIONS in check-domain-boundaries.ts

- Emptied the EXCEPTIONS array (kept the type and `isException` function)
- Verified `bun scripts/check-domain-boundaries.ts` reports zero violations, confirming the exceptions were truly stale (resolved in Phase 13)
- **Commit:** `ec58519a`

### Task 5: Bun.file() migration in check-domain-boundaries.ts

- Removed `import { readFileSync } from "node:fs"` and unused `import { relative, dirname } from "node:path"`
- Replaced `readFileSync(fullPath, "utf-8")` with `await Bun.file(fullPath).text()`
- Verified script runs successfully with the new API
- **Commit:** `0b24983e`

### Task 6: Bun Glob migration in luca-observer todos route

- Removed `import { readdir, stat } from "node:fs/promises"`
- Added `import { Glob } from "bun"`
- Replaced `stat().isDirectory()` in `findProjectRoot()` with `Glob.scanSync()` try/catch for directory existence
- Replaced `readdir()` + filter in `readTodosFromDir()` with `Glob.scan({ cwd: dirPath })` for `*.md` files
- Verified with observer tsconfig -- no type errors
- **Commit:** `4c30a687`

### Task 7: Migration-path comment in recall-cache.ts

- Added NOTE comment to `RecallCacheEntrySchema` JSDoc explaining the plan to consolidate the dual representation (string arrays + structured `recalledEngrams`)
- **Commit:** `7cee0308`

## Deviations

- **Task 2 merged into PLAN-2 commit:** Due to parallel execution, PLAN-2 committed consensus-resolver.ts (`aeff05d7`) while my safeParse edit was in the working tree. The edit was included in PLAN-2's commit. This is a known race condition with parallel plan execution; the change is correct and live.
- **Task 5 removed unused imports:** `relative` and `dirname` from `node:path` were imported but never used in check-domain-boundaries.ts. Removed as part of the cleanup. [Rule 1 - Bug]

## Verification

- `bunx --bun tsc --noEmit` passes (1 pre-existing error in `embedding-recall.ts` unrelated to these changes)
- `bun scripts/check-domain-boundaries.ts` passes with zero violations after emptying EXCEPTIONS
- Observer tsconfig typecheck passes for the todos route

## Files Modified

| File                                             | Change                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/shared/__helpers/memory-feedback.ts`        | `.parse()` -> `.safeParse()` (2 sites)                                         |
| `src/shared/__helpers/consensus-resolver.ts`     | `.parse()` -> `.safeParse()` (1 site, merged into PLAN-2 commit)               |
| `src/shared/__helpers/memory-context-builder.ts` | `.sort()` -> lodash `orderBy`                                                  |
| `scripts/check-domain-boundaries.ts`             | Empty EXCEPTIONS, `readFileSync` -> `Bun.file().text()`, remove unused imports |
| `packages/luca-observer/app/api/todos/route.ts`  | `readdir`/`stat` -> Bun `Glob.scan()`                                          |
| `src/shared/__helpers/recall-cache.ts`           | Added migration-path NOTE comment                                              |
