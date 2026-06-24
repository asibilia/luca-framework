# Plan 25-01 Summary: Extract Shared Test Helpers + Code Hygiene Fixes

## Status: COMPLETE

## Requirements Covered

| Requirement | Description                                       | Status |
| ----------- | ------------------------------------------------- | ------ |
| TEST-01     | Extract shared test helpers module                | Done   |
| BUN-01      | Fix build-utils.ts bare `fs/promises` import      | Done   |
| CLEAN-01    | Fix unused `hookName` variable in build-claude.ts | Done   |

## Changes Made

### Task 1: Created `scripts/test-helpers.ts` (NEW)

Shared module containing three previously duplicated test utilities:

- `VALID_CLAUDE_CODE_EVENTS` -- ReadonlySet of valid Claude Code hook event types
- `PLUGIN_ROOT` -- Resolved path to `dist/plugin/` output directory
- `extractFrontmatter()` -- Simple YAML frontmatter parser for SKILL.md files

All utilities include comprehensive JSDoc documentation.

### Task 2: Updated `scripts/plugin-spec-e2e.test.ts`

- Removed local `PLUGIN_ROOT`, `VALID_CLAUDE_CODE_EVENTS`, and `extractFrontmatter` definitions (42 lines removed)
- Added import from `./test-helpers` (5 lines added)
- Net: -37 lines
- All 12 tests pass

### Task 3: Updated `scripts/plugin-spec-hooks-format.test.ts`

- Removed local `PLUGIN_ROOT`, `VALID_CLAUDE_CODE_EVENTS`, and `extractFrontmatter` definitions (41 lines removed)
- Added import from `./test-helpers` (5 lines added)
- Net: -36 lines
- All 12 tests pass

### Task 4: Updated `scripts/plugin-spec-structure.test.ts`

- Removed local `PLUGIN_ROOT` declaration (2 lines removed)
- Added import from `./test-helpers` (1 line added)
- Net: -1 line
- All 17 tests pass

### Task 5: Fixed `scripts/build-utils.ts` import (BUN-01)

- Changed `import { readdir, unlink, rm, lstat, mkdir } from 'fs/promises'` to `from 'node:fs/promises'`
- Aligns with Node.js protocol-prefixed import convention

### Task 6: Fixed `scripts/build-claude.ts` unused variable (CLEAN-01)

- Renamed `hookName` to `_hookName` in `for (const [hookName, hookDef] of Object.entries(hookRegistry))`
- Variable was not used in the loop body; underscore prefix signals intentional disuse

## Test Results

```
938 pass
6 skip
0 fail
2717 expect() calls
Ran 944 tests across 70 files. [2.89s]
```

Test count matches the baseline (938 passing). No regressions introduced.

## Commits

1. `0b8a6c0` -- refactor(25-01): extract shared test helpers module
2. `1c4ce01` -- refactor(25-01): update plugin-spec-e2e to use shared test helpers
3. `458e8a9` -- refactor(25-01): update plugin-spec-hooks-format to use shared test helpers
4. `ebb239d` -- refactor(25-01): update plugin-spec-structure to use shared test helpers
5. `9d9405b` -- refactor(25-01): migrate build-utils import to node:fs/promises
6. `5005140` -- fix(25-01): rename unused hookName variable to \_hookName

## Duplication Eliminated

| Utility                    | Before (copies)                    | After (copies)   |
| -------------------------- | ---------------------------------- | ---------------- |
| `VALID_CLAUDE_CODE_EVENTS` | 2 (e2e + hooks-format)             | 1 (test-helpers) |
| `extractFrontmatter()`     | 2 (e2e + hooks-format)             | 1 (test-helpers) |
| `PLUGIN_ROOT`              | 3 (e2e + hooks-format + structure) | 1 (test-helpers) |

Total lines of duplication removed: ~74 lines across 3 files.
