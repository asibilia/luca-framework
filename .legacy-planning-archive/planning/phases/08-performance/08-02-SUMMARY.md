# Plan 08-02: Dependency Cleanup and Utility Deduplication - SUMMARY

## Status: COMPLETE

## Changes Made

### Task 1: Replace `ensureDir` with native `mkdir` in `files.ts`
- **File:** `packages/luca-framework/src/utils/files.ts`
- Added `mkdir` to the `fs/promises` import
- Removed `import { ensureDir } from 'fs-extra'`
- Replaced `await ensureDir(dir)` with `await mkdir(dir, { recursive: true })`

### Task 2: Replace `ensureDir` with native `mkdir` in `template.ts`
- **File:** `packages/luca-framework/src/utils/template.ts`
- Added `mkdir` to the `fs/promises` import
- Removed `import { ensureDir } from 'fs-extra'`
- Replaced `await ensureDir(dirname(destPath))` with `await mkdir(dirname(destPath), { recursive: true })`

### Task 3: Replace `ensureDir` with native `mkdir` in `update.ts`
- **File:** `packages/luca-framework/src/commands/update.ts`
- Removed `import { ensureDir } from 'fs-extra'`
- Replaced all 6 occurrences of `ensureDir(...)` with `mkdir(..., { recursive: true })`
- Removed unused `relative` import from `pathe` (was only used by the duplicate `getAllFiles` function)

### Task 4: Remove `fs-extra` from `package.json`
- **File:** `packages/luca-framework/package.json`
- Removed `"fs-extra": "^11.3.0"` from dependencies
- Removed `"@types/fs-extra": "^11.0.4"` from devDependencies
- Ran `bun install` to update lockfile

### Task 5: Deduplicate `getAllFiles` and `isTemplateFile`
- **File:** `packages/luca-framework/src/utils/template.ts`
  - Exported `getAllFiles` function (added `export` keyword)
  - Exported `isTemplateFile` function (added `export` keyword)
- **File:** `packages/luca-framework/src/commands/update.ts`
  - Added `getAllFiles, isTemplateFile` to the import from `'../utils/template'`
  - Removed duplicate `getAllFiles` function definition (lines 17-35)
  - Removed duplicate `isTemplateFile` function definition (lines 37-58)
- **File:** `__tests__/packages/luca-framework/src/commands/update.test.ts`
  - Updated template module mock to include `getAllFiles` and `isTemplateFile`
  - Removed now-unnecessary `fs-extra` mock

## Test Results

```
433 pass
6 fail (pre-existing, unrelated to changes - all in doctor command tests)
914 expect() calls
Ran 439 tests across 36 files
```

- All update command tests pass (9/9)
- `grep -r "fs-extra" packages/luca-framework/src/` returns no matches
- `grep -r "fs-extra" packages/luca-framework/package.json` returns no matches

## Deviations from Plan

1. **Task 3 had 6 occurrences, not ~5** - The plan estimated ~5 `ensureDir` occurrences in `update.ts` but there were actually 6.
2. **Removed unused `relative` import** - After removing the duplicate `getAllFiles` from `update.ts`, the `relative` import from `pathe` was no longer used, so it was cleaned up.
3. **Updated test mocks** - The test file `__tests__/packages/luca-framework/src/commands/update.test.ts` needed its template module mock updated to include the newly exported `getAllFiles` and `isTemplateFile` functions, and the `fs-extra` mock was removed since it is no longer imported.
