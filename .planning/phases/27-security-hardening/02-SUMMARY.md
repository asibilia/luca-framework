# Plan 27-02 Summary: Build Pipeline + Schema Hardening

**Status:** COMPLETE
**Phase:** 27 — Security Hardening
**Wave:** 1
**Plan:** 27-02
**GitHub Issue:** #9
**Branch:** feat/9-audit-tech-debt-cleanup

## Requirements Covered

- **SEC-03**: Root path guard for cleanDirectory() and cleanSkillsDirectory()
- **SEC-04**: Description length and keywords array size limits in pluginManifestSchema

## Changes Made

### Task 1: Add `assertSafeCleanTarget()` guard to `build-utils.ts` (SEC-03)

Added a `SAFE_CLEAN_ROOTS` constant and `assertSafeCleanTarget()` guard function to `scripts/build-utils.ts`. The guard validates that any directory passed to `cleanDirectory()` or `cleanSkillsDirectory()` is within the project root AND within an allowed output directory (`.claude`, `.cursor`, or `dist`). Both functions now call the guard as their first operation, preventing accidental deletion outside safe directories.

### Task 2: Create `scripts/build-utils.test.ts` with path guard tests (SEC-03)

Created comprehensive test suite with 10 tests covering:

- SAFE_CLEAN_ROOTS contains expected directories
- Accepts `.claude`, `.cursor`, and `dist` subdirectories
- Rejects paths outside the project root (`/`, `/etc`, `/tmp/malicious`)
- Rejects paths within project root but outside allowed directories (`src`, `scripts`, `node_modules`)
- Rejects the project root itself
- Rejects path traversal attempts (`../`)
- Handles relative paths correctly

### Task 3: Add constraint limits to `pluginManifestSchema` (SEC-04)

Updated `src/compilers/plugin.types.ts`:

- Added `.max(500)` to the `description` field
- Added `.min(1).max(50)` to each keyword string and `.max(20)` to the keywords array
- Updated JSDoc comments to document the new limits

### Task 4: Add boundary tests to `plugin.types.test.ts` (SEC-04)

Added 7 boundary tests to the existing `pluginManifestSchema` describe block:

- Accepts description at exactly 500 characters
- Rejects description exceeding 500 characters
- Accepts keywords array with exactly 20 items
- Rejects keywords array exceeding 20 items
- Accepts keyword at exactly 50 characters
- Rejects keyword exceeding 50 characters
- Rejects empty string keyword

### Task 5: Full verification suite

Ran all verification checks. All passed successfully.

## Verification Results

| Check                                       | Result                                                      |
| ------------------------------------------- | ----------------------------------------------------------- |
| bunx --bun tsc --noEmit                     | PASS (no errors in changed files; pre-existing errors only) |
| bun test scripts/build-utils.test.ts        | PASS (10 tests, 31 assertions)                              |
| bun test src/compilers/plugin.types.test.ts | PASS (33 tests, 95 assertions)                              |
| bun test                                    | PASS (962 pass, 0 fail, 6 skip)                             |
| bun run build:all                           | PASS (309 files built)                                      |
| bun test scripts/check-drift.test.ts        | PASS (30 tests, 36 assertions)                              |

## Files Modified

- `scripts/build-utils.ts` — Added SAFE_CLEAN_ROOTS, assertSafeCleanTarget(), guard calls in cleanDirectory/cleanSkillsDirectory
- `src/compilers/plugin.types.ts` — Added .max(500) to description, .min(1).max(50).max(20) to keywords
- `src/compilers/plugin.types.test.ts` — Added 7 boundary tests for description/keywords limits

## Files Created

- `scripts/build-utils.test.ts` — 10 tests for assertSafeCleanTarget() path guard

## Commits

- `a9399e6` fix(build): #9 add assertSafeCleanTarget() root path guard to build-utils
- `84cb57f` test(build): #9 add comprehensive tests for assertSafeCleanTarget() path guard
- `4c2d251` fix(schema): #9 add description length and keywords size limits to pluginManifestSchema
- `cb4dda3` test(schema): #9 add boundary tests for description and keywords limits in pluginManifestSchema
