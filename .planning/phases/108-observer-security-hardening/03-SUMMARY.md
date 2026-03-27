# Plan 108-03: Path Traversal Fix + Query Param Validation

**Status:** COMPLETE
**Commit:** fix(108-03): #44 fix path traversal and add query param validation

## Changes

### Task 108-03-1: Symlink Path Traversal Fix

Created `packages/luca-observer/lib/resolve-project-dir.ts`:

- Uses `realpathSync` to resolve symlinks before boundary check
- Catches ENOENT for non-existent paths (falls back to resolve-only)
- Re-throws traversal errors, wraps unexpected errors

### Task 108-03-2: Deduplicate resolveProjectDir

- **file-watcher.ts**: Removed local 10-line `resolveProjectDir`, added import from `./resolve-project-dir`
- **notes/route.ts**: Removed local 10-line `resolveProjectDir`, added import from `~/lib/resolve-project-dir`

### Task 108-03-3: Zod Schema Validation for events-query

- Added `EventQueryParamsSchema` with `z.coerce.number()` for limit (1-1000, default 50), offset (0-100000, default 0), since_id (min 0)
- Replaced manual `parseInt` parsing with `safeParse`
- Returns 400 with `invalid_query_params` error on validation failure

### Task 108-03-4: Zod Schema Validation for ledger

- Added `LedgerQueryParamsSchema` with `z.coerce.number()` for tail (1-10000), limit (1-10000, default 100)
- Replaced manual `parseInt` parsing with `safeParse`
- Returns 400 with `invalid_query_params` error on validation failure

## Verification

- `bunx --bun tsc --noEmit` passes clean (0 errors)

## Files Modified

| File                                                   | Action                                        |
| ------------------------------------------------------ | --------------------------------------------- |
| `packages/luca-observer/lib/resolve-project-dir.ts`    | Created                                       |
| `packages/luca-observer/lib/file-watcher.ts`           | Removed local resolveProjectDir, added import |
| `packages/luca-observer/app/api/notes/route.ts`        | Removed local resolveProjectDir, added import |
| `packages/luca-observer/app/api/events-query/route.ts` | Added Zod schema validation                   |
| `packages/luca-observer/app/api/ledger/route.ts`       | Added Zod schema validation                   |
