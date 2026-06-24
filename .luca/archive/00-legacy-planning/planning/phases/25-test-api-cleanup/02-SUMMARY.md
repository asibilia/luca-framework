# Plan 25-02 Summary: Migrate check-drift.test.ts to Async Bun.file and node:fs/promises APIs

## Status: COMPLETE

## Requirements Covered

| Requirement | Description                                            | Status |
| ----------- | ------------------------------------------------------ | ------ |
| TEST-02     | Migrate check-drift.test.ts to async APIs              | Done   |
| BUN-02      | Replace require("fs") with Bun.file / node:fs/promises | Done   |

## Changes Made

### Task 1: Updated imports

- Replaced `import { readdirSync, existsSync } from "node:fs"` with `import { readdir } from "node:fs/promises"`
- Single-line change establishing the async foundation

### Task 2: Migrated Output Freshness tests to async Bun.file

- Converted 4 loop-based freshness tests (`agent`, `skill`, `rule`, `hook scripts`) from `try/catch readFileSync` to `await Bun.file().exists()` + `await Bun.file().text()`
- Converted 2 single-file tests (`settings.json hooks`, `.cursor/hooks.json`) from `readFileSync` to `await Bun.file().text()`
- All 6 test callbacks marked `async`
- Total: 6 `require("fs").readFileSync` calls eliminated

### Task 3: Migrated Registry Completeness tests to async readdir

- Converted 4 tests (`skills`, `agents`, `rules`, `hooks`) from `readdirSync(dir)` to `await readdir(dir)`
- All 4 test callbacks marked `async`
- Total: 4 `readdirSync` calls eliminated

### Task 4: Migrated No Orphan Outputs tests to async readdir

- Converted 8 tests (`.claude/` and `.cursor/` variants for `agents`, `skills`, `rules`, `hooks`) from `readdirSync` to `await readdir`
- Includes 2 `withFileTypes: true` variants for skill directory detection
- All 8 test callbacks marked `async`
- Total: 8 `readdirSync` calls eliminated

### Task 5: Migrated Plugin Output Freshness tests to async Bun.file

- Converted 4 loop-based plugin freshness tests (`agents`, `skills`, `commands`, `hook scripts`) from `try/catch readFileSync` to `await Bun.file().exists()` + `await Bun.file().text()`
- Converted 4 single-file tests (`hooks.json`, `plugin.json`, `marketplace.json`, `README.md`) from `readFileSync` to `await Bun.file().text()`
- All 8 test callbacks marked `async`
- Total: 8 `require("fs").readFileSync` calls eliminated

### Task 6: Migrated Plugin No Orphan Outputs tests to async readdir + replaced existsSync

- Converted 4 tests (`agents`, `skills`, `commands`, `hook scripts`) from `readdirSync` to `await readdir`
- Replaced `existsSync(dir)` guard in the commands test with `try/catch` around `await readdir(dir)` for graceful directory-not-found handling
- Includes 1 `withFileTypes: true` variant for skill directory detection
- All 4 test callbacks marked `async`
- Total: 4 `readdirSync` + 1 `existsSync` calls eliminated

## Sync API Elimination Summary

| API Removed                  | Count  | Replacement                          |
| ---------------------------- | ------ | ------------------------------------ |
| `require("fs").readFileSync` | 14     | `await Bun.file().text()`            |
| `readdirSync`                | 16     | `await readdir()` (node:fs/promises) |
| `existsSync`                 | 1      | `try/catch` around `await readdir()` |
| **Total sync calls removed** | **31** |                                      |

## Verification

- `bun test scripts/check-drift.test.ts`: 30 pass, 0 fail
- `bun test` (full suite): 938 pass, 6 skip, 0 fail (matches baseline)
- `bun run check:drift`: No drift detected
- Zero remaining occurrences of `require("fs")`, `readdirSync`, `existsSync`, `readFileSync`, or `import ... from "node:fs"` (sync module)
- Only fs-related import: `import { readdir } from "node:fs/promises"`

## Commits

1. `0668e2d` -- refactor(25-02): update check-drift.test imports to async
2. `b7bc3a8` -- refactor(25-02): migrate output freshness tests to async Bun.file
3. `f2884d8` -- refactor(25-02): migrate registry completeness tests to async readdir
4. `d4e5a03` -- refactor(25-02): migrate no-orphan-outputs tests to async readdir
5. `7ff2915` -- refactor(25-02): migrate plugin freshness tests to async Bun.file
6. `d57d88d` -- refactor(25-02): migrate plugin no-orphan tests to async readdir

## File Changed

- `scripts/check-drift.test.ts` -- sole file modified (1 file, ~120 lines changed)
